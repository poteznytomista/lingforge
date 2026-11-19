use lingforge_core::{
    lexicon::{EntryKind, LexemeDraft, LexicalForm, Relation, Sense},
    project::ProjectMetadata,
    ErrorCode,
};
use lingforge_storage::{
    lexicon::{LexiconQuery, LexiconSort},
    lexicon_transfer::{CsvMapping, DuplicatePolicy, ImportSource, TransferFormat},
    Project,
};
use std::{fs, time::Instant};

fn project() -> (tempfile::TempDir, Project) {
    let directory = tempfile::tempdir().unwrap();
    let project = Project::create(
        directory.path(),
        &ProjectMetadata {
            name: "Lexicon fixture".into(),
            language_name: String::new(),
            description: String::new(),
        },
    )
    .unwrap();
    (directory, project)
}
fn draft(lemma: &str) -> LexemeDraft {
    LexemeDraft {
        lemma: lemma.into(),
        pronunciation: "t͡ʃã".into(),
        pronunciation_segments: Vec::new(),
        part_of_speech: "free category".into(),
        kind: EntryKind::Lexeme,
        root_id: None,
        etymology: String::new(),
        notes: String::new(),
        senses: vec![Sense {
            id: None,
            definition: "A meaning".into(),
            notes: "Sense note".into(),
        }],
        forms: vec![LexicalForm {
            id: None,
            text: "form".into(),
            label: "my label".into(),
            pronunciation: String::new(),
            pronunciation_segments: Vec::new(),
        }],
        relations: Vec::new(),
    }
}
fn mapping() -> CsvMapping {
    CsvMapping {
        lemma: 0,
        definition: 1,
        pronunciation: None,
        part_of_speech: None,
        notes: None,
    }
}
fn csv(count: usize) -> ImportSource {
    let mut source = String::from("lemma,definition\n");
    for index in 0..count {
        source.push_str(&format!("word-{index:05},Meaning {index} θ a\u{303}\n"));
    }
    ImportSource::from_bytes("fixture.csv", TransferFormat::Csv, source.as_bytes()).unwrap()
}

