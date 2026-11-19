use lingforge_core::{
    project::{Motion, Preferences, ProjectMetadata, TextSize},
    ErrorCode,
};
use lingforge_storage::{import_project, Catalog, Project};
use rusqlite::Connection;
use std::{fs, io::Write, path::Path};
use zip::{write::SimpleFileOptions, ZipWriter};

fn metadata(name: &str) -> ProjectMetadata {
    ProjectMetadata {
        name: name.into(),
        language_name: "Łaŋa θa".into(),
        description: "Combining marks: ã, n̥; punctuation: <>&".into(),
    }
}

#[test]
fn metadata_and_assets_survive_reopen_and_project_isolation() {
    let parent = tempfile::tempdir().unwrap();
    let mut first = Project::create(parent.path(), &metadata("First language")).unwrap();
    let second = Project::create(parent.path(), &metadata("Second language")).unwrap();
    let id = first.summary().unwrap().id;
    let path = first.path().to_owned();
    let original_session = first.session_id().to_owned();
    let saved = first.save(&id, 0, &metadata("Renamed")).unwrap();
    assert_eq!(saved.revision, 1);
    assert_eq!(
        first.save(&id, 0, &metadata("Stale")).unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(
        first
            .save(&second.summary().unwrap().id, 1, &metadata("Wrong project"))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let asset = first
        .add_asset("character.svg", "image/svg+xml", b"<svg></svg>")
        .unwrap();
    drop(first);
    let reopened = Project::open(&path).unwrap();
    assert_ne!(reopened.session_id(), original_session);
    assert_eq!(reopened.summary().unwrap().metadata, metadata("Renamed"));
    assert_eq!(reopened.asset(&asset).unwrap(), b"<svg></svg>");
    assert_eq!(
        second.summary().unwrap().metadata,
        metadata("Second language")
    );
}

#[test]
fn a_second_writer_is_rejected_until_the_session_closes() {
    let parent = tempfile::tempdir().unwrap();
    let project = Project::create(parent.path(), &metadata("Locked")).unwrap();
    let path = project.path().to_owned();
    assert!(matches!(Project::open(&path), Err(error) if error.code == ErrorCode::Locked));
    drop(project);
    assert!(Project::open(&path).is_ok());
}

#[test]
fn backup_restore_and_archive_round_trip_keep_original_work() {
    let parent = tempfile::tempdir().unwrap();
    let unicode_parent = parent.path().join("Języki with spaces");
    fs::create_dir(&unicode_parent).unwrap();
    let mut project = Project::create(&unicode_parent, &metadata("Before")).unwrap();
    let id = project.summary().unwrap().id;
    let asset = project
        .add_asset("original glyph", "image/svg+xml", b"glyph bytes")
        .unwrap();
    let baseline = project.backup("manual").unwrap();
    let revision = project.summary().unwrap().revision;
    project.save(&id, revision, &metadata("After")).unwrap();
    let recovered = project.restore_copy(&baseline.id, parent.path()).unwrap();
    assert_ne!(recovered.summary().unwrap().id, id);
    assert_eq!(recovered.summary().unwrap().metadata, metadata("Before"));
    assert_eq!(recovered.asset(&asset).unwrap(), b"glyph bytes");
    assert_eq!(project.summary().unwrap().metadata, metadata("After"));
    let archive = parent.path().join("Portable.lingforge");
    project.export(&archive).unwrap();
    let imported = import_project(&archive, &unicode_parent, false).unwrap();
    assert_eq!(imported.summary().unwrap().id, id);
    assert_eq!(imported.summary().unwrap().metadata, metadata("After"));
    assert_eq!(imported.asset(&asset).unwrap(), b"glyph bytes");
    let duplicate = project.duplicate(parent.path()).unwrap();
    assert_ne!(duplicate.summary().unwrap().id, id);
    assert_eq!(duplicate.summary().unwrap().metadata, metadata("After"));
    let before = fs::read(&archive).unwrap();
    assert!(project.export(&archive).is_err());
    assert_eq!(fs::read(archive).unwrap(), before);
    assert!(project
        .restore_copy("../../escape.lingforge", parent.path())
        .is_err());
}

#[test]
fn failed_backup_blocks_save_and_retention_does_not_remove_manual_backups() {
    let parent = tempfile::tempdir().unwrap();
    let mut project = Project::create(parent.path(), &metadata("Original")).unwrap();
    let id = project.summary().unwrap().id;
    let backup_dir = project.path().join("backups");
    fs::remove_dir(&backup_dir).unwrap();
    fs::write(&backup_dir, b"not a directory").unwrap();
    assert!(project.save(&id, 0, &metadata("Should not save")).is_err());
    assert_eq!(project.summary().unwrap().metadata.name, "Original");
    fs::remove_file(&backup_dir).unwrap();
    fs::create_dir(&backup_dir).unwrap();
    let manual = project.backup("manual").unwrap();
    for revision in 0..12 {
        project
            .save(&id, revision, &metadata(&format!("Revision {revision}")))
            .unwrap();
    }
    let backups = project.backups().unwrap();
    assert_eq!(
        backups
            .iter()
            .filter(|backup| backup.kind == "auto")
            .count(),
        10
    );
    assert!(backups.iter().any(|backup| backup.id == manual.id));
}

fn downgrade_to_v1(path: &Path) {
    let connection = Connection::open(path.join("project.sqlite3")).unwrap();
    connection.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; DROP TABLE notebook_characters; DROP TABLE notebook_scripts; DROP TABLE notebook_phonemes; DROP TABLE notebook_lexemes; DROP TABLE notebook_records; DROP TABLE script_phoneme_references; DROP TABLE writing_systems; DROP TABLE phoneme_references; DROP TABLE phonology_profile; DROP TABLE phonemes; DROP TABLE lexical_relations; DROP TABLE lexemes; ALTER TABLE project DROP COLUMN revision; PRAGMA user_version=1;").unwrap();
}

#[test]
fn migrations_are_backed_up_and_future_versions_are_not_modified() {
    let parent = tempfile::tempdir().unwrap();
    let project = Project::create(parent.path(), &metadata("Migration")).unwrap();
    let path = project.path().to_owned();
    drop(project);
    downgrade_to_v1(&path);
    let project = Project::open(&path).unwrap();
    assert!(project
        .backups()
        .unwrap()
        .iter()
        .any(|backup| backup.kind == "migration"));
    assert_eq!(project.summary().unwrap().revision, 0);
    drop(project);
    let connection = Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute_batch("PRAGMA user_version=999;")
        .unwrap();
    drop(connection);
    let original = fs::read(path.join("project.sqlite3")).unwrap();
    assert!(
        matches!(Project::open(&path), Err(error) if error.code == ErrorCode::UnsupportedVersion)
    );
    assert_eq!(fs::read(path.join("project.sqlite3")).unwrap(), original);
}

#[test]
fn a_failed_migration_keeps_the_original_version_and_recovery_snapshot() {
    let parent = tempfile::tempdir().unwrap();
    let project = Project::create(parent.path(), &metadata("Invalid migration fixture")).unwrap();
    let path = project.path().to_owned();
    drop(project);
    // Deliberately mislabeled v1 already has revision. ALTER must fail inside
    // the migration transaction without changing user_version or metadata.
    let connection = Connection::open(path.join("project.sqlite3")).unwrap();
    connection.execute_batch("PRAGMA user_version=1;").unwrap();
    drop(connection);
    assert!(Project::open(&path).is_err());
    let connection = Connection::open(path.join("project.sqlite3")).unwrap();
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 1);
    assert!(fs::read_dir(path.join("backups"))
        .unwrap()
        .any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("migration-")));
}

