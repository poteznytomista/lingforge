use lingforge_core::{
    lexicon::{EntryKind, LexemeDraft, LexicalForm, Sense},
    phonology::{
        Allophone, Articulation, CustomFeature, PhonemeDraft, PhonemeKind, PhonologyDraft,
        PhonotacticRule, PronunciationSegment, SyllablePattern,
    },
    project::ProjectMetadata,
    ErrorCode,
};
use lingforge_storage::{
    lexicon::LexiconQuery,
    lexicon_transfer::{DuplicatePolicy, ImportSource, TransferFormat},
    Project,
};

fn project() -> (tempfile::TempDir, Project) {
    let directory = tempfile::tempdir().unwrap();
    let project = Project::create(
        directory.path(),
        &ProjectMetadata {
            name: "Sound fixture".into(),
            language_name: String::new(),
            description: String::new(),
        },
    )
    .unwrap();
    (directory, project)
}
fn sound(label: &str) -> PhonemeDraft {
    PhonemeDraft {
        label: label.into(),
        kind: PhonemeKind::Consonant,
        articulation: Articulation {
            place: "my place".into(),
            manner: "my manner".into(),
            ..Default::default()
        },
        features: vec![CustomFeature {
            name: "custom".into(),
            value: "value".into(),
        }],
        allophones: vec![Allophone {
            id: None,
            label: "n̥".into(),
            environment: "before my boundary".into(),
            notes: "description only".into(),
        }],
        notes: "An authored sound".into(),
    }
}
fn word() -> LexemeDraft {
    LexemeDraft {
        lemma: "source".into(),
        pronunciation: "free t͡ʃã".into(),
        pronunciation_segments: Vec::new(),
        part_of_speech: String::new(),
        kind: EntryKind::Lexeme,
        root_id: None,
        etymology: String::new(),
        notes: String::new(),
        senses: vec![Sense {
            id: None,
            definition: "A definition".into(),
            notes: String::new(),
        }],
        forms: vec![LexicalForm {
            id: None,
            text: "form".into(),
            label: "variant".into(),
            pronunciation: "free form text".into(),
            pronunciation_segments: Vec::new(),
        }],
        relations: Vec::new(),
    }
}
fn link(id: &str) -> PronunciationSegment {
    PronunciationSegment::Phoneme {
        phoneme_id: id.into(),
        annotation: "ː".into(),
    }
}

