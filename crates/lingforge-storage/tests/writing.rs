use lingforge_core::{
    glyph::import_svg,
    phonology::{Articulation, PhonemeDraft, PhonemeKind},
    project::ProjectMetadata,
    writing::{Character, GlyphVariant, InputMapping, ScriptDraft, TextUnit},
    ErrorCode,
};
use lingforge_storage::Project;
use uuid::Uuid;

fn project() -> (tempfile::TempDir, Project) {
    let dir = tempfile::tempdir().unwrap();
    let project = Project::create(
        dir.path(),
        &ProjectMetadata {
            name: "Alphabet fixture".into(),
            language_name: String::new(),
            description: String::new(),
        },
    )
    .unwrap();
    (dir, project)
}
fn script(phoneme_id: Option<&str>) -> ScriptDraft {
    let character_id = Uuid::new_v4().to_string();
    let glyph_id = Uuid::new_v4().to_string();
    ScriptDraft { name: "My alphabet".into(), notes: "Experimental fixture".into(), characters: vec![Character {
        id: character_id.clone(), name: "Character one".into(), transliteration: "th".into(), phoneme_ids: phoneme_id.into_iter().map(str::to_owned).collect(),
        glyphs: vec![GlyphVariant { id: glyph_id.clone(), name: "Outline".into(), outline: import_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 0 0 L 50 100 L 100 0 Z"/></svg>"#).unwrap() }], default_glyph_id: Some(glyph_id),
    }], mappings: vec![InputMapping { id: Uuid::new_v4().to_string(), input: "th".into(), character_ids: vec![character_id.clone()] }], sample: vec![TextUnit::Text { text: "ã".into() }, TextUnit::Symbol { character_id }] }
}
#[test]
fn glyph_replacement_keeps_symbol_text_and_round_trips_in_archives() {
    let (dir, mut project) = project();
    let original = project
        .save_writing_system(None, None, script(None))
        .unwrap();
    let mut data = original.data.clone();
    data.characters[0].name = "Renamed".into();
    data.characters[0].glyphs[0].outline.paths = vec!["M 0 0 L 100 100 L 0 100 Z".into()];
    let changed = project
        .save_writing_system(Some(&original.id), Some(original.revision), data)
        .unwrap();
    assert_eq!(changed.data.sample, original.data.sample);
    assert_eq!(
        changed.data.characters[0].id,
        original.data.characters[0].id
    );
    assert_eq!(
        project
            .save_writing_system(
                Some(&original.id),
                Some(original.revision),
                original.data.clone()
            )
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let revision = project.summary().unwrap().revision;
    assert_eq!(
        project
            .save_writing_system(
                Some(&changed.id),
                Some(changed.revision),
                changed.data.clone()
            )
            .unwrap()
            .revision,
        changed.revision
    );
    assert_eq!(project.summary().unwrap().revision, revision);
    let archive = dir.path().join("alphabet.lingforge");
    project.export(&archive).unwrap();
    let imported = lingforge_storage::import_project(&archive, dir.path(), false).unwrap();
    assert_eq!(
        imported.writing_system(&changed.id).unwrap().data,
        changed.data
    );
    let backup = project.backup("manual").unwrap();
    let recovered = project.restore_copy(&backup.id, dir.path()).unwrap();
    assert_ne!(
        recovered.summary().unwrap().id,
        project.summary().unwrap().id
    );
    assert_eq!(
        recovered.writing_system(&changed.id).unwrap().data,
        changed.data
    );
    let path = project.path().to_owned();
    drop(project);
    assert_eq!(
        Project::open(&path)
            .unwrap()
            .writing_system(&changed.id)
            .unwrap()
            .data,
        changed.data
    );
}
#[test]
fn phoneme_links_block_deletion_and_are_checked_against_source_json() {
    let (_dir, mut project) = project();
    let phoneme = project
        .save_phoneme(
            None,
            None,
            PhonemeDraft {
                label: "θ".into(),
                kind: PhonemeKind::Consonant,
                articulation: Articulation::default(),
                features: Vec::new(),
                allophones: Vec::new(),
                notes: String::new(),
            },
        )
        .unwrap()
        .phoneme;
    let saved = project
        .save_writing_system(None, None, script(Some(&phoneme.id)))
        .unwrap();
    let details = project.phoneme(&phoneme.id).unwrap();
    assert_eq!(details.script_incoming_count, 1);
    assert_eq!(details.script_incoming[0].script_id, saved.id);
    assert!(project
        .delete_phoneme(&phoneme.id, phoneme.revision)
        .is_err());
    let mut data = saved.data.clone();
    data.characters.clear();
    assert!(project
        .save_writing_system(Some(&saved.id), Some(saved.revision), data)
        .is_err());
    project
        .delete_writing_system(&saved.id, saved.revision)
        .unwrap();
    assert_eq!(
        project.phoneme(&phoneme.id).unwrap().script_incoming_count,
        0
    );
    project.save_writing_system(None, None, saved.data).unwrap();
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute("DELETE FROM script_phoneme_references", [])
        .unwrap();
    drop(connection);
    assert!(Project::open(&path).is_err());
}
#[test]
fn failure_after_inserting_a_script_rolls_back_its_data_and_links() {
    let (_dir, mut project) = project();
    let phoneme = project
        .save_phoneme(
            None,
            None,
            PhonemeDraft {
                label: "ŋ".into(),
                kind: PhonemeKind::Consonant,
                articulation: Articulation::default(),
                features: Vec::new(),
                allophones: Vec::new(),
                notes: String::new(),
            },
        )
        .unwrap()
        .phoneme;
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute("UPDATE project SET revision=9007199254740991", [])
        .unwrap();
    drop(connection);
    let mut project = Project::open(&path).unwrap();
    // The script and its projection are inserted before advancing the project
    // revision fails. Dropping the transaction must roll back both insertions.
    assert_eq!(
        project
            .save_writing_system(None, None, script(Some(&phoneme.id)))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(project.writing_systems().unwrap().is_empty());
    assert_eq!(
        project.phoneme(&phoneme.id).unwrap().script_incoming_count,
        0
    );
    assert_eq!(project.summary().unwrap().revision, 9_007_199_254_740_991);
}
#[test]
fn backup_failure_prevents_writing_changes_and_delete() {
    let (_dir, mut project) = project();
    let saved = project
        .save_writing_system(None, None, script(None))
        .unwrap();
    let revision = project.summary().unwrap().revision;
    let mut data = saved.data.clone();
    data.name = "Changed".into();
    let backups = project.path().join("backups");
    std::fs::rename(&backups, project.path().join("kept-backups")).unwrap();
    std::fs::write(&backups, b"blocked").unwrap();
    assert!(project
        .save_writing_system(Some(&saved.id), Some(saved.revision), data)
        .is_err());
    assert!(project
        .delete_writing_system(&saved.id, saved.revision)
        .is_err());
    assert_eq!(project.summary().unwrap().revision, revision);
    assert_eq!(project.writing_system(&saved.id).unwrap().data, saved.data);
}
#[test]
fn schema_four_migrates_with_a_backup_and_preserves_existing_phonology() {
    let (_dir, mut project) = project();
    let profile = project
        .save_phonology_profile(
            0,
            lingforge_core::phonology::PhonologyDraft {
                notes: "Keep this earlier phonology".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let summary = project.summary().unwrap();
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; DROP TABLE notebook_characters; DROP TABLE notebook_scripts; DROP TABLE notebook_phonemes; DROP TABLE notebook_lexemes; DROP TABLE notebook_records; DROP TABLE script_phoneme_references; DROP TABLE writing_systems; PRAGMA user_version=4;").unwrap();
    drop(connection);
    let project = Project::open(&path).unwrap();
    assert_eq!(project.summary().unwrap().id, summary.id);
    assert!(project.writing_systems().unwrap().is_empty());
    assert_eq!(project.phonology_inventory("").unwrap().total, 0);
    assert_eq!(
        project.phonology_inventory("").unwrap().profile.data,
        profile.data
    );
    assert!(project
        .backups()
        .unwrap()
        .iter()
        .any(|b| b.kind == "migration"));
}

#[test]
fn authored_geometry_preserves_variants_documents_snapshots_and_svg_round_trips() {
    use lingforge_core::{
        glyph_edit::{edit, EditableOutline, GlyphOperation},
        notebook::{DocumentDraft, NotebookDraft, Paragraph},
    };
    let (dir, mut project) = project();
    let original = project
        .save_writing_system(None, None, script(None))
        .unwrap();
    let document = project
        .save_notebook_record(
            &Uuid::new_v4().to_string(),
            None,
            NotebookDraft::Document(DocumentDraft {
                title: "Existing text".into(),
                notes: String::new(),
                paragraphs: vec![Paragraph {
                    id: Uuid::new_v4().to_string(),
                    script_id: Some(original.id.clone()),
                    units: original.data.sample.clone(),
                    links: vec![],
                }],
            }),
        )
        .unwrap();
    let model =
        EditableOutline::from_outline(&original.data.characters[0].glyphs[0].outline).unwrap();
    let edited = edit(
        &model,
        GlyphOperation::MovePoint {
            path: 0,
            command: 1,
            point: 0,
            position: [65.0, 90.0],
            grid: 5.0,
        },
    )
    .unwrap();
    let mut data = original.data.clone();
    data.characters[0].glyphs[0].outline = edited.to_outline().unwrap();
    let saved = project
        .save_writing_system(Some(&original.id), Some(original.revision), data)
        .unwrap();
    assert_eq!(saved.id, original.id);
    assert_eq!(saved.data.characters[0].id, original.data.characters[0].id);
    assert_eq!(
        saved.data.characters[0].glyphs[0].id,
        original.data.characters[0].glyphs[0].id
    );
    assert_eq!(saved.data.sample, original.data.sample);
    assert_eq!(project.notebook_record(&document.id).unwrap(), document);
    let svg_path = dir.path().join("authored.svg");
    lingforge_storage::writing::export_glyph(&svg_path, &edited).unwrap();
    let bytes = std::fs::read_to_string(&svg_path).unwrap();
    let imported = import_svg(&bytes).unwrap();
    assert_eq!(EditableOutline::from_outline(&imported).unwrap(), edited);
    assert!(lingforge_storage::writing::export_glyph(&svg_path, &model).is_err());
    assert_eq!(std::fs::read_to_string(&svg_path).unwrap(), bytes);
    let backup = project.backup("manual").unwrap();
    let recovered = project.restore_copy(&backup.id, dir.path()).unwrap();
    assert_eq!(
        recovered.writing_system(&saved.id).unwrap().data,
        saved.data
    );
    assert_eq!(recovered.notebook_record(&document.id).unwrap(), document);
    let path = project.path().to_owned();
    drop(project);
    let project = Project::open(&path).unwrap();
    assert_eq!(project.writing_system(&saved.id).unwrap().data, saved.data);
    assert_eq!(project.notebook_record(&document.id).unwrap(), document);
}

#[test]
fn opening_and_decoding_a_legacy_outline_does_not_rewrite_it() {
    use lingforge_core::glyph_edit::EditableOutline;
    let (_dir, mut project) = project();
    let mut data = script(None);
    data.characters[0].glyphs[0].outline.paths = vec!["M0,0 L 5e1 100 L 100 0 Z".into()];
    let saved = project.save_writing_system(None, None, data).unwrap();
    let revision = project.summary().unwrap().revision;
    let model = EditableOutline::from_outline(&saved.data.characters[0].glyphs[0].outline).unwrap();
    assert_eq!(model.paths[0].len(), 4);
    assert_eq!(project.writing_system(&saved.id).unwrap().data, saved.data);
    assert_eq!(project.summary().unwrap().revision, revision);
    let path = project.path().to_owned();
    drop(project);
    assert_eq!(
        Project::open(&path)
            .unwrap()
            .writing_system(&saved.id)
            .unwrap()
            .data,
        saved.data
    );
}
