use lingforge_core::{
    automation::*,
    lexicon::{EntryKind, Lexeme, LexemeDraft, LexicalForm, Sense},
    project::ProjectMetadata,
    ErrorCode,
};
use lingforge_storage::Project;
fn data() -> ProgramDraft {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/automation/program-v1.json"
    ))
    .unwrap()
}
fn fixture() -> (tempfile::TempDir, Project, Lexeme, Program) {
    let dir = tempfile::tempdir().unwrap();
    let mut p = Project::create(
        dir.path(),
        &ProjectMetadata {
            name: "Automation fixture".into(),
            language_name: String::new(),
            description: String::new(),
        },
    )
    .unwrap();
    let entry = p
        .save_lexeme(
            None,
            None,
            LexemeDraft {
                lemma: "kat".into(),
                pronunciation: "kat".into(),
                pronunciation_segments: vec![],
                part_of_speech: String::new(),
                kind: EntryKind::Lexeme,
                root_id: None,
                etymology: String::new(),
                notes: String::new(),
                senses: vec![Sense {
                    id: None,
                    definition: "Test-only source".into(),
                    notes: String::new(),
                }],
                forms: vec![],
                relations: vec![],
            },
        )
        .unwrap()
        .entry;
    let program = p.save_automation(None, None, data()).unwrap();
    (dir, p, entry, program)
}
fn prepare(
    p: &Project,
    entry: &Lexeme,
    program: &Program,
) -> lingforge_storage::automation::Prepared {
    p.prepare_automation(
        &program.id,
        program.revision,
        std::slice::from_ref(&entry.id),
        &[program.data.cells[0].id.clone()],
    )
    .unwrap()
}
#[test]
fn generated_batches_preserve_authored_forms_and_provenance_through_reopen_transfer_and_reversal() {
    let (dir, mut p, entry, program) = fixture();
    let preview = prepare(&p, &entry, &program);
    let batch = p.apply_automation(&preview, &[0]).unwrap();
    assert_eq!(
        batch.data.rows[0].evaluation.as_ref().unwrap().output,
        "kati"
    );
    assert_eq!(p.lexeme(&entry.id).unwrap().entry.data, entry.data);
    assert!(p.delete_lexeme(&entry.id, entry.revision).is_err());
    assert!(p.delete_automation(&program.id, program.revision).is_err());
    let mut changed = entry.data.clone();
    changed.lemma = "renamed".into();
    let entry = p
        .save_lexeme(Some(&entry.id), Some(entry.revision), changed)
        .unwrap()
        .entry;
    let mut changed = program.data.clone();
    changed.rules[0].name = "Renamed rule".into();
    let program = p
        .save_automation(Some(&program.id), Some(program.revision), changed)
        .unwrap();
    assert_eq!(
        p.automation_batch(&batch.id).unwrap().data.rows[0]
            .source
            .lemma,
        "kat"
    );
    let archive = dir.path().join("automation.lingforge");
    p.export(&archive).unwrap();
    let copy = lingforge_storage::import_project(&archive, dir.path(), false).unwrap();
    assert_eq!(
        copy.automation_batch(&batch.id).unwrap().data.rows,
        batch.data.rows
    );
    let backup = p.backup("manual").unwrap();
    let recovered = p.restore_copy(&backup.id, dir.path()).unwrap();
    assert_eq!(
        recovered.automation_batch(&batch.id).unwrap().data.program,
        batch.data.program
    );
    let path = p.path().to_owned();
    drop(p);
    let mut p = Project::open(&path).unwrap();
    p.revert_automation(&batch.id).unwrap();
    assert!(p.automation_index().unwrap().batches.is_empty());
    assert_eq!(p.lexeme(&entry.id).unwrap().entry.data, entry.data);
    p.delete_automation(&program.id, program.revision).unwrap();
    p.delete_lexeme(&entry.id, entry.revision).unwrap();
}
#[test]
fn no_op_revisions_stale_previews_conflicts_and_overrides_are_checked() {
    let (_dir, mut p, entry, program) = fixture();
    let revision = p.summary().unwrap().revision;
    let backups = p.backups().unwrap().len();
    assert_eq!(
        p.save_automation(
            Some(&program.id),
            Some(program.revision),
            program.data.clone()
        )
        .unwrap(),
        program
    );
    assert_eq!(p.summary().unwrap().revision, revision);
    assert_eq!(p.backups().unwrap().len(), backups);
    assert!(p
        .save_automation(
            Some(&program.id),
            Some(program.revision + 1),
            program.data.clone()
        )
        .is_err());
    let preview = prepare(&p, &entry, &program);
    let mut changed = entry.data.clone();
    changed.forms.push(LexicalForm {
        id: None,
        text: "kati".into(),
        label: "Plural".into(),
        pronunciation: String::new(),
        pronunciation_segments: vec![],
    });
    let entry = p
        .save_lexeme(Some(&entry.id), Some(entry.revision), changed)
        .unwrap()
        .entry;
    assert_eq!(
        p.apply_automation(&preview, &[0]).unwrap_err().code,
        ErrorCode::Conflict
    );
    let preview = prepare(&p, &entry, &program);
    assert!(!preview.preview().rows[0].conflicts.is_empty());
    assert!(p.apply_automation(&preview, &[0]).is_err());
    let mut changed = program.data.clone();
    changed.overrides.push(Irregular {
        entry_id: entry.id.clone(),
        cell_id: program.data.cells[0].id.clone(),
        output: "irregular".into(),
        reason: "Authored reason".into(),
    });
    let saved = p
        .save_automation(Some(&program.id), Some(program.revision), changed)
        .unwrap();
    assert!(p
        .delete_lexeme(&entry.id, entry.revision)
        .unwrap_err()
        .message
        .contains("Automation"));
    assert!(p
        .prepare_automation(
            &saved.id,
            saved.revision,
            &[entry.id.clone(), entry.id.clone()],
            &[saved.data.cells[0].id.clone()]
        )
        .is_err());
    p.delete_automation(&saved.id, saved.revision).unwrap();
    p.delete_lexeme(&entry.id, entry.revision).unwrap();
}
#[test]
fn selected_rows_are_explicit_duplicate_cells_block_and_failed_backup_retains_state() {
    let (_dir, mut p, entry, program) = fixture();
    let preview = prepare(&p, &entry, &program);
    assert!(p.apply_automation(&preview, &[]).is_err());
    assert!(p.apply_automation(&preview, &[0, 0]).is_err());
    assert!(p.apply_automation(&preview, &[99]).is_err());
    let batch = p.apply_automation(&preview, &[0]).unwrap();
    let next = prepare(&p, &entry, &program);
    assert!(!next.preview().rows[0].conflicts.is_empty());
    let revision = p.summary().unwrap().revision;
    let backups = p.path().join("backups");
    std::fs::rename(&backups, p.path().join("retained")).unwrap();
    std::fs::write(&backups, b"blocked").unwrap();
    assert!(p.revert_automation(&batch.id).is_err());
    assert_eq!(p.summary().unwrap().revision, revision);
    assert_eq!(
        p.automation_batch(&batch.id).unwrap().data.rows,
        batch.data.rows
    );
    let mut changed = program.data.clone();
    changed.name = "Unsaved".into();
    assert!(p
        .save_automation(Some(&program.id), Some(program.revision), changed)
        .is_err());
    assert_eq!(p.automation_program(&program.id).unwrap(), program);
}
#[test]
fn schema_seven_migration_has_snapshot_and_reference_corruption_is_rejected() {
    let (_dir, p, entry, program) = fixture();
    let path = p.path().to_owned();
    drop(p);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    db.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; PRAGMA user_version=7;").unwrap();
    drop(db);
    let mut p = Project::open(&path).unwrap();
    assert!(p.backups().unwrap().iter().any(|b| b.kind == "migration"));
    assert_eq!(p.lexeme(&entry.id).unwrap().entry.data, entry.data);
    let program = p.save_automation(None, None, program.data).unwrap();
    let batch = p
        .apply_automation(&prepare(&p, &entry, &program), &[0])
        .unwrap();
    drop(p);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    db.execute("DELETE FROM automation_cells WHERE batch_id=?1", [batch.id])
        .unwrap();
    drop(db);
    assert!(Project::open(&path).is_err());
}
#[test]
fn mid_transaction_failure_rolls_back_batch_and_projection() {
    let (_dir, p, entry, program) = fixture();
    let path = p.path().to_owned();
    drop(p);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    db.execute("UPDATE project SET revision=9007199254740991", [])
        .unwrap();
    drop(db);
    let mut p = Project::open(&path).unwrap();
    let preview = prepare(&p, &entry, &program);
    assert_eq!(
        p.apply_automation(&preview, &[0]).unwrap_err().code,
        ErrorCode::Conflict
    );
    assert!(p.automation_index().unwrap().batches.is_empty());
    drop(p);
    assert!(Project::open(&path).is_ok());
}
#[test]
fn only_selected_cells_are_applied_and_a_reopened_session_rejects_old_previews() {
    let (_dir, mut p, entry, program) = fixture();
    let mut changed = program.data.clone();
    let mut second = changed.cells[0].clone();
    second.id = "00000000-0000-4000-8000-000000000200".into();
    second.name = "Derivation".into();
    second.kind = CellKind::Derivation;
    changed.cells.push(second);
    let program = p
        .save_automation(Some(&program.id), Some(program.revision), changed)
        .unwrap();
    let cells = program
        .data
        .cells
        .iter()
        .map(|c| c.id.clone())
        .collect::<Vec<_>>();
    let prepared = p
        .prepare_automation(
            &program.id,
            program.revision,
            std::slice::from_ref(&entry.id),
            &cells,
        )
        .unwrap();
    let batch = p.apply_automation(&prepared, &[1]).unwrap();
    assert_eq!(batch.data.rows.len(), 1);
    assert_eq!(batch.data.rows[0].cell_id, cells[1]);
    let prepared = prepare(&p, &entry, &program);
    let path = p.path().to_owned();
    drop(p);
    let mut p = Project::open(&path).unwrap();
    assert_eq!(
        p.apply_automation(&prepared, &[0]).unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(p.automation_index().unwrap().batches.len(), 1);
}
#[test]
fn tampered_derivations_and_override_projections_are_rejected_on_open() {
    let (_dir, mut p, entry, program) = fixture();
    let batch = p
        .apply_automation(&prepare(&p, &entry, &program), &[0])
        .unwrap();
    let path = p.path().to_owned();
    drop(p);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    let mut corrupt = serde_json::to_value(&batch.data).unwrap();
    corrupt["rows"][0]["evaluation"]["output"] = serde_json::json!("fabricated");
    db.execute(
        "UPDATE automation_batches SET data_json=?1 WHERE id=?2",
        rusqlite::params![serde_json::to_string(&corrupt).unwrap(), batch.id],
    )
    .unwrap();
    drop(db);
    assert!(Project::open(&path).is_err());
    let (_dir, mut p, entry, program) = fixture();
    let mut changed = program.data.clone();
    changed.overrides.push(Irregular {
        entry_id: entry.id.clone(),
        cell_id: changed.cells[0].id.clone(),
        output: "irregular".into(),
        reason: "Historical stem".into(),
    });
    p.save_automation(Some(&program.id), Some(program.revision), changed)
        .unwrap();
    let path = p.path().to_owned();
    drop(p);
    let db = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    db.execute("DELETE FROM automation_overrides", []).unwrap();
    drop(db);
    assert!(Project::open(&path).is_err());
}
