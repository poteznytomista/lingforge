//! Bounded, previewed interchange. Prepared imports contain the exact records
//! approved by the user and are bound to a project session and revision.
use crate::lexicon::{
    all_entries, existing_kinds, touch_project, validate_graph, write_entry, write_relations,
    MAX_ENTRIES,
};
use crate::{io, now, sql, Project, Result};
use lingforge_core::phonology::{Phoneme, PronunciationSegment};
use lingforge_core::{
    lexicon::{input_error, search_key, EntryKind, Lexeme, LexemeDraft, Sense},
    AppError, ErrorCode,
};
use rusqlite::TransactionBehavior;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;

pub const MAX_TRANSFER_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferFormat {
    Json,
    Csv,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DuplicatePolicy {
    Reject,
    KeepBoth,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CsvMapping {
    pub lemma: usize,
    pub definition: usize,
    pub pronunciation: Option<usize>,
    pub part_of_speech: Option<usize>,
    pub notes: Option<usize>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LexiconDocument {
    pub format: String,
    pub version: u32,
    pub entries: Vec<Lexeme>,
    #[serde(default)]
    pub phonemes: Vec<Phoneme>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub token: String,
    pub name: String,
    pub format: TransferFormat,
    pub headers: Vec<String>,
    pub sample_rows: Vec<Vec<String>>,
    pub count: usize,
}
enum SourceData {
    Json(LexiconDocument),
    Csv {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
}
pub struct ImportSource {
    token: String,
    name: String,
    data: SourceData,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub token: String,
    pub count: usize,
    pub duplicate_count: usize,
    pub warnings: Vec<String>,
    pub sample: Vec<crate::lexicon::LexemeListItem>,
}
pub struct PreparedImport {
    token: String,
    session_id: String,
    revision: i64,
    entries: Vec<Lexeme>,
    phonemes: Vec<Phoneme>,
    duplicate_count: usize,
    warnings: Vec<String>,
}
impl PreparedImport {
    pub fn token(&self) -> &str {
        &self.token
    }
    pub fn preview(&self) -> ImportPreview {
        ImportPreview {
            token: self.token.clone(),
            count: self.entries.len(),
            duplicate_count: self.duplicate_count,
            warnings: self.warnings.clone(),
            sample: self
                .entries
                .iter()
                .take(10)
                .map(|entry| crate::lexicon::LexemeListItem {
                    id: entry.id.clone(),
                    lemma: entry.data.lemma.clone(),
                    pronunciation: entry.data.pronunciation.clone(),
                    part_of_speech: entry.data.part_of_speech.clone(),
                    kind: entry.data.kind,
                    definition: entry.data.senses[0].definition.chars().take(180).collect(),
                })
                .collect(),
        }
    }
}

impl ImportSource {
    pub fn read(path: &Path, format: TransferFormat) -> Result<Self> {
        crate::regular_file(path)?;
        let mut bytes = Vec::new();
        File::open(path)
            .map_err(io)?
            .take((MAX_TRANSFER_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        Self::from_bytes(&name, format, &bytes)
    }

    pub fn from_bytes(name: &str, format: TransferFormat, bytes: &[u8]) -> Result<Self> {
        if bytes.len() > MAX_TRANSFER_BYTES {
            return Err(input_error(
                "Lexicon files are limited to 16 MiB. Use a project archive for larger transfers.",
            ));
        }
        let data = match format {
            TransferFormat::Json => {
                let document: LexiconDocument = serde_json::from_slice(bytes).map_err(|_| input_error("Invalid lexicon JSON. Use the supported format and remove unsupported fields."))?;
                if document.format != "lingforge-lexicon" || !matches!(document.version, 1 | 2) {
                    return Err(input_error(
                        "Unsupported lexicon document format or version.",
                    ));
                }
                if document.phonemes.len() > crate::phonology::MAX_PHONEMES {
                    return Err(input_error("An import can contain at most 1,000 phonemes."));
                }
                if document.version == 1
                    && (!document.phonemes.is_empty()
                        || document.entries.iter().any(|entry| {
                            !entry.data.pronunciation_segments.is_empty()
                                || entry
                                    .data
                                    .forms
                                    .iter()
                                    .any(|form| !form.pronunciation_segments.is_empty())
                        }))
                {
                    return Err(input_error(
                        "Linked pronunciation data requires lexicon JSON version 2.",
                    ));
                }
                if document.entries.len() > MAX_ENTRIES {
                    return Err(input_error("An import can contain at most 20,000 entries."));
                }
                SourceData::Json(document)
            }
            TransferFormat::Csv => {
                let mut reader = csv::ReaderBuilder::new()
                    .has_headers(true)
                    .flexible(false)
                    .from_reader(bytes);
                let headers = reader
                    .headers()
                    .map_err(|_| {
                        input_error("Cannot read CSV headers. Use UTF-8 comma-separated text.")
                    })?
                    .iter()
                    .map(str::to_owned)
                    .collect::<Vec<_>>();
                if headers.is_empty()
                    || headers.len() > 64
                    || headers.iter().any(|header| header.chars().count() > 256)
                {
                    return Err(input_error(
                        "CSV requires 1–64 headers, each at most 256 characters.",
                    ));
                }
                let mut rows = Vec::new();
                for record in reader.records() {
                    let record = record.map_err(|_| {
                        input_error(
                            "Invalid CSV row: check UTF-8 encoding, quoting, and column counts.",
                        )
                    })?;
                    if rows.len() >= MAX_ENTRIES {
                        return Err(input_error("An import can contain at most 20,000 entries."));
                    }
                    rows.push(record.iter().map(str::to_owned).collect());
                }
                SourceData::Csv { headers, rows }
            }
        };
        Ok(Self {
            token: Uuid::new_v4().to_string(),
            name: name.chars().take(256).collect(),
            data,
        })
    }

    pub fn token(&self) -> &str {
        &self.token
    }
    pub fn info(&self) -> SourceInfo {
        let (format, headers, sample_rows, count) = match &self.data {
            SourceData::Json(document) => (
                TransferFormat::Json,
                Vec::new(),
                Vec::new(),
                document.entries.len(),
            ),
            SourceData::Csv { headers, rows } => (
                TransferFormat::Csv,
                headers.clone(),
                rows.iter()
                    .take(5)
                    .map(|row| {
                        row.iter()
                            .map(|cell| cell.chars().take(160).collect())
                            .collect()
                    })
                    .collect(),
                rows.len(),
            ),
        };
        SourceInfo {
            token: self.token.clone(),
            name: self.name.clone(),
            format,
            headers,
            sample_rows,
            count,
        }
    }

    pub fn prepare(
        &self,
        project: &Project,
        mapping: Option<&CsvMapping>,
        policy: DuplicatePolicy,
    ) -> Result<PreparedImport> {
        let mut warnings = Vec::new();
        let mut entries = match &self.data {
            SourceData::Json(document) => {
                if mapping.is_some() {
                    return Err(input_error("JSON imports do not use CSV column mappings."));
                }
                document.entries.clone()
            }
            SourceData::Csv { headers, rows } => {
                let mapping = mapping.ok_or_else(|| {
                    input_error("Map the lemma and definition columns before previewing.")
                })?;
                let columns = [
                    Some(mapping.lemma),
                    Some(mapping.definition),
                    mapping.pronunciation,
                    mapping.part_of_speech,
                    mapping.notes,
                ]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>();
                let distinct = columns.iter().copied().collect::<HashSet<_>>();
                if distinct.len() != columns.len()
                    || columns.iter().any(|column| *column >= headers.len())
                {
                    return Err(input_error(
                        "Map each field to a different existing column.",
                    ));
                }
                let omitted = headers.len() - distinct.len();
                if omitted > 0 {
                    warnings.push(format!("{omitted} unmapped CSV columns will be omitted. Only the five mapped fields are supported."));
                }
                warnings.push("CSV creates lexical entries with one sense. Roots, forms, sense notes, etymology, identifiers, relationships, and linked pronunciation segments require JSON.".into());
                rows.iter()
                    .map(|row| {
                        let field = |column: Option<usize>| {
                            column.map(|index| row[index].clone()).unwrap_or_default()
                        };
                        Lexeme {
                            id: Uuid::new_v4().to_string(),
                            revision: 0,
                            created_at: now(),
                            updated_at: now(),
                            data: LexemeDraft {
                                lemma: row[mapping.lemma].clone(),
                                pronunciation: field(mapping.pronunciation),
                                pronunciation_segments: Vec::new(),
                                part_of_speech: field(mapping.part_of_speech),
                                kind: EntryKind::Lexeme,
                                root_id: None,
                                etymology: String::new(),
                                notes: field(mapping.notes),
                                senses: vec![Sense {
                                    id: Some(Uuid::new_v4().to_string()),
                                    definition: row[mapping.definition].clone(),
                                    notes: String::new(),
                                }],
                                forms: Vec::new(),
                                relations: Vec::new(),
                            },
                        }
                    })
                    .collect()
            }
        };
        if entries.is_empty() {
            return Err(input_error(
                "The selected file contains no lexical entries.",
            ));
        }
        let existing = all_entries(&project.connection)?;
        if existing.len() + entries.len() > MAX_ENTRIES {
            return Err(input_error(
                "This import would exceed the current 20,000-entry project limit.",
            ));
        }
        let mut ids: HashSet<String> = existing.iter().map(|entry| entry.id.clone()).collect();
        let mut keys: HashSet<(String, String, String)> =
            existing.iter().map(duplicate_key).collect();
        let mut incoming_ids = HashSet::new();
        for entry in &entries {
            crate::lexicon::validate_entry(entry)?;
            if !incoming_ids.insert(entry.id.clone()) {
                return Err(input_error("Duplicate identifiers inside the file cannot be disambiguated. Correct the source file."));
            }
        }
        let mut remapped = HashMap::new();
        let mut duplicate_count = 0;
        for entry in &mut entries {
            let duplicate_id = ids.contains(&entry.id);
            let duplicate_content = !keys.insert(duplicate_key(entry));
            if duplicate_id || duplicate_content {
                duplicate_count += 1;
                if policy == DuplicatePolicy::Reject {
                    return Err(input_error("The file contains an existing identifier or matching lemma/category/kind. Select Keep both to retain separate entries."));
                }
            }
            if duplicate_id {
                let mut new_id = Uuid::new_v4().to_string();
                while ids.contains(&new_id) || incoming_ids.contains(&new_id) {
                    new_id = Uuid::new_v4().to_string();
                }
                remapped.insert(entry.id.clone(), new_id.clone());
                entry.id = new_id;
            }
            ids.insert(entry.id.clone());
        }
        for entry in &mut entries {
            if let Some(id) = &mut entry.data.root_id {
                if let Some(next) = remapped.get(id) {
                    *id = next.clone();
                }
            }
            for relation in &mut entry.data.relations {
                if let Some(next) = remapped.get(&relation.target_id) {
                    relation.target_id = next.clone();
                }
            }
        }
        if duplicate_count > 0 {
            warnings.push(format!("Keep both will add {duplicate_count} duplicates as separate entries; existing records are unchanged. Colliding IDs and their internal references are remapped."));
        }
        validate_graph(&entries, &existing_kinds(&project.connection)?)?;
        let mut phonemes = match &self.data {
            SourceData::Json(document) => document.phonemes.clone(),
            SourceData::Csv { .. } => Vec::new(),
        };
        let mut phoneme_ids = crate::phonology::phoneme_ids(&project.connection)?;
        if phoneme_ids.len() + phonemes.len() > crate::phonology::MAX_PHONEMES {
            return Err(input_error(
                "This import would exceed the 1,000-phoneme project limit.",
            ));
        }
        let mut supplied_ids = HashSet::new();
        for phoneme in &phonemes {
            crate::phonology::validate_phoneme(phoneme)?;
            if !supplied_ids.insert(phoneme.id.clone()) {
                return Err(input_error(
                    "The file contains duplicate phoneme identifiers.",
                ));
            }
        }
        let mut remapped_phonemes = HashMap::new();
        for phoneme in &mut phonemes {
            if phoneme_ids.contains(&phoneme.id) {
                if policy == DuplicatePolicy::Reject {
                    return Err(input_error("A phoneme ID already exists in this project. Select Keep both to import a separate phoneme and remap its pronunciation links."));
                }
                let mut id = Uuid::new_v4().to_string();
                while phoneme_ids.contains(&id) || supplied_ids.contains(&id) {
                    id = Uuid::new_v4().to_string();
                }
                remapped_phonemes.insert(phoneme.id.clone(), id.clone());
                phoneme.id = id;
            }
            phoneme_ids.insert(phoneme.id.clone());
        }
        for entry in &mut entries {
            for segment in entry.data.pronunciation_segments.iter_mut().chain(
                entry
                    .data
                    .forms
                    .iter_mut()
                    .flat_map(|form| &mut form.pronunciation_segments),
            ) {
                if let PronunciationSegment::Phoneme { phoneme_id, .. } = segment {
                    if let Some(id) = remapped_phonemes.get(phoneme_id) {
                        *phoneme_id = id.clone();
                    }
                }
            }
        }
        crate::phonology::validate_links(&entries, &phoneme_ids)?;
        if !phonemes.is_empty() {
            warnings.push(format!("The import also adds {} phoneme definitions, including their features and allophone descriptions. {} colliding phoneme IDs will be remapped with their pronunciation links. Project-level syllable and phonotactic descriptions are not included.", phonemes.len(), remapped_phonemes.len()));
        }
        Ok(PreparedImport {
            token: Uuid::new_v4().to_string(),
            session_id: project.session_id().into(),
            revision: project.summary()?.revision,
            entries,
            phonemes,
            duplicate_count,
            warnings,
        })
    }
}

fn duplicate_key(entry: &Lexeme) -> (String, String, String) {
    (
        search_key(&entry.data.lemma, false),
        search_key(&entry.data.part_of_speech, false),
        entry.data.kind.as_str().into(),
    )
}

impl Project {
    pub fn import_lexicon(&mut self, prepared: &PreparedImport) -> Result<usize> {
        if self.session_id() != prepared.session_id || self.summary()?.revision != prepared.revision
        {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "The project changed after this preview. Preview the import again.",
            ));
        }
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if crate::database::summary(&transaction)?.revision != prepared.revision {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "The project changed while importing. Preview again.",
            ));
        }
        for phoneme in &prepared.phonemes {
            crate::phonology::write_phoneme(&transaction, phoneme, None)?;
        }
        for entry in &prepared.entries {
            write_entry(&transaction, entry, false)?;
        }
        for entry in &prepared.entries {
            write_relations(&transaction, entry)?;
            crate::phonology::write_references(&transaction, entry)?;
        }
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)?;
        Ok(prepared.entries.len())
    }

    pub fn export_lexicon_bytes(&self, format: TransferFormat) -> Result<Vec<u8>> {
        let entries = all_entries(&self.connection)?;
        let bytes = match format {
            TransferFormat::Json => {
                let linked: HashSet<_> = entries
                    .iter()
                    .flat_map(crate::phonology::linked_ids)
                    .map(str::to_owned)
                    .collect();
                let phonemes = crate::phonology::all_phonemes(&self.connection)?
                    .into_iter()
                    .filter(|phoneme| linked.contains(phoneme.id.as_str()))
                    .collect();
                serde_json::to_vec_pretty(&LexiconDocument {
                    format: "lingforge-lexicon".into(),
                    version: 2,
                    entries,
                    phonemes,
                })
                .map_err(|_| input_error("Cannot encode the lexicon."))?
            }
            TransferFormat::Csv => {
                let mut writer = csv::WriterBuilder::new().from_writer(Vec::new());
                writer
                    .write_record([
                        "lemma",
                        "pronunciation",
                        "part_of_speech",
                        "definition",
                        "notes",
                    ])
                    .map_err(|_| input_error("Cannot encode CSV."))?;
                for entry in entries {
                    let definitions = entry
                        .data
                        .senses
                        .iter()
                        .map(|sense| sense.definition.as_str())
                        .collect::<Vec<_>>()
                        .join("\n");
                    if definitions.chars().count() > 4000 {
                        return Err(input_error("Combined definitions exceed CSV's single-sense limit. Export JSON to preserve them."));
                    }
                    writer
                        .write_record([
                            entry.data.lemma,
                            entry.data.pronunciation,
                            entry.data.part_of_speech,
                            definitions,
                            entry.data.notes,
                        ])
                        .map_err(|_| input_error("Cannot encode CSV."))?;
                }
                writer
                    .into_inner()
                    .map_err(|_| input_error("Cannot finish CSV export."))?
            }
        };
        if bytes.len() > MAX_TRANSFER_BYTES {
            return Err(input_error("This lexicon exceeds the 16 MiB interchange limit. Export the full project archive instead."));
        }
        Ok(bytes)
    }

    pub fn export_lexicon(&self, path: &Path, format: TransferFormat) -> Result<()> {
        let bytes = self.export_lexicon_bytes(format)?;
        let parent = path
            .parent()
            .ok_or_else(|| input_error("Choose a destination folder."))?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(io)?;
        temporary.write_all(&bytes).map_err(io)?;
        temporary.as_file().sync_all().map_err(io)?;
        temporary
            .persist_noclobber(path)
            .map_err(|error| io(error.error))?;
        crate::sync_directory(parent)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_mid_batch_constraint_failure_rolls_back_every_row_and_revision() {
        let directory = tempfile::tempdir().unwrap();
        let mut project = Project::create(
            directory.path(),
            &lingforge_core::project::ProjectMetadata {
                name: "Atomic import".into(),
                language_name: String::new(),
                description: String::new(),
            },
        )
        .unwrap();
        let source = ImportSource::from_bytes(
            "two.csv",
            TransferFormat::Csv,
            b"lemma,definition\none,first\ntwo,second\n",
        )
        .unwrap();
        let mapping = CsvMapping {
            lemma: 0,
            definition: 1,
            pronunciation: None,
            part_of_speech: None,
            notes: None,
        };
        let mut prepared = source
            .prepare(&project, Some(&mapping), DuplicatePolicy::Reject)
            .unwrap();
        let phoneme = Phoneme {
            id: Uuid::new_v4().to_string(),
            revision: 0,
            created_at: 0,
            updated_at: 0,
            data: lingforge_core::phonology::PhonemeDraft {
                label: "θ".into(),
                kind: lingforge_core::phonology::PhonemeKind::Consonant,
                articulation: Default::default(),
                features: Vec::new(),
                allophones: Vec::new(),
                notes: String::new(),
            },
        };
        crate::phonology::validate_phoneme(&phoneme).unwrap();
        prepared.entries[0]
            .data
            .pronunciation_segments
            .push(PronunciationSegment::Phoneme {
                phoneme_id: phoneme.id.clone(),
                annotation: String::new(),
            });
        prepared.phonemes.push(phoneme);
        // Inject a storage failure into the second row after public validation.
        // The phoneme and first entry are inserted before SQLite rejects this CHECK.
        prepared.entries[1].revision = -1;
        assert!(project.import_lexicon(&prepared).is_err());
        assert_eq!(project.summary().unwrap().revision, 0);
        assert_eq!(
            project
                .lexicon_page(&crate::lexicon::LexiconQuery::default())
                .unwrap()
                .total,
            0
        );
        assert_eq!(project.phonology_inventory("").unwrap().total, 0);
        let references: i64 = project
            .connection
            .query_row("SELECT count(*) FROM phoneme_references", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(references, 0);
        assert!(project
            .backups()
            .unwrap()
            .iter()
            .any(|backup| backup.kind == "auto"));
    }
}
