use lingforge_core::{
    lexicon::{EntryKind, Lexeme, LexemeDraft, Sense},
    notebook::{
        DocumentDraft, GrammarDraft, GrammarExample, GrammarFeature, LexicalSpan, MorphologyKind,
        MorphologyNote, NotebookDraft, Paragraph, RecordKind,
    },
    phonology::{Articulation, Phoneme, PhonemeDraft, PhonemeKind},
    project::ProjectMetadata,
    writing::{Character, ScriptDraft, TextUnit, WritingSystem},
    ErrorCode,
};
use lingforge_storage::{notebook::ExportFormat, Project};
use uuid::Uuid;

fn id() -> String {
    Uuid::new_v4().to_string()
}
fn project() -> (tempfile::TempDir, Project) {
    let directory = tempfile::tempdir().unwrap();
    let project = Project::create(
        directory.path(),
        &ProjectMetadata {
            name: "Integrated fixture".into(),
            language_name: String::new(),
            description: String::new(),
        },
    )
    .unwrap();
    (directory, project)
}
fn dependencies(project: &mut Project) -> (Lexeme, Phoneme, WritingSystem) {
    let word = project
        .save_lexeme(
            None,
            None,
            LexemeDraft {
                lemma: "word".into(),
                pronunciation: String::new(),
                pronunciation_segments: vec![],
                part_of_speech: String::new(),
                kind: EntryKind::Lexeme,
                root_id: None,
                etymology: String::new(),
                notes: String::new(),
                senses: vec![Sense {
                    id: None,
                    definition: "Meaning".into(),
                    notes: String::new(),
                }],
                forms: vec![],
                relations: vec![],
            },
        )
        .unwrap()
        .entry;
    let sound = project
        .save_phoneme(
            None,
            None,
            PhonemeDraft {
                label: "θ".into(),
                kind: PhonemeKind::Consonant,
                articulation: Articulation::default(),
                features: vec![],
                allophones: vec![],
                notes: String::new(),
            },
        )
        .unwrap()
        .phoneme;
    let script = project
        .save_writing_system(
            None,
            None,
            ScriptDraft {
                name: "Alphabet".into(),
                characters: vec![Character {
                    id: id(),
                    name: "First".into(),
                    transliteration: "th".into(),
                    phoneme_ids: vec![],
                    glyphs: vec![],
                    default_glyph_id: None,
                }],
                ..Default::default()
            },
        )
        .unwrap();
    (word, sound, script)
}
fn document(word: &Lexeme, script: &WritingSystem) -> NotebookDraft {
    NotebookDraft::Document(DocumentDraft {
        title: "Text".into(),
        notes: "Keep notes".into(),
        paragraphs: vec![
            Paragraph {
                id: id(),
                script_id: Some(script.id.clone()),
                units: vec![
                    TextUnit::Symbol {
                        character_id: script.data.characters[0].id.clone(),
                    },
                    TextUnit::Text { text: " ".into() },
                ],
                links: vec![LexicalSpan {
                    start: 0,
                    end: 1,
                    entry_id: word.id.clone(),
                }],
            },
            Paragraph {
                id: id(),
                script_id: None,
                units: vec![TextUnit::Text {
                    text: "a\u{303}".into(),
                }],
                links: vec![],
            },
        ],
    })
}
fn grammar(word: &Lexeme, sound: &Phoneme) -> NotebookDraft {
    NotebookDraft::Grammar(GrammarDraft {
        title: "Number".into(),
        notes: "Authored description".into(),
        features: vec![GrammarFeature {
            id: id(),
            name: "Number".into(),
            values: "one, many".into(),
            description: "Language-defined".into(),
        }],
        examples: vec![GrammarExample {
            id: id(),
            text: "word".into(),
            gloss: "N.SG".into(),
            translation: "A word".into(),
        }],
        lexeme_ids: vec![word.id.clone()],
        phoneme_ids: vec![sound.id.clone()],
        morphology: vec![MorphologyNote {
            id: id(),
            kind: MorphologyKind::Irregular,
            label: "Plural".into(),
            description: "An exception".into(),
            entry_id: Some(word.id.clone()),
            form: "words".into(),
        }],
    })
}
#[test]
fn integrated_records_survive_rename_reopen_archives_and_recovery() {
    let (dir, mut project) = project();
    let (word, sound, script) = dependencies(&mut project);
    let document = project
        .save_notebook_record(&id(), None, document(&word, &script))
        .unwrap();
    let grammar = project
        .save_notebook_record(&id(), None, grammar(&word, &sound))
        .unwrap();
    let mut data = word.data.clone();
    data.lemma = "Renamed".into();
    project
        .save_lexeme(Some(&word.id), Some(word.revision), data)
        .unwrap();
    let mut data = script.data.clone();
    data.characters[0].name = "New visible name".into();
    data.characters[0].transliteration = "t".into();
    project
        .save_writing_system(Some(&script.id), Some(script.revision), data)
        .unwrap();
    assert_eq!(project.notebook_record(&document.id).unwrap(), document);
    assert_eq!(
        project.document_text(&document.data, false).unwrap().text,
        "t \n\na\u{303}"
    );
    let revision = project.summary().unwrap().revision;
    assert_eq!(
        project
            .save_notebook_record(&document.id, Some(document.revision), document.data.clone())
            .unwrap(),
        document
    );
    assert_eq!(project.summary().unwrap().revision, revision);
    let archive = dir.path().join("integrated.lingforge");
    project.export(&archive).unwrap();
    let imported = lingforge_storage::import_project(&archive, dir.path(), false).unwrap();
    assert_eq!(imported.notebook_record(&document.id).unwrap(), document);
    assert_eq!(imported.notebook_record(&grammar.id).unwrap(), grammar);
    let backup = project.backup("manual").unwrap();
    let recovered = project.restore_copy(&backup.id, dir.path()).unwrap();
    assert_ne!(
        recovered.summary().unwrap().id,
        project.summary().unwrap().id
    );
    assert_eq!(recovered.notebook_record(&document.id).unwrap(), document);
    let path = project.path().to_owned();
    drop(project);
    let project = Project::open(&path).unwrap();
    assert_eq!(project.notebook_record(&grammar.id).unwrap(), grammar);
    assert_eq!(
        project
            .notebook_records(RecordKind::Document)
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn references_block_deletion_and_character_removal_without_touching_dependents() {
    let (_dir, mut project) = project();
    let (word, sound, script) = dependencies(&mut project);
    let doc = project
        .save_notebook_record(&id(), None, document(&word, &script))
        .unwrap();
    let grammar = project
        .save_notebook_record(&id(), None, grammar(&word, &sound))
        .unwrap();
    assert!(project
        .delete_lexeme(&word.id, word.revision)
        .unwrap_err()
        .message
        .contains("Documents or Grammar"));
    assert!(project.delete_phoneme(&sound.id, sound.revision).is_err());
    assert!(project
        .delete_writing_system(&script.id, script.revision)
        .is_err());
    let mut data = script.data.clone();
    data.characters.clear();
    assert!(project
        .save_writing_system(Some(&script.id), Some(script.revision), data)
        .is_err());
    assert_eq!(project.notebook_record(&doc.id).unwrap(), doc);
    project
        .delete_notebook_record(&doc.id, doc.revision)
        .unwrap();
    project
        .delete_writing_system(&script.id, script.revision)
        .unwrap();
    assert!(project.delete_lexeme(&word.id, word.revision).is_err());
    project
        .delete_notebook_record(&grammar.id, grammar.revision)
        .unwrap();
    project.delete_lexeme(&word.id, word.revision).unwrap();
    project.delete_phoneme(&sound.id, sound.revision).unwrap();
}
#[test]
fn structured_review_is_lossless_project_scoped_revision_checked_and_never_clobbers() {
    let (dir, mut project) = project();
    let (word, _sound, script) = dependencies(&mut project);
    let saved = project
        .save_notebook_record(&id(), None, document(&word, &script))
        .unwrap();
    let bytes = project
        .export_notebook_bytes(&saved.id, saved.revision, ExportFormat::Structured)
        .unwrap();
    let reviewed = project.read_notebook_bytes(&bytes).unwrap();
    assert_eq!(reviewed.record, saved);
    assert_eq!(reviewed.existing, Some(saved.clone()));
    let (_other_dir, other) = self::project();
    assert!(other.read_notebook_bytes(&bytes).is_err());
    let destination = dir.path().join("keep.json");
    std::fs::write(&destination, b"keep me").unwrap();
    assert!(project
        .export_notebook(
            &saved.id,
            saved.revision,
            &destination,
            ExportFormat::Structured
        )
        .is_err());
    assert_eq!(std::fs::read(&destination).unwrap(), b"keep me");
    let NotebookDraft::Document(mut changed) = saved.data.clone() else {
        panic!("document fixture")
    };
    changed.title = "Changed".into();
    let changed = project
        .save_notebook_record(
            &saved.id,
            Some(saved.revision),
            NotebookDraft::Document(changed),
        )
        .unwrap();
    assert_eq!(
        project
            .save_notebook_record(&saved.id, Some(saved.revision), saved.data.clone())
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(
        project
            .read_notebook_bytes(&bytes)
            .unwrap()
            .existing
            .unwrap()
            .revision,
        changed.revision
    );
    project
        .delete_notebook_record(&changed.id, changed.revision)
        .unwrap();
    let candidate = project.read_notebook_bytes(&bytes).unwrap();
    assert!(candidate.existing.is_none());
    assert_eq!(
        project
            .save_notebook_record(&candidate.record.id, None, candidate.record.data)
            .unwrap(),
        saved
    );
    let mut malformed: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    malformed["record"]["data"]["content"]["html"] = "not allowed".into();
    assert!(project
        .read_notebook_bytes(&serde_json::to_vec(&malformed).unwrap())
        .is_err());
}
#[test]
fn text_exports_disclose_loss_and_suppress_partial_transliteration() {
    let (_dir, mut project) = project();
    let (word, _sound, script) = dependencies(&mut project);
    let saved = project
        .save_notebook_record(&id(), None, document(&word, &script))
        .unwrap();
    assert!(project
        .export_notebook_bytes(&saved.id, 0, ExportFormat::Plain)
        .is_err());
    assert_eq!(
        String::from_utf8(
            project
                .export_notebook_bytes(&saved.id, 0, ExportFormat::Transliteration)
                .unwrap()
        )
        .unwrap(),
        "th \n\na\u{303}"
    );
    let mut data = script.data.clone();
    data.characters[0].transliteration.clear();
    project
        .save_writing_system(Some(&script.id), Some(script.revision), data)
        .unwrap();
    let result = project.document_text(&saved.data, false).unwrap();
    assert!(result.text.is_empty());
    assert!(!result.issues.is_empty());
    assert!(project
        .export_notebook_bytes(&saved.id, 0, ExportFormat::Transliteration)
        .is_err());
    let NotebookDraft::Document(mut literal) = saved.data else {
        panic!("document fixture")
    };
    literal.paragraphs.remove(0);
    let literal = project
        .save_notebook_record(&id(), None, NotebookDraft::Document(literal))
        .unwrap();
    assert_eq!(
        project
            .export_notebook_bytes(&literal.id, 0, ExportFormat::Plain)
            .unwrap(),
        "a\u{303}".as_bytes()
    );
}
#[test]
fn backup_failure_keeps_saved_data_and_revision() {
    let (_dir, mut project) = project();
    let (word, sound, _script) = dependencies(&mut project);
    let saved = project
        .save_notebook_record(&id(), None, grammar(&word, &sound))
        .unwrap();
    let revision = project.summary().unwrap().revision;
    let NotebookDraft::Grammar(mut changed) = saved.data.clone() else {
        panic!("grammar fixture")
    };
    changed.notes.push_str(" edited");
    let backups = project.path().join("backups");
    std::fs::rename(&backups, project.path().join("kept-backups")).unwrap();
    std::fs::write(&backups, b"blocked").unwrap();
    assert!(project
        .save_notebook_record(
            &saved.id,
            Some(saved.revision),
            NotebookDraft::Grammar(changed)
        )
        .is_err());
    assert!(project
        .delete_notebook_record(&saved.id, saved.revision)
        .is_err());
    assert_eq!(project.summary().unwrap().revision, revision);
    assert_eq!(project.notebook_record(&saved.id).unwrap(), saved);
}
#[test]
fn mid_transaction_failure_rolls_back_the_record_and_all_projections() {
    let (_dir, mut project) = project();
    let (word, _sound, script) = dependencies(&mut project);
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute("UPDATE project SET revision=9007199254740991", [])
        .unwrap();
    drop(connection);
    let mut project = Project::open(&path).unwrap();
    assert_eq!(
        project
            .save_notebook_record(&id(), None, document(&word, &script))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert!(project
        .notebook_records(RecordKind::Document)
        .unwrap()
        .is_empty());
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    for table in [
        "notebook_records",
        "notebook_lexemes",
        "notebook_scripts",
        "notebook_characters",
    ] {
        assert_eq!(
            connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
#[test]
fn missing_targets_and_corrupted_projections_are_rejected() {
    let (_dir, mut project) = project();
    let (word, _sound, script) = dependencies(&mut project);
    let mut data = document(&word, &script);
    if let NotebookDraft::Document(d) = &mut data {
        d.paragraphs[0].links[0].entry_id = id();
    }
    assert!(project.save_notebook_record(&id(), None, data).is_err());
    project
        .save_notebook_record(&id(), None, document(&word, &script))
        .unwrap();
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute("DELETE FROM notebook_characters", [])
        .unwrap();
    drop(connection);
    assert!(Project::open(&path).is_err());
}
#[test]
fn schema_five_migration_backs_up_and_keeps_the_alphabet() {
    let (_dir, mut project) = project();
    let (_word, _sound, script) = dependencies(&mut project);
    let summary = project.summary().unwrap();
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; DROP TABLE notebook_characters; DROP TABLE notebook_scripts; DROP TABLE notebook_phonemes; DROP TABLE notebook_lexemes; DROP TABLE notebook_records; PRAGMA user_version=5;").unwrap();
    drop(connection);
    let project = Project::open(&path).unwrap();
    assert_eq!(project.summary().unwrap().id, summary.id);
    assert_eq!(
        project.writing_system(&script.id).unwrap().data,
        script.data
    );
    assert!(project
        .notebook_records(RecordKind::Document)
        .unwrap()
        .is_empty());
    assert!(project
        .backups()
        .unwrap()
        .iter()
        .any(|b| b.kind == "migration"));
}