#[test]
fn identities_children_and_links_survive_renaming_and_reopen() {
    let (_directory, mut project) = project();
    let mut root = draft("source");
    root.kind = EntryKind::Root;
    let root = project.save_lexeme(None, None, root).unwrap().entry;
    let mut word = draft("a\u{301}");
    word.root_id = Some(root.id.clone());
    word.relations.push(Relation {
        target_id: root.id.clone(),
        relation_type: "related to".into(),
    });
    let word = project.save_lexeme(None, None, word).unwrap().entry;
    assert_eq!(project.lexeme(&root.id).unwrap().incoming_count, 2);
    assert!(project.delete_lexeme(&root.id, root.revision).is_err());
    let mut wrong_kind = root.data.clone();
    wrong_kind.kind = EntryKind::Lexeme;
    assert!(project
        .save_lexeme(Some(&root.id), Some(root.revision), wrong_kind)
        .is_err());
    let mut renamed = root.data.clone();
    renamed.lemma = "new glyph spelling".into();
    let renamed = project
        .save_lexeme(Some(&root.id), Some(root.revision), renamed)
        .unwrap()
        .entry;
    assert_eq!(renamed.id, root.id);
    assert_eq!(renamed.data.senses, root.data.senses);
    assert_eq!(
        project
            .save_lexeme(Some(&root.id), Some(root.revision), draft("stale"))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let path = project.path().to_owned();
    drop(project);
    let mut project = Project::open(&path).unwrap();
    assert_eq!(project.lexeme(&word.id).unwrap().entry.data, word.data);
    project.delete_lexeme(&word.id, word.revision).unwrap();
    project.delete_lexeme(&root.id, renamed.revision).unwrap();
    assert_eq!(
        project
            .lexicon_page(&LexiconQuery::default())
            .unwrap()
            .total,
        0
    );
}

#[test]
fn searches_preserve_unicode_and_escape_like_metacharacters() {
    let (_directory, mut project) = project();
    let stored = project
        .save_lexeme(None, None, draft("A\u{301}%_\\"))
        .unwrap()
        .entry;
    project.save_lexeme(None, None, draft("plain")).unwrap();
    let mut query = LexiconQuery {
        text: "á%_\\".into(),
        ..Default::default()
    };
    assert_eq!(project.lexicon_page(&query).unwrap().items[0].id, stored.id);
    query.text = "a%_\\".into();
    assert_eq!(project.lexicon_page(&query).unwrap().total, 0);
    query.ignore_marks = true;
    assert_eq!(project.lexicon_page(&query).unwrap().total, 1);
    query.text = "%".into();
    assert_eq!(project.lexicon_page(&query).unwrap().total, 1);
    query.text.clear();
    query.kind = Some(EntryKind::Root);
    assert_eq!(project.lexicon_page(&query).unwrap().total, 0);
    query.kind = None;
    query.part_of_speech = "another category".into();
    assert_eq!(project.lexicon_page(&query).unwrap().total, 0);
    assert_eq!(
        project.lexeme(&stored.id).unwrap().entry.data.lemma,
        "A\u{301}%_\\"
    );
}

#[test]
fn json_round_trip_and_keep_both_remap_internal_references() {
    let (directory, mut source_project) = project();
    let mut root = draft("root");
    root.kind = EntryKind::Root;
    let root = source_project.save_lexeme(None, None, root).unwrap().entry;
    let mut word = draft("word");
    word.root_id = Some(root.id.clone());
    word.relations.push(Relation {
        target_id: root.id,
        relation_type: "origin".into(),
    });
    source_project.save_lexeme(None, None, word).unwrap();
    let bytes = source_project
        .export_lexicon_bytes(TransferFormat::Json)
        .unwrap();
    let source = ImportSource::from_bytes("entries.json", TransferFormat::Json, &bytes).unwrap();
    let (_other_directory, mut target) = project();
    let plan = source
        .prepare(&target, None, DuplicatePolicy::Reject)
        .unwrap();
    target.import_lexicon(&plan).unwrap();
    assert_eq!(
        target.export_lexicon_bytes(TransferFormat::Json).unwrap(),
        bytes
    );
    assert!(source
        .prepare(&target, None, DuplicatePolicy::Reject)
        .is_err());
    let plan = source
        .prepare(&target, None, DuplicatePolicy::KeepBoth)
        .unwrap();
    assert_eq!(plan.preview().duplicate_count, 2);
    target.import_lexicon(&plan).unwrap();
    let entries = target.lexicon_page(&LexiconQuery::default()).unwrap();
    assert_eq!(entries.total, 4);
    for entry in entries.items.iter().filter(|entry| entry.lemma == "word") {
        let word = target.lexeme(&entry.id).unwrap().entry;
        assert_eq!(
            word.data.root_id.as_ref(),
            Some(&word.data.relations[0].target_id)
        );
        assert_eq!(
            target
                .lexeme(word.data.root_id.as_ref().unwrap())
                .unwrap()
                .incoming_count,
            2
        );
    }
    let destination = directory.path().join("existing.json");
    fs::write(&destination, b"keep me").unwrap();
    assert!(source_project
        .export_lexicon(&destination, TransferFormat::Json)
        .is_err());
    assert_eq!(fs::read(destination).unwrap(), b"keep me");
}

#[test]
fn csv_mapping_preview_quoting_and_supported_text_round_trip() {
    let (_directory, mut project) = project();
    let source = ImportSource::from_bytes(
        "mapped.csv",
        TransferFormat::Csv,
        "meaning,word,unused\n\"a comma, and\na newline\",ŋa,ignored\n".as_bytes(),
    )
    .unwrap();
    let map = CsvMapping {
        lemma: 1,
        definition: 0,
        ..mapping()
    };
    let plan = source
        .prepare(&project, Some(&map), DuplicatePolicy::Reject)
        .unwrap();
    assert!(plan
        .preview()
        .warnings
        .iter()
        .any(|warning| warning.contains("1 unmapped")));
    assert_eq!(
        project
            .lexicon_page(&LexiconQuery::default())
            .unwrap()
            .total,
        0
    );
    project.import_lexicon(&plan).unwrap();
    let bytes = project.export_lexicon_bytes(TransferFormat::Csv).unwrap();
    let exported = ImportSource::from_bytes("export.csv", TransferFormat::Csv, &bytes).unwrap();
    let (_directory2, mut other) = self::project();
    let map = CsvMapping {
        lemma: 0,
        definition: 3,
        pronunciation: Some(1),
        part_of_speech: Some(2),
        notes: Some(4),
    };
    let plan = exported
        .prepare(&other, Some(&map), DuplicatePolicy::Reject)
        .unwrap();
    other.import_lexicon(&plan).unwrap();
    assert_eq!(
        other.export_lexicon_bytes(TransferFormat::Csv).unwrap(),
        bytes
    );
}

#[test]
fn invalid_imports_and_stale_previews_leave_saved_data_unchanged() {
    let (_directory, mut project) = project();
    let source = ImportSource::from_bytes(
        "bad.csv",
        TransferFormat::Csv,
        b"lemma,definition\ngood,meaning\nbad,\n",
    )
    .unwrap();
    assert!(source
        .prepare(&project, Some(&mapping()), DuplicatePolicy::Reject)
        .is_err());
    assert_eq!(project.summary().unwrap().revision, 0);
    assert_eq!(
        project
            .lexicon_page(&LexiconQuery::default())
            .unwrap()
            .total,
        0
    );
    let source = csv(2);
    let plan = source
        .prepare(&project, Some(&mapping()), DuplicatePolicy::Reject)
        .unwrap();
    project
        .save_lexeme(None, None, draft("intervening edit"))
        .unwrap();
    assert_eq!(
        project.import_lexicon(&plan).unwrap_err().code,
        ErrorCode::Conflict
    );
    let plan = source
        .prepare(&project, Some(&mapping()), DuplicatePolicy::Reject)
        .unwrap();
    let path = project.path().to_owned();
    drop(project);
    let mut reopened = Project::open(&path).unwrap();
    assert_eq!(
        reopened.import_lexicon(&plan).unwrap_err().code,
        ErrorCode::Conflict
    );
    assert_eq!(
        reopened
            .lexicon_page(&LexiconQuery::default())
            .unwrap()
            .total,
        1
    );
    assert!(ImportSource::from_bytes(
        "unknown.json",
        TransferFormat::Json,
        br#"{"format":"lingforge-lexicon","version":1,"entries":[],"unknown":true}"#
    )
    .is_err());
    assert!(ImportSource::from_bytes("invalid.csv", TransferFormat::Csv, b"a,b\n1,2,3\n").is_err());
}

#[test]
fn broken_graphs_unknown_fields_and_failed_backups_cannot_change_the_lexicon() {
    let (_directory, mut project) = project();
    let entry = project
        .save_lexeme(None, None, draft("original"))
        .unwrap()
        .entry;
    let before_revision = project.summary().unwrap().revision;
    let before_backups = project.backups().unwrap().len();
    let unchanged = project
        .save_lexeme(Some(&entry.id), Some(entry.revision), entry.data.clone())
        .unwrap();
    assert_eq!(unchanged.entry.revision, entry.revision);
    assert_eq!(project.summary().unwrap().revision, before_revision);
    assert_eq!(project.backups().unwrap().len(), before_backups);
    let bytes = project.export_lexicon_bytes(TransferFormat::Json).unwrap();
    let mut document: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    document["entries"][0]["data"]["rootId"] =
        serde_json::json!("00000000-0000-4000-8000-000000000099");
    let source = ImportSource::from_bytes(
        "missing-root.json",
        TransferFormat::Json,
        &serde_json::to_vec(&document).unwrap(),
    )
    .unwrap();
    assert!(source
        .prepare(&project, None, DuplicatePolicy::KeepBoth)
        .is_err());
    document["entries"][0]["data"]["unknownField"] = serde_json::json!(true);
    assert!(ImportSource::from_bytes(
        "unknown.json",
        TransferFormat::Json,
        &serde_json::to_vec(&document).unwrap()
    )
    .is_err());
    let backup_dir = project.path().join("backups");
    fs::rename(&backup_dir, project.path().join("retained-backups")).unwrap();
    fs::write(&backup_dir, b"blocked").unwrap();
    let mut changed = entry.data.clone();
    changed.lemma = "cannot commit".into();
    assert!(project
        .save_lexeme(Some(&entry.id), Some(entry.revision), changed)
        .is_err());
    assert!(project.delete_lexeme(&entry.id, entry.revision).is_err());
    assert_eq!(project.lexeme(&entry.id).unwrap().entry.data, entry.data);
    assert_eq!(project.summary().unwrap().revision, before_revision);
}

#[test]
fn pagination_is_bounded_and_deterministic_and_v2_migration_is_backed_up() {
    let (_directory, mut project) = project();
    let path = project.path().to_owned();
    drop(project);
    let connection = rusqlite::Connection::open(path.join("project.sqlite3")).unwrap();
    connection.execute_batch("DROP TABLE automation_cells; DROP TABLE automation_overrides; DROP TABLE automation_batches; DROP TABLE automation_programs; DROP TABLE font_profiles; DROP TABLE notebook_characters; DROP TABLE notebook_scripts; DROP TABLE notebook_phonemes; DROP TABLE notebook_lexemes; DROP TABLE notebook_records; DROP TABLE script_phoneme_references; DROP TABLE writing_systems; DROP TABLE phoneme_references; DROP TABLE phonology_profile; DROP TABLE phonemes; DROP TABLE lexical_relations; DROP TABLE lexemes; PRAGMA user_version=2;").unwrap();
    drop(connection);
    project = Project::open(&path).unwrap();
    assert!(project
        .backups()
        .unwrap()
        .iter()
        .any(|backup| backup.kind == "migration"));
    let source = csv(103);
    let plan = source
        .prepare(&project, Some(&mapping()), DuplicatePolicy::Reject)
        .unwrap();
    project.import_lexicon(&plan).unwrap();
    let first = project.lexicon_page(&LexiconQuery::default()).unwrap();
    let second = project
        .lexicon_page(&LexiconQuery {
            offset: 50,
            ..Default::default()
        })
        .unwrap();
    assert_eq!(first.items.len(), 50);
    assert_eq!(first.total, 103);
    assert!(first
        .items
        .iter()
        .all(|entry| second.items.iter().all(|other| entry.id != other.id)));
    assert_eq!(
        project
            .lexicon_page(&LexiconQuery {
                offset: 100,
                ..Default::default()
            })
            .unwrap()
            .items
            .len(),
        3
    );
    assert!(project
        .lexicon_page(&LexiconQuery {
            limit: 101,
            ..Default::default()
        })
        .is_err());
}

#[test]
#[ignore = "Manual 10,000-entry benchmark; run only after execution is authorized"]
fn benchmark_10000_entries() {
    let (_directory, mut project) = project();
    let source = csv(10_000);
    let start = Instant::now();
    let plan = source
        .prepare(&project, Some(&mapping()), DuplicatePolicy::Reject)
        .unwrap();
    eprintln!("preview_10000_ms={}", start.elapsed().as_millis());
    let start = Instant::now();
    project.import_lexicon(&plan).unwrap();
    eprintln!(
        "import_10000_with_backup_ms={}",
        start.elapsed().as_millis()
    );
    assert_eq!(
        project
            .lexicon_page(&LexiconQuery::default())
            .unwrap()
            .total,
        10_000
    );
    let mut timings = Vec::new();
    for index in 0..100 {
        let query = LexiconQuery {
            text: format!("word-{:02}", index % 10),
            sort: if index % 2 == 0 {
                LexiconSort::Lemma
            } else {
                LexiconSort::Updated
            },
            ignore_marks: index % 3 == 0,
            ..Default::default()
        };
        let start = Instant::now();
        let result = project.lexicon_page(&query).unwrap();
        timings.push(start.elapsed().as_micros());
        assert!(result.items.len() <= 50);
    }
    timings.sort();
    eprintln!(
        "query_p50_us={} query_p95_us={} query_max_us={}",
        timings[49], timings[94], timings[99]
    );
    let path = project.path().to_owned();
    drop(project);
    let start = Instant::now();
    let reopened = Project::open(&path).unwrap();
    eprintln!("reopen_validation_10000_ms={}", start.elapsed().as_millis());
    assert_eq!(
        reopened
            .lexicon_page(&LexiconQuery::default())
            .unwrap()
            .total,
        10_000
    );
}
