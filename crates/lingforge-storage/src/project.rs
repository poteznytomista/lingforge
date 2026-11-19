use crate::{
    archive, database, invalid, io, now, plain_directory, regular_file, sql, sync_directory, Result,
};
use fs2::FileExt;
use lingforge_core::{
    project::{ProjectMetadata, ProjectSummary},
    AppError, ErrorCode,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub(crate) const DATABASE: &str = "project.sqlite3";
pub(crate) const MANIFEST: &str = "manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub project_id: String,
}

impl Manifest {
    pub(crate) fn new(id: String) -> Self {
        Self {
            format: "lingforge-project".into(),
            format_version: 1,
            project_id: id,
        }
    }

    pub(crate) fn validate(&self) -> Result<()> {
        if self.format != "lingforge-project"
            || Uuid::parse_str(&self.project_id)
                .map(|id| id.to_string())
                .ok()
                .as_deref()
                != Some(self.project_id.as_str())
        {
            return Err(invalid("The project manifest is invalid."));
        }
        if self.format_version != 1 {
            return Err(AppError::new(
                ErrorCode::UnsupportedVersion,
                "This project format requires a different LingForge version.",
            ));
        }
        Ok(())
    }
}

pub struct Project {
    pub(crate) connection: Connection,
    pub(crate) root: PathBuf,
    pub(crate) manifest: Manifest,
    session_id: String,
    // Keep the handle for the complete session. Never unlink a lock file: doing
    // so would let a second process lock a new inode while this lock is held.
    _lock: File,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub created_at: i64,
    pub kind: String,
    pub bytes: u64,
}

impl Project {
    pub fn create(parent: &Path, metadata: &ProjectMetadata) -> Result<Self> {
        metadata.validate()?;
        plain_directory(parent)?;
        let staging = tempfile::Builder::new()
            .prefix("LingForge-")
            .tempdir_in(parent)
            .map_err(io)?;
        let id = Uuid::new_v4().to_string();
        let mut connection = database::connect(&staging.path().join(DATABASE), true)?;
        database::initialize(&mut connection, &id, metadata)?;
        connection.close().map_err(|(_, error)| sql(error))?;
        write_manifest(staging.path(), &Manifest::new(id))?;
        let project = Self::open(staging.path())?;
        let _ = staging.keep();
        sync_directory(parent)?;
        Ok(project)
    }

    pub fn open(root: &Path) -> Result<Self> {
        plain_directory(root)?;
        let root = fs::canonicalize(root).map_err(io)?;
        regular_file(&root.join(MANIFEST))?;
        if fs::metadata(root.join(MANIFEST)).map_err(io)?.len() > 16 * 1024 {
            return Err(invalid("The project manifest exceeds its 16 KiB limit."));
        }
        let manifest: Manifest =
            serde_json::from_reader(File::open(root.join(MANIFEST)).map_err(io)?.take(16 * 1024))
                .map_err(|_| invalid("The project manifest cannot be read."))?;
        manifest.validate()?;
        regular_file(&root.join(DATABASE))?;
        if fs::metadata(root.join(DATABASE)).map_err(io)?.len() > database::MAX_DATABASE {
            return Err(invalid(
                "This project exceeds the current 256 MiB database limit.",
            ));
        }
        // Refuse redirected lock files and SQLite recovery sidecars.
        for name in [
            ".lingforge.lock",
            "project.sqlite3-journal",
            "project.sqlite3-wal",
            "project.sqlite3-shm",
        ] {
            let path = root.join(name);
            if fs::symlink_metadata(&path).is_ok() {
                regular_file(&path)?;
            }
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join(".lingforge.lock"))
            .map_err(io)?;
        FileExt::try_lock_exclusive(&lock).map_err(|_| AppError::new(ErrorCode::Locked, "This project is open in another LingForge instance, or its lock cannot be acquired."))?;
        let mut connection = database::connect(&root.join(DATABASE), false)?;
        let version = database::inspect(&connection)?;
        let stored_id: String = connection
            .query_row("SELECT id FROM project WHERE singleton=1", [], |row| {
                row.get(0)
            })
            .map_err(sql)?;
        if stored_id != manifest.project_id {
            return Err(invalid(
                "The manifest and database belong to different projects.",
            ));
        }
        let backups = root.join("backups");
        if backups.exists() {
            plain_directory(&backups)?;
        } else {
            fs::create_dir(&backups).map_err(io)?;
        }
        if version < database::SCHEMA {
            // Snapshot first. A failed backup prevents migration entirely.
            let name = backup_name("migration");
            archive::export_connection(&connection, &manifest, &backups.join(name))?;
            database::migrate(&mut connection)?;
        }
        database::summary(&connection)?;
        validate_assets(&connection)?;
        // Rollback journaling avoids independent WAL sidecars in a moved folder.
        let journal: String = connection
            .query_row("PRAGMA journal_mode=DELETE", [], |row| row.get(0))
            .map_err(sql)?;
        if journal != "delete" {
            return Err(invalid(
                "The project could not enter its required safe journal mode.",
            ));
        }
        Ok(Self {
            connection,
            root,
            manifest,
            session_id: Uuid::new_v4().to_string(),
            _lock: lock,
        })
    }