#[test]
fn renaming_preserves_ordered_entry_and_form_links_and_free_text() {
    let (_directory, mut project) = project();
    let phoneme = project
        .save_phoneme(None, None, sound("a\u{303}"))
        .unwrap()
        .phoneme;
    let mut data = word();
    data.pronunciation_segments = vec![
        PronunciationSegment::Text { text: "ˈ".into() },
        link(&phoneme.id),
        PronunciationSegment::Text { text: " ".into() },
        link(&phoneme.id),
    ];
    data.forms[0].pronunciation_segments = vec![link(&phoneme.id)];
    let entry = project.save_lexeme(None, None, data).unwrap().entry;
    let references = project.phoneme(&phoneme.id).unwrap();
    assert_eq!(references.incoming_count, 2);
    assert_eq!(
        references
            .incoming
            .iter()
            .map(|item| item.occurrences)
            .sum::<u32>(),
        3
    );
    assert!(references
        .incoming
        .iter()
        .any(|item| item.form_text == "form"));
    assert!(project
        .delete_phoneme(&phoneme.id, phoneme.revision)
        .is_err());
    let mut changed = phoneme.data.clone();
    changed.label = "ɲ".into();
    let changed = project
        .save_phoneme(Some(&phoneme.id), Some(phoneme.revision), changed)
        .unwrap()
        .phoneme;
    assert_eq!(changed.id, phoneme.id);
    assert_eq!(changed.data.allophones, phoneme.data.allophones);
    assert_eq!(
        project
            .save_phoneme(Some(&phoneme.id), Some(phoneme.revision), sound("stale"))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let path = project.path().to_owned();
    drop(project);
    let mut project = Project::open(&path).unwrap();
    assert_eq!(project.lexeme(&entry.id).unwrap().entry.data, entry.data);
    assert_eq!(
        project.phonology_inventory("ɲ").unwrap().phonemes[0].id,
        phoneme.id
    );
    assert_eq!(
        project.lexeme(&entry.id).unwrap().entry.revision,
        entry.revision
    );
    let mut unlinked = entry.data.clone();
    unlinked.pronunciation_segments.clear();
    unlinked.forms[0].pronunciation_segments.clear();
    project
        .save_lexeme(Some(&entry.id), Some(entry.revision), unlinked)
        .unwrap();
    project
        .delete_phoneme(&phoneme.id, changed.revision)
        .unwrap();
    assert_eq!(project.phonology_inventory("").unwrap().total, 0);
}

#[test]
fn phonology_descriptions_and_allophone_ids_persist_with_revision_checks() {
    let (_directory, mut project) = project();
    let data = PhonologyDraft {
        notes: "No rule execution".into(),
        patterns: vec![SyllablePattern {
            id: None,
            label: "Open".into(),
            onset: "optional cluster".into(),
            nucleus: "my nucleus".into(),
            coda: String::new(),
            notes: "ã".into(),
        }],
        rules: vec![PhonotacticRule {
            id: None,
            label: "Constraint".into(),
            description: "A free description.".into(),
        }],
    };
    let profile = project.save_phonology_profile(0, data.clone()).unwrap();
    assert!(profile.data.patterns[0].id.is_some());
    assert!(profile.data.rules[0].id.is_some());
    assert_eq!(
        project.save_phonology_profile(0, data).unwrap_err().code,
        ErrorCode::Conflict
    );
    let revision = project.summary().unwrap().revision;
    assert_eq!(
        project
            .save_phonology_profile(profile.revision, profile.data.clone())
            .unwrap()
            .revision,
        profile.revision
    );
    assert_eq!(project.summary().unwrap().revision, revision);
    let path = project.path().to_owned();
    drop(project);
    let project = Project::open(&path).unwrap();
    assert_eq!(
        project.phonology_inventory("").unwrap().profile.data,
        profile.data
    );
}

#[test]
fn json_v2_carries_phonemes_and_keep_both_remaps_every_pronunciation_link() {
    let (_source_directory, mut source_project) = project();
    let phoneme = source_project
        .save_phoneme(None, None, sound("θ"))
        .unwrap()
        .phoneme;
    let unused = source_project
        .save_phoneme(None, None, sound("unused"))
        .unwrap()
        .phoneme;
    let mut data = word();
    data.pronunciation_segments = vec![link(&phoneme.id)];
    data.forms[0].pronunciation_segments = vec![link(&phoneme.id)];
    source_project.save_lexeme(None, None, data).unwrap();
    let bytes = source_project
        .export_lexicon_bytes(TransferFormat::Json)
        .unwrap();
    let document: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(document["version"], 2);
    assert_eq!(document["phonemes"].as_array().unwrap().len(), 1);
    let source = ImportSource::from_bytes("linked.json", TransferFormat::Json, &bytes).unwrap();
    let (_target_directory, mut target) = project();
    let plan = source
        .prepare(&target, None, DuplicatePolicy::Reject)
        .unwrap();
    target.import_lexicon(&plan).unwrap();
    assert_eq!(
        target.export_lexicon_bytes(TransferFormat::Json).unwrap(),
        bytes
    );
    assert!(target.phoneme(&unused.id).is_err());
    let plan = source
        .prepare(&target, None, DuplicatePolicy::KeepBoth)
        .unwrap();
    target.import_lexicon(&plan).unwrap();
    assert_eq!(target.phonology_inventory("").unwrap().total, 2);
    let entries = target.lexicon_page(&LexiconQuery::default()).unwrap().items;
    for item in entries {
        let entry = target.lexeme(&item.id).unwrap().entry;
        let id = entry.data.pronunciation_segments[0].phoneme_id().unwrap();
        assert_eq!(
            entry.data.forms[0].pronunciation_segments[0].phoneme_id(),
            Some(id)
        );
        assert_eq!(target.phoneme(id).unwrap().incoming_count, 2);
    }
}

#[test]
fn missing_phonemes_and_corrupted_reference_indexes_are_rejected() {
    let (_directory, mut project) = project();
    let phoneme = project
        .save_phoneme(None, None, sound("ʃ"))
        .unwrap()
        .phoneme;
    let revision = project.summary().unwrap().revision;
    let mut bad = word();
    bad.pronunciation_segments = vec![link("00000000-0000-4000-8000-000000000099")];
    assert!(project.save_lexeme(None, None, bad).is_err());
    assert_eq!(project.summary().unwrap().revision, revision);
    let mut good = word();
    good.forms[0].pronunciation_segments = vec![link(&phoneme.id)];
    project.save_lexeme(None, None, good).unwrap();
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute("DELETE FROM phoneme_references", [])
        .unwrap();
    drop(connection);
    assert!(Project::open(&path).is_err());
}

#[test]
fn schema_three_migrates_without_changing_existing_lexical_text_or_ids() {
    let (_directory, mut project) = project();
    let entry = project.save_lexeme(None, None, word()).unwrap().entry;
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute(
            "UPDATE lexemes SET forms_json=json_remove(forms_json,'$[0].pronunciationSegments')",
            [],
        )
        .unwrap();
    connection.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; DROP TABLE notebook_characters; DROP TABLE notebook_scripts; DROP TABLE notebook_phonemes; DROP TABLE notebook_lexemes; DROP TABLE notebook_records; DROP TABLE script_phoneme_references; DROP TABLE writing_systems; DROP TABLE phoneme_references; DROP TABLE phonology_profile; DROP TABLE phonemes; ALTER TABLE lexemes DROP COLUMN pronunciation_json; PRAGMA user_version=3;").unwrap();
    drop(connection);
    let project = Project::open(&path).unwrap();
    assert_eq!(project.lexeme(&entry.id).unwrap().entry.data, entry.data);
    assert_eq!(project.phonology_inventory("").unwrap().total, 0);
    assert!(project
        .backups()
        .unwrap()
        .iter()
        .any(|backup| backup.kind == "migration"));
}

#[test]
fn legacy_entries_at_the_byte_limit_fit_after_empty_segment_fields_are_added() {
    let (_directory, mut project) = project();
    let mut data = word();
    data.senses = (0..63)
        .map(|_| Sense {
            id: Some(uuid::Uuid::new_v4().to_string()),
            definition: "a".repeat(4000),
            notes: String::new(),
        })
        .collect();
    data.forms[0].id = Some(uuid::Uuid::new_v4().to_string());
    let mut legacy = serde_json::to_value(&data).unwrap();
    legacy
        .as_object_mut()
        .unwrap()
        .remove("pronunciationSegments");
    legacy["forms"][0]
        .as_object_mut()
        .unwrap()
        .remove("pronunciationSegments");
    let base = serde_json::to_vec(&legacy).unwrap().len();
    assert!(base < 256 * 1024);
    let remaining = 256 * 1024 - base;
    assert!(remaining <= 20_000);
    data.notes = "x".repeat(remaining);
    legacy["notes"] = serde_json::Value::String(data.notes.clone());
    assert_eq!(serde_json::to_vec(&legacy).unwrap().len(), 256 * 1024);
    assert!(serde_json::to_vec(&data).unwrap().len() > 256 * 1024);
    let entry = project.save_lexeme(None, None, data).unwrap().entry;
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection
        .execute(
            "UPDATE lexemes SET forms_json=json_remove(forms_json,'$[0].pronunciationSegments')",
            [],
        )
        .unwrap();
    connection.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; DROP TABLE notebook_characters; DROP TABLE notebook_scripts; DROP TABLE notebook_phonemes; DROP TABLE notebook_lexemes; DROP TABLE notebook_records; DROP TABLE script_phoneme_references; DROP TABLE writing_systems; DROP TABLE phoneme_references; DROP TABLE phonology_profile; DROP TABLE phonemes; ALTER TABLE lexemes DROP COLUMN pronunciation_json; PRAGMA user_version=3;").unwrap();
    drop(connection);
    let project = Project::open(&path).unwrap();
    assert_eq!(project.lexeme(&entry.id).unwrap().entry.data, entry.data);
    let path = project.path().to_owned();
    drop(project);
    assert_eq!(
        Project::open(&path)
            .unwrap()
            .lexeme(&entry.id)
            .unwrap()
            .entry
            .data,
        entry.data
    );
}

#[test]
fn deleting_a_form_or_entry_removes_only_its_pronunciation_references() {
    let (_directory, mut project) = project();
    let phoneme = project
        .save_phoneme(None, None, sound("ŋ"))
        .unwrap()
        .phoneme;
    let mut data = word();
    data.pronunciation_segments = vec![link(&phoneme.id)];
    data.forms[0].pronunciation_segments = vec![link(&phoneme.id)];
    let entry = project.save_lexeme(None, None, data).unwrap().entry;
    let mut data = entry.data.clone();
    data.forms.clear();
    let entry = project
        .save_lexeme(Some(&entry.id), Some(entry.revision), data)
        .unwrap()
        .entry;
    let references = project.phoneme(&phoneme.id).unwrap();
    assert_eq!(references.incoming_count, 1);
    assert_eq!(references.incoming[0].form_id, None);
    assert!(project
        .delete_phoneme(&phoneme.id, phoneme.revision)
        .is_err());
    project.delete_lexeme(&entry.id, entry.revision).unwrap();
    assert_eq!(project.phoneme(&phoneme.id).unwrap().incoming_count, 0);
    project
        .delete_phoneme(&phoneme.id, phoneme.revision)
        .unwrap();
}

#[test]
fn phonology_changes_invalidate_prepared_imports() {
    let (_source_directory, mut source_project) = project();
    source_project.save_lexeme(None, None, word()).unwrap();
    let source = ImportSource::from_bytes(
        "words.json",
        TransferFormat::Json,
        &source_project
            .export_lexicon_bytes(TransferFormat::Json)
            .unwrap(),
    )
    .unwrap();
    let (_target_directory, mut target) = project();
    let prepared = source
        .prepare(&target, None, DuplicatePolicy::Reject)
        .unwrap();
    target.save_phoneme(None, None, sound("ʔ")).unwrap();
    assert_eq!(
        target.import_lexicon(&prepared).unwrap_err().code,
        ErrorCode::Conflict
    );
    let prepared = source
        .prepare(&target, None, DuplicatePolicy::Reject)
        .unwrap();
    target
        .save_phonology_profile(
            0,
            PhonologyDraft {
                notes: "Changed after preview".into(),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        target.import_lexicon(&prepared).unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(
        target.lexicon_page(&LexiconQuery::default()).unwrap().total,
        0
    );
}

#[test]
fn legacy_json_is_read_and_new_fields_require_version_two() {
    let (_directory, mut project) = project();
    let mut data = word();
    data.forms.clear();
    project.save_lexeme(None, None, data).unwrap();
    let mut document: serde_json::Value =
        serde_json::from_slice(&project.export_lexicon_bytes(TransferFormat::Json).unwrap())
            .unwrap();
    document["version"] = serde_json::json!(1);
    document.as_object_mut().unwrap().remove("phonemes");
    document["entries"][0]["data"]
        .as_object_mut()
        .unwrap()
        .remove("pronunciationSegments");
    let source = ImportSource::from_bytes(
        "legacy.json",
        TransferFormat::Json,
        &serde_json::to_vec(&document).unwrap(),
    )
    .unwrap();
    let (_other_directory, other) = self::project();
    assert!(source
        .prepare(&other, None, DuplicatePolicy::Reject)
        .is_ok());
    document["entries"][0]["data"]["pronunciationSegments"] =
        serde_json::json!([{"kind":"text","text":"ˈ"}]);
    assert!(ImportSource::from_bytes(
        "mislabeled.json",
        TransferFormat::Json,
        &serde_json::to_vec(&document).unwrap()
    )
    .is_err());
}

#[test]
fn backups_and_archives_preserve_the_inventory_and_language_descriptions() {
    let (directory, mut project) = project();
    let phoneme = project
        .save_phoneme(None, None, sound("ɬ"))
        .unwrap()
        .phoneme;
    let profile = project
        .save_phonology_profile(
            0,
            PhonologyDraft {
                notes: "Preserve this description".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let mut data = word();
    data.pronunciation_segments = vec![link(&phoneme.id)];
    let entry = project.save_lexeme(None, None, data).unwrap().entry;
    let backup = project.backup("manual").unwrap();
    let archive = directory.path().join("sounds.lingforge");
    project.export(&archive).unwrap();
    let imported = lingforge_storage::import_project(&archive, directory.path(), false).unwrap();
    assert_eq!(
        imported.phoneme(&phoneme.id).unwrap().phoneme.data,
        phoneme.data
    );
    assert_eq!(
        imported.phonology_inventory("").unwrap().profile.data,
        profile.data
    );
    assert_eq!(imported.lexeme(&entry.id).unwrap().entry.data, entry.data);
    let recovered = project.restore_copy(&backup.id, directory.path()).unwrap();
    assert_ne!(
        recovered.summary().unwrap().id,
        project.summary().unwrap().id
    );
    assert_eq!(recovered.phoneme(&phoneme.id).unwrap().incoming_count, 1);
    let backup_dir = project.path().join("backups");
    std::fs::rename(&backup_dir, project.path().join("retained-backups")).unwrap();
    std::fs::write(&backup_dir, b"blocked").unwrap();
    let revision = project.summary().unwrap().revision;
    assert!(project
        .save_phoneme(
            Some(&phoneme.id),
            Some(phoneme.revision),
            sound("blocked rename")
        )
        .is_err());
    assert!(project
        .save_phonology_profile(profile.revision, PhonologyDraft::default())
        .is_err());
    assert_eq!(project.summary().unwrap().revision, revision);
    assert_eq!(
        project.phoneme(&phoneme.id).unwrap().phoneme.data,
        phoneme.data
    );
}