fn archive_with_entries(path: &Path, names: &[&str]) {
    let mut zip = ZipWriter::new(fs::File::create(path).unwrap());
    for name in names {
        zip.start_file(*name, SimpleFileOptions::default()).unwrap();
        zip.write_all(b"invalid content").unwrap();
    }
    zip.finish().unwrap();
}

#[test]
fn malformed_or_unsafe_imports_do_not_publish_projects() {
    let parent = tempfile::tempdir().unwrap();
    let sources = tempfile::tempdir().unwrap();
    for (index, names) in [
        vec!["../escape", "project.sqlite3"],
        vec!["C:\\escape", "project.sqlite3"],
        vec!["MANIFEST.JSON", "project.sqlite3"],
        vec!["manifest.json", "project.sqlite3", "extra"],
        vec!["manifest.json", "project.sqlite3"],
    ]
    .iter()
    .enumerate()
    {
        let archive = sources.path().join(format!("bad-{index}.lingforge"));
        archive_with_entries(&archive, names);
        assert!(import_project(&archive, parent.path(), false).is_err());
        assert_eq!(fs::read_dir(parent.path()).unwrap().count(), 0);
    }
    let oversized = sources.path().join("oversized.lingforge");
    fs::File::create(&oversized)
        .unwrap()
        .set_len(258 * 1024 * 1024)
        .unwrap();
    assert!(import_project(&oversized, parent.path(), false).is_err());
}

#[test]
fn preferences_and_recents_survive_relaunch_without_becoming_project_content() {
    let parent = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let project = Project::create(parent.path(), &metadata("Catalog")).unwrap();
    let mut catalog = Catalog::open(config.path()).unwrap();
    catalog
        .remember(project.path(), &project.summary().unwrap())
        .unwrap();
    let preferences = Preferences {
        text_size: TextSize::Large,
        motion: Motion::Reduced,
    };
    catalog.save_preferences(&preferences).unwrap();
    drop(catalog);
    let catalog = Catalog::open(config.path()).unwrap();
    assert_eq!(catalog.preferences().unwrap(), preferences);
    let recent = catalog.list().unwrap();
    assert_eq!(catalog.path_for(&recent[0].token).unwrap(), project.path());
    catalog.forget(&recent[0].token).unwrap();
    assert!(catalog.list().unwrap().is_empty());
    assert!(project.path().is_dir());
    assert!(!project.path().join("workspace.sqlite3").exists());
}

#[test]
fn crash_writer_helper() {
    let Some(path) = std::env::var_os("LINGFORGE_CRASH_FIXTURE") else {
        return;
    };
    let project = Project::open(Path::new(&path)).unwrap();
    let connection = Connection::open(project.path().join("project.sqlite3")).unwrap();
    connection
        .execute_batch("BEGIN IMMEDIATE; UPDATE project SET name='Uncommitted';")
        .unwrap();
    // Intentionally skip destructors to simulate process termination mid-save.
    std::process::exit(0);
}

#[test]
fn an_interrupted_transaction_recovers_the_last_committed_save() {
    let parent = tempfile::tempdir().unwrap();
    let project = Project::create(parent.path(), &metadata("Committed")).unwrap();
    let path = project.path().to_owned();
    drop(project);
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "crash_writer_helper", "--nocapture"])
        .env("LINGFORGE_CRASH_FIXTURE", &path)
        .status()
        .unwrap();
    assert!(status.success());
    let reopened = Project::open(&path).unwrap();
    assert_eq!(reopened.summary().unwrap().metadata, metadata("Committed"));
}
