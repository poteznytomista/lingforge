use lingforge_core::{
    font::FontDraft, project::ProjectMetadata, writing::WritingSystem, ErrorCode,
};
use lingforge_storage::Project;

fn fixture() -> (tempfile::TempDir, Project, WritingSystem, FontDraft) {
    let dir = tempfile::tempdir().unwrap();
    let mut project = Project::create(
        dir.path(),
        &ProjectMetadata {
            name: "Font fixture".into(),
            language_name: String::new(),
            description: String::new(),
        },
    )
    .unwrap();
    let script: WritingSystem = serde_json::from_str(include_str!(
        "../../../tests/fixtures/fonts/simple-script.json"
    ))
    .unwrap();
    let script = project
        .save_writing_system(None, None, script.data)
        .unwrap();
    let data: FontDraft = serde_json::from_str(include_str!(
        "../../../tests/fixtures/fonts/simple-profile.json"
    ))
    .unwrap();
    (dir, project, script, data)
}
#[test]
fn save_reopen_archives_and_recovery_keep_font_and_linguistic_identities() {
    let (dir, mut project, script, data) = fixture();
    let saved = project
        .save_font_profile(&script.id, script.revision, None, data)
        .unwrap();
    let revision = project.summary().unwrap().revision;
    let backups = project.backups().unwrap().len();
    assert_eq!(
        project
            .save_font_profile(
                &script.id,
                script.revision,
                Some(saved.revision),
                saved.data.clone()
            )
            .unwrap(),
        saved
    );
    assert_eq!(project.summary().unwrap().revision, revision);
    assert_eq!(project.backups().unwrap().len(), backups);
    let mut changed = script.data.clone();
    changed.characters[0].name = "Renamed character".into();
    changed.characters[0].glyphs[0].outline.paths = vec!["M 0 0 L 200 0 L 100 400 Z".into()];
    let script = project
        .save_writing_system(Some(&script.id), Some(script.revision), changed)
        .unwrap();
    assert_eq!(
        project.font_profile(&script.id).unwrap(),
        Some(saved.clone())
    );
    let export = dir.path().join("fonts.lingforge");
    project.export(&export).unwrap();
    let imported = lingforge_storage::import_project(&export, dir.path(), false).unwrap();
    assert_eq!(
        imported.font_profile(&script.id).unwrap(),
        Some(saved.clone())
    );
    let backup = project.backup("manual").unwrap();
    let copy = project.restore_copy(&backup.id, dir.path()).unwrap();
    assert_ne!(copy.summary().unwrap().id, project.summary().unwrap().id);
    assert_eq!(copy.font_profile(&script.id).unwrap(), Some(saved.clone()));
    let path = project.path().to_owned();
    drop(project);
    let reopened = Project::open(&path).unwrap();
    assert_eq!(reopened.font_profile(&script.id).unwrap(), Some(saved));
    assert_eq!(reopened.writing_system(&script.id).unwrap(), script);
}
#[test]
fn variant_references_and_both_revisions_are_protected() {
    let (_dir, mut project, script, data) = fixture();
    let saved = project
        .save_font_profile(&script.id, script.revision, None, data)
        .unwrap();
    assert_eq!(
        project
            .save_font_profile(&script.id, script.revision, None, saved.data.clone())
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        project
            .save_font_profile(
                &script.id,
                script.revision + 1,
                Some(saved.revision),
                saved.data.clone()
            )
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let mut changed = script.data.clone();
    changed.characters[0].glyphs.clear();
    changed.characters[0].default_glyph_id = None;
    assert!(project
        .save_writing_system(Some(&script.id), Some(script.revision), changed)
        .unwrap_err()
        .message
        .contains("font glyph"));
    assert!(project
        .delete_writing_system(&script.id, script.revision)
        .unwrap_err()
        .message
        .contains("font profile"));
    assert_eq!(
        project
            .delete_font_profile(&script.id, saved.revision + 1)
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    project
        .delete_font_profile(&script.id, saved.revision)
        .unwrap();
    assert!(project.font_profile(&script.id).unwrap().is_none());
    project
        .delete_writing_system(&script.id, script.revision)
        .unwrap();
}
#[test]
fn failed_backup_and_mid_transaction_failure_leave_profiles_unchanged() {
    let (_dir, mut project, script, data) = fixture();
    let saved = project
        .save_font_profile(&script.id, script.revision, None, data)
        .unwrap();
    let mut changed = saved.data.clone();
    changed.family = "Changed".into();
    let revision = project.summary().unwrap().revision;
    let backups = project.path().join("backups");
    std::fs::rename(&backups, project.path().join("retained-backups")).unwrap();
    std::fs::write(&backups, b"blocked").unwrap();
    assert!(project
        .save_font_profile(&script.id, script.revision, Some(saved.revision), changed)
        .is_err());
    assert!(project
        .delete_font_profile(&script.id, saved.revision)
        .is_err());
    assert_eq!(project.font_profile(&script.id).unwrap(), Some(saved));
    assert_eq!(project.summary().unwrap().revision, revision);
    let (_dir, project, script, data) = fixture();
    let path = project.path().to_owned();
    drop(project);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    db.execute("UPDATE project SET revision=9007199254740991", [])
        .unwrap();
    drop(db);
    let mut project = Project::open(&path).unwrap();
    assert_eq!(
        project
            .save_font_profile(&script.id, script.revision, None, data)
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(project.font_profile(&script.id).unwrap().is_none());
}
#[test]
fn schema_six_migrates_with_snapshot_and_corrupt_font_references_are_rejected() {
    let (_dir, project, script, data) = fixture();
    let path = project.path().to_owned();
    drop(project);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    db.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; PRAGMA user_version=6;").unwrap();
    drop(db);
    let mut project = Project::open(&path).unwrap();
    assert_eq!(project.writing_system(&script.id).unwrap(), script);
    assert!(project
        .backups()
        .unwrap()
        .iter()
        .any(|b| b.kind == "migration"));
    assert!(project.font_profile(&script.id).unwrap().is_none());
    let saved = project
        .save_font_profile(&script.id, script.revision, None, data)
        .unwrap();
    drop(project);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    let mut corrupt = saved.data;
    corrupt.glyphs[0].variant_id = "00000000-0000-4000-8000-000000009999".into();
    db.execute(
        "UPDATE font_profiles SET data_json=?1",
        [serde_json::to_string(&corrupt).unwrap()],
    )
    .unwrap();
    drop(db);
    assert!(Project::open(&path).is_err());
}
#[test]
fn font_export_does_not_replace_an_existing_file_or_change_project_state() {
    let (dir, project, _script, _data) = fixture();
    let revision = project.summary().unwrap().revision;
    let path = dir.path().join("font.ttf");
    // Publication is tested independently of the font compiler in this crate.
    lingforge_storage::fonts::export_font(&path, b"fixture bytes").unwrap();
    assert!(lingforge_storage::fonts::export_font(&path, b"replacement").is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"fixture bytes");
    assert_eq!(project.summary().unwrap().revision, revision);
}