    pub fn summary(&self) -> Result<ProjectSummary> {
        database::summary(&self.connection)
    }
    pub fn path(&self) -> &Path {
        &self.root
    }
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn save(
        &mut self,
        expected_id: &str,
        revision: i64,
        metadata: &ProjectMetadata,
    ) -> Result<ProjectSummary> {
        self.expect_project(expected_id)?;
        metadata.validate()?;
        let previous = self.summary()?;
        if previous.revision != revision {
            return Err(conflict());
        }
        if previous.metadata == *metadata {
            return Ok(previous);
        }
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(sql)?;
        let changed = transaction.execute(
            "UPDATE project SET name=?1, language_name=?2, description=?3, updated_at=?4, revision=revision+1 WHERE singleton=1 AND id=?5 AND revision=?6",
            params![metadata.name, metadata.language_name, metadata.description, now(), expected_id, revision],
        ).map_err(sql)?;
        if changed != 1 {
            return Err(conflict());
        }
        transaction.commit().map_err(sql)?;
        self.summary()
    }

    pub fn expect_project(&self, id: &str) -> Result<()> {
        if self.manifest.project_id != id {
            return Err(conflict());
        }
        Ok(())
    }

    pub fn export(&self, destination: &Path) -> Result<()> {
        archive::export_connection(&self.connection, &self.manifest, destination)
    }

    pub fn backup(&self, kind: &str) -> Result<BackupInfo> {
        if !matches!(kind, "auto" | "manual") {
            return Err(invalid("Unknown backup type."));
        }
        let directory = self.root.join("backups");
        plain_directory(&directory)?;
        let name = backup_name(kind);
        self.export(&directory.join(&name))?;
        // Cleanup failure is not a save failure. Extra backups are harmless.
        if kind == "auto" {
            let _ = self.prune_automatic_backups(&name);
        }
        self.backups()?
            .into_iter()
            .find(|item| item.id == name)
            .ok_or_else(|| invalid("The new backup could not be listed."))
    }

    pub fn backups(&self) -> Result<Vec<BackupInfo>> {
        let directory = self.root.join("backups");
        plain_directory(&directory)?;
        let mut result = Vec::new();
        for entry in fs::read_dir(&directory).map_err(io)? {
            let entry = entry.map_err(io)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some((kind, time)) = parse_backup_name(&name) {
                if entry.file_type().map_err(io)?.is_file() {
                    result.push(BackupInfo {
                        id: name,
                        created_at: time,
                        kind,
                        bytes: entry.metadata().map_err(io)?.len(),
                    });
                }
            }
        }
        result.sort_by(|a, b| b.id.cmp(&a.id));
        result.sort_by_key(|a| std::cmp::Reverse(a.created_at));
        Ok(result)
    }

    fn prune_automatic_backups(&self, newest: &str) -> Result<()> {
        // Protect the snapshot just created even when timestamps tie or the
        // system clock moves backwards. Keep it plus nine previous snapshots.
        for backup in self
            .backups()?
            .into_iter()
            .filter(|item| item.kind == "auto" && item.id != newest)
            .skip(9)
        {
            fs::remove_file(self.root.join("backups").join(backup.id)).map_err(io)?;
        }
        Ok(())
    }

    pub fn restore_copy(&self, backup_id: &str, parent: &Path) -> Result<Self> {
        // Never accept a relative path from the webview as a backup identifier.
        if !self.backups()?.iter().any(|item| item.id == backup_id) {
            return Err(invalid("Select an existing backup of this project."));
        }
        archive::import_project(&self.root.join("backups").join(backup_id), parent, true)
    }

    pub fn duplicate(&self, parent: &Path) -> Result<Self> {
        let temporary = tempfile::tempdir().map_err(io)?;
        let archive = temporary.path().join("copy.lingforge");
        self.export(&archive)?;
        archive::import_project(&archive, parent, true)
    }

