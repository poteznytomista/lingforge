use crate::{
    database, invalid, io, plain_directory,
    project::{write_manifest, Manifest, Project, DATABASE, MANIFEST},
    regular_file, sql, sync_directory, Result,
};
use rusqlite::Connection;
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub(crate) fn export_connection(
    connection: &Connection,
    manifest: &Manifest,
    destination: &Path,
) -> Result<()> {
    if destination.exists() {
        return Err(invalid(
            "An archive already exists at this location. Choose a different filename.",
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| invalid("Choose an archive destination."))?;
    plain_directory(parent)?;
    let scratch = tempfile::tempdir_in(parent).map_err(io)?;
    let database_path = scratch.path().join(DATABASE);
    database::snapshot(connection, &database_path)?;
    if fs::metadata(&database_path).map_err(io)?.len() > database::MAX_DATABASE {
        return Err(invalid(
            "The snapshot exceeds the current project size limit.",
        ));
    }
    let mut output = tempfile::NamedTempFile::new_in(parent).map_err(io)?;
    {
        let mut writer = ZipWriter::new(output.as_file_mut());
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o600);
        writer
            .start_file(MANIFEST, options)
            .map_err(|_| invalid("Cannot write archive manifest."))?;
        writer
            .write_all(
                &serde_json::to_vec_pretty(manifest)
                    .map_err(|_| invalid("Cannot encode manifest."))?,
            )
            .map_err(io)?;
        writer
            .start_file(DATABASE, options)
            .map_err(|_| invalid("Cannot write archive database."))?;
        std::io::copy(&mut File::open(&database_path).map_err(io)?, &mut writer).map_err(io)?;
        writer
            .finish()
            .map_err(|_| invalid("Cannot finish project archive."))?;
    }
    output.as_file().sync_all().map_err(io)?;
    output
        .persist_noclobber(destination)
        .map_err(|error| io(error.error))?;
    sync_directory(parent)
}

pub fn import_project(source: &Path, parent: &Path, new_identity: bool) -> Result<Project> {
    regular_file(source)?;
    plain_directory(parent)?;
    if fs::metadata(source).map_err(io)?.len() > database::MAX_DATABASE + 1024 * 1024 {
        return Err(invalid(
            "This archive exceeds the current project size limit.",
        ));
    }
    let mut archive = ZipArchive::new(File::open(source).map_err(io)?)
        .map_err(|_| invalid("Select a valid .lingforge archive."))?;
    if archive.len() != 2 {
        return Err(invalid(
            "The archive must contain only manifest.json and project.sqlite3.",
        ));
    }
    let staging = tempfile::Builder::new()
        .prefix("LingForge-")
        .tempdir_in(parent)
        .map_err(io)?;
    let mut seen = HashSet::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| invalid("Cannot read an archive entry."))?;
        let name = entry
            .name()
            .map_err(|_| invalid("An archive filename is invalid."))?
            .into_owned();
        // An allowlist avoids path traversal, absolute/drive paths, backslashes,
        // case collisions, duplicate entries, symlinks, and platform device names.
        if !matches!(name.as_str(), MANIFEST | DATABASE)
            || !seen.insert(name.clone())
            || entry.is_dir()
            || entry.is_symlink()
            || entry.encrypted()
        {
            return Err(invalid(
                "The archive contains unsupported or unsafe entries.",
            ));
        }
        let limit = if name == MANIFEST {
            16 * 1024
        } else {
            database::MAX_DATABASE
        };
        if entry.size() > limit {
            return Err(invalid("An archive entry exceeds its allowed size."));
        }
        let mut output = File::create(staging.path().join(&name)).map_err(io)?;
        let copied = std::io::copy(&mut Read::by_ref(&mut entry).take(limit + 1), &mut output)
            .map_err(io)?;
        if copied > limit {
            return Err(invalid("The archive expands beyond its allowed size."));
        }
        output.sync_all().map_err(io)?;
    }
    let mut project = Project::open(staging.path())?;
    if new_identity {
        let id = uuid::Uuid::new_v4().to_string();
        // This is a private staging directory; neither file is published until
        // the complete copy validates. All internal asset identities are kept.
        project.connection.execute("UPDATE project SET id=?1, revision=0, created_at=?2, updated_at=?2 WHERE singleton=1", rusqlite::params![id, crate::now()]).map_err(sql)?;
        project.manifest = Manifest::new(id);
        fs::remove_file(staging.path().join(MANIFEST)).map_err(io)?;
        write_manifest(staging.path(), &project.manifest)?;
    }
    project.summary()?;
    let _ = staging.keep();
    sync_directory(parent)?;
    Ok(project)
}