    /// Assets are immutable blobs with portable logical paths, never user paths.
    /// Future script editors use the returned ID; no asset is executed/rendered here.
    pub fn add_asset(
        &mut self,
        display_name: &str,
        media_type: &str,
        bytes: &[u8],
    ) -> Result<String> {
        if display_name.is_empty()
            || display_name.chars().count() > 255
            || display_name.chars().any(char::is_control)
            || media_type.is_empty()
            || media_type.len() > 120
            || !media_type.is_ascii()
            || media_type.chars().any(char::is_control)
            || bytes.len() > 16 * 1024 * 1024
        {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Invalid asset name, type, or size (maximum 16 MiB).",
            ));
        }
        let (count, total): (i64, i64) = self
            .connection
            .query_row(
                "SELECT count(*), coalesce(sum(length(data)),0) FROM assets",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(sql)?;
        if count >= 1024 || total + bytes.len() as i64 > 128 * 1024 * 1024 {
            return Err(invalid("The project asset limit has been reached."));
        }
        self.backup("auto")?;
        let id = Uuid::new_v4().to_string();
        let transaction = self.connection.transaction().map_err(sql)?;
        transaction
            .execute(
                "INSERT INTO assets VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, format!("assets/{id}"), display_name, media_type, bytes],
            )
            .map_err(sql)?;
        transaction
            .execute(
                "UPDATE project SET revision=revision+1, updated_at=?1 WHERE singleton=1",
                [now()],
            )
            .map_err(sql)?;
        transaction.commit().map_err(sql)?;
        Ok(id)
    }

    pub fn asset(&self, id: &str) -> Result<Vec<u8>> {
        self.connection
            .query_row("SELECT data FROM assets WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .map_err(sql)
    }
}

pub(crate) fn write_manifest(root: &Path, manifest: &Manifest) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|_| invalid("Cannot encode project manifest."))?;
    let mut temporary = tempfile::NamedTempFile::new_in(root).map_err(io)?;
    temporary.write_all(&bytes).map_err(io)?;
    temporary.as_file().sync_all().map_err(io)?;
    temporary
        .persist_noclobber(root.join(MANIFEST))
        .map_err(|error| io(error.error))?;
    sync_directory(root)
}

pub(crate) fn validate_assets(connection: &Connection) -> Result<()> {
    let (count, total, biggest): (i64, i64, i64) = connection.query_row("SELECT count(*), coalesce(sum(length(data)),0), coalesce(max(length(data)),0) FROM assets", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).map_err(sql)?;
    if count > 1024 || total > 128 * 1024 * 1024 || biggest > 16 * 1024 * 1024 {
        return Err(invalid("The archive exceeds the current asset limits."));
    }
    let mut statement = connection
        .prepare("SELECT id, logical_path, display_name, media_type FROM assets")
        .map_err(sql)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(sql)?;
    for row in rows {
        let (id, path, name, media_type) = row.map_err(sql)?;
        if Uuid::parse_str(&id)
            .map(|id| id.to_string())
            .ok()
            .as_deref()
            != Some(id.as_str())
            || path != format!("assets/{id}")
        {
            return Err(invalid("The archive contains an invalid asset path."));
        }
        if name.is_empty()
            || name.chars().count() > 255
            || name.chars().any(char::is_control)
            || media_type.is_empty()
            || media_type.len() > 120
            || !media_type.is_ascii()
            || media_type.chars().any(char::is_control)
        {
            return Err(invalid("The archive contains invalid asset metadata."));
        }
    }
    Ok(())
}

fn backup_name(kind: &str) -> String {
    format!("{kind}-{:020}-{}.lingforge", now(), Uuid::new_v4())
}
fn parse_backup_name(name: &str) -> Option<(String, i64)> {
    let stem = name.strip_suffix(".lingforge")?;
    let (kind, rest) = stem.split_once('-')?;
    if !matches!(kind, "auto" | "manual" | "migration") {
        return None;
    }
    let (time, id) = rest.split_once('-')?;
    if time.len() != 20
        || !time.bytes().all(|byte| byte.is_ascii_digit())
        || Uuid::parse_str(id).is_err()
    {
        return None;
    }
    Some((kind.to_string(), time.parse().ok()?))
}
fn conflict() -> AppError {
    AppError::new(
        ErrorCode::Conflict,
        "The active project or its revision changed. Reopen it before saving again.",
    )
}
