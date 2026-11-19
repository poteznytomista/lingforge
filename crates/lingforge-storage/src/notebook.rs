use crate::{invalid, io, lexicon::touch_project, sql, Project, Result};
use lingforge_core::{
    lexicon::{input_error, search_key},
    notebook::{
        self, CharacterMapping, Conversion, NotebookDraft, NotebookRecord, Paragraph, RecordKind,
    },
    writing::{identifier, ScriptDraft, TextUnit, Transliteration},
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs::File,
    io::{Read, Write},
    path::Path,
};

const MAX_REVISION: i64 = 9_007_199_254_740_991;
const MAX_RECORD: usize = 4 * 1024 * 1024;
const MAX_FILE: usize = MAX_RECORD + 4096;
const TABLES: [&str; 3] = ["notebook_lexemes", "notebook_phonemes", "notebook_scripts"];
type Pair = (String, String);
#[derive(Default, PartialEq, Eq)]
struct References {
    targets: [BTreeSet<Pair>; 3],
    characters: BTreeSet<(String, String, String)>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSummary {
    pub id: String,
    pub title: String,
    pub kind: RecordKind,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub record: NotebookRecord,
    pub existing: Option<NotebookRecord>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NotebookFile {
    format: String,
    version: u32,
    project_id: String,
    record: NotebookRecord,
}
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Structured,
    Plain,
    Transliteration,
}

fn conflict() -> AppError {
    AppError::new(
        ErrorCode::Conflict,
        "This document or grammar section changed. Reload it before continuing.",
    )
}
fn decode(row: &Row<'_>) -> rusqlite::Result<NotebookRecord> {
    let json: String = row.get(2)?;
    let data = serde_json::from_str(&json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(NotebookRecord {
        id: row.get(0)?,
        revision: row.get(1)?,
        data,
    })
}
fn read(connection: &Connection, id: &str) -> Result<Option<NotebookRecord>> {
    connection
        .query_row(
            "SELECT id,revision,data_json FROM notebook_records WHERE id=?1",
            [id],
            decode,
        )
        .optional()
        .map_err(sql)
}
fn validate(
    record: &NotebookRecord,
    scripts: &[lingforge_core::writing::WritingSystem],
) -> Result<()> {
    if !identifier(&record.id) || !(0..=MAX_REVISION).contains(&record.revision) {
        return Err(invalid("Invalid notebook identity or revision."));
    }
    if serde_json::to_vec(&record.data)
        .map_err(|_| invalid("Cannot encode notebook data."))?
        .len()
        > MAX_RECORD
    {
        return Err(input_error(
            "Each document or grammar section must fit within 4 MiB.",
        ));
    }
    record.data.validate(scripts)
}
fn references(record: &NotebookRecord) -> References {
    let mut refs = References::default();
    let owner = &record.id;
    match &record.data {
        NotebookDraft::Document(d) => {
            for p in &d.paragraphs {
                for link in &p.links {
                    refs.targets[0].insert((owner.clone(), link.entry_id.clone()));
                }
                if let Some(script) = &p.script_id {
                    refs.targets[2].insert((owner.clone(), script.clone()));
                    for unit in &p.units {
                        if let TextUnit::Symbol { character_id } = unit {
                            refs.characters.insert((
                                owner.clone(),
                                script.clone(),
                                character_id.clone(),
                            ));
                        }
                    }
                }
            }
        }
        NotebookDraft::Grammar(g) => {
            for id in g
                .lexeme_ids
                .iter()
                .chain(g.morphology.iter().filter_map(|m| m.entry_id.as_ref()))
            {
                refs.targets[0].insert((owner.clone(), id.clone()));
            }
            for id in &g.phoneme_ids {
                refs.targets[1].insert((owner.clone(), id.clone()));
            }
        }
    }
    refs
}
fn validate_targets(connection: &Connection, refs: &References) -> Result<()> {
    for (index, table) in ["lexemes", "phonemes", "writing_systems"]
        .iter()
        .enumerate()
    {
        let mut statement = connection
            .prepare(&format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"))
            .map_err(sql)?;
        for (_, id) in &refs.targets[index] {
            if !statement
                .query_row([id], |row| row.get::<_, bool>(0))
                .map_err(sql)?
            {
                return Err(input_error("A document or grammar section references a missing entry, phoneme or writing system."));
            }
        }
    }
    Ok(())
}
pub(crate) fn validate_database(connection: &Connection) -> Result<()> {
    let count: i64 = connection
        .query_row("SELECT count(*) FROM notebook_records", [], |r| r.get(0))
        .map_err(sql)?;
    if count > 512 {
        return Err(invalid(
            "A project can contain at most 512 documents and grammar sections combined.",
        ));
    }
    let scripts = crate::writing::all(connection)?;
    let mut expected = References::default();
    let mut statement = connection
        .prepare("SELECT id,revision,data_json,kind FROM notebook_records")
        .map_err(sql)?;
    let rows = statement
        .query_map([], |row| Ok((decode(row)?, row.get::<_, String>(3)?)))
        .map_err(sql)?;
    for row in rows {
        let (record, kind) = row.map_err(sql)?;
        validate(&record, &scripts)?;
        if record.data.kind().as_str() != kind {
            return Err(invalid("Notebook kind does not match its source data."));
        }
        let refs = references(&record);
        validate_targets(connection, &refs)?;
        for (i, set) in refs.targets.into_iter().enumerate() {
            expected.targets[i].extend(set);
        }
        expected.characters.extend(refs.characters);
    }
    let mut actual = References::default();
    for (i, table) in TABLES.iter().enumerate() {
        let mut statement = connection
            .prepare(&format!("SELECT owner_id,target_id FROM {table}"))
            .map_err(sql)?;
        actual.targets[i] = statement
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(sql)?
            .collect::<std::result::Result<_, _>>()
            .map_err(sql)?;
    }
    let mut statement = connection
        .prepare("SELECT owner_id,script_id,character_id FROM notebook_characters")
        .map_err(sql)?;
    actual.characters = statement
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    if actual != expected {
        return Err(invalid(
            "Notebook reference projections do not match their source data.",
        ));
    }
    Ok(())
}
pub(crate) fn require_unreferenced(connection: &Connection, target: usize, id: &str) -> Result<()> {
    let table = TABLES[target];
    let title: Option<String> = connection.query_row(&format!("SELECT json_extract(n.data_json,'$.content.title') FROM {table} r JOIN notebook_records n ON n.id=r.owner_id WHERE r.target_id=?1 ORDER BY n.id LIMIT 1"), [id], |r| r.get(0)).optional().map_err(sql)?;
    if let Some(title) = title {
        return Err(input_error(format!("Referenced by ‘{title}’ in Documents or Grammar. Remove those links before deleting this item.").as_str()));
    }
    Ok(())
}
pub(crate) fn check_characters(
    connection: &Connection,
    id: &str,
    data: &ScriptDraft,
) -> Result<()> {
    let mut statement = connection
        .prepare("SELECT DISTINCT character_id FROM notebook_characters WHERE script_id=?1")
        .map_err(sql)?;
    let ids = statement
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(sql)?;
    for id in ids {
        let id = id.map_err(sql)?;
        if !data.characters.iter().any(|c| c.id == id) {
            return Err(input_error("Documents still use a removed character. Replace its occurrences before saving the writing system."));
        }
    }
    Ok(())
}
impl Project {
    pub fn notebook_records(&self, kind: RecordKind) -> Result<Vec<RecordSummary>> {
        let mut statement = self.connection.prepare("SELECT id,json_extract(data_json,'$.content.title') FROM notebook_records WHERE kind=?1").map_err(sql)?;
        let mut rows: Vec<_> = statement
            .query_map([kind.as_str()], |r| {
                Ok(RecordSummary {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    kind,
                })
            })
            .map_err(sql)?
            .collect::<std::result::Result<_, _>>()
            .map_err(sql)?;
        rows.sort_by_cached_key(|r| (search_key(&r.title, false), r.id.clone()));
        Ok(rows)
    }
    pub fn notebook_record(&self, id: &str) -> Result<NotebookRecord> {
        read(&self.connection, id)?.ok_or_else(conflict)
    }
    pub fn save_notebook_record(
        &mut self,
        id: &str,
        revision: Option<i64>,
        data: NotebookDraft,
    ) -> Result<NotebookRecord> {
        let old = read(&self.connection, id)?;
        if old.as_ref().map(|r| r.revision) != revision
            || revision.is_some_and(|r| r >= MAX_REVISION)
            || old.as_ref().is_some_and(|r| r.data.kind() != data.kind())
        {
            return Err(conflict());
        }
        let record = NotebookRecord {
            id: id.into(),
            revision: revision.map_or(0, |r| r + 1),
            data,
        };
        validate(&record, &crate::writing::all(&self.connection)?)?;
        let refs = references(&record);
        validate_targets(&self.connection, &refs)?;
        if let Some(old) = old.as_ref().filter(|r| r.data == record.data) {
            return Ok(old.clone());
        }
        if old.is_none()
            && self
                .connection
                .query_row("SELECT count(*) FROM notebook_records", [], |r| {
                    r.get::<_, i64>(0)
                })
                .map_err(sql)?
                >= 512
        {
            return Err(input_error(
                "The project limit is 512 documents and grammar sections combined.",
            ));
        }
        let json = serde_json::to_string(&record.data)
            .map_err(|_| invalid("Cannot encode notebook data."))?;
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if let Some(revision) = revision {
            if tx.execute("UPDATE notebook_records SET revision=?2,data_json=?3 WHERE id=?1 AND revision=?4", params![id, record.revision, json, revision]).map_err(sql)? != 1 { return Err(conflict()); }
        } else {
            tx.execute(
                "INSERT INTO notebook_records VALUES (?1,?2,?3,?4)",
                params![id, record.revision, record.data.kind().as_str(), json],
            )
            .map_err(sql)?;
        }
        for (i, table) in TABLES.iter().enumerate() {
            tx.execute(&format!("DELETE FROM {table} WHERE owner_id=?1"), [id])
                .map_err(sql)?;
            for (owner, target) in &refs.targets[i] {
                tx.execute(
                    &format!("INSERT INTO {table} VALUES (?1,?2)"),
                    params![owner, target],
                )
                .map_err(sql)?;
            }
        }
        tx.execute("DELETE FROM notebook_characters WHERE owner_id=?1", [id])
            .map_err(sql)?;
        for (owner, script, character) in refs.characters {
            tx.execute(
                "INSERT INTO notebook_characters VALUES (?1,?2,?3)",
                params![owner, script, character],
            )
            .map_err(sql)?;
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)?;
        Ok(record)
    }
    pub fn delete_notebook_record(&mut self, id: &str, revision: i64) -> Result<()> {
        if self.notebook_record(id)?.revision != revision {
            return Err(conflict());
        }
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if tx
            .execute(
                "DELETE FROM notebook_records WHERE id=?1 AND revision=?2",
                params![id, revision],
            )
            .map_err(sql)?
            != 1
        {
            return Err(conflict());
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)
    }
    pub fn edit_paragraph(
        &self,
        paragraph: &Paragraph,
        start: usize,
        end: usize,
        units: Vec<TextUnit>,
    ) -> Result<Paragraph> {
        let scripts = crate::writing::all(&self.connection)?;
        notebook::validate_paragraph(paragraph, &scripts)?;
        let result = notebook::replace_range(paragraph, start, end, units)?;
        notebook::validate_paragraph(&result, &scripts)?;
        Ok(result)
    }
    pub fn convert_paragraph(
        &self,
        paragraph: &Paragraph,
        target_id: &str,
        mappings: &[CharacterMapping],
    ) -> Result<Conversion> {
        let scripts = crate::writing::all(&self.connection)?;
        notebook::validate_paragraph(paragraph, &scripts)?;
        let source = scripts
            .iter()
            .find(|s| Some(&s.id) == paragraph.script_id.as_ref())
            .ok_or_else(|| input_error("Choose a source writing system before converting."))?;
        let target = scripts
            .iter()
            .find(|s| s.id == target_id)
            .ok_or_else(|| input_error("The target writing system is unavailable."))?;
        notebook::convert(paragraph, &source.data, target, mappings)
    }
    pub fn document_text(&self, data: &NotebookDraft, plain: bool) -> Result<Transliteration> {
        let scripts = crate::writing::all(&self.connection)?;
        data.validate(&scripts)?;
        let NotebookDraft::Document(d) = data else {
            return Err(input_error("Text export is available for documents."));
        };
        let mut blocks = Vec::new();
        let mut issues = Vec::new();
        for (i, p) in d.paragraphs.iter().enumerate() {
            if plain && p.units.iter().any(|u| matches!(u, TextUnit::Symbol { .. })) {
                issues.push(format!("Paragraph {} contains custom symbols. Choose transliteration or structured export.", i + 1));
                continue;
            }
            let empty = ScriptDraft {
                name: "Literal Unicode".into(),
                ..Default::default()
            };
            let script = p
                .script_id
                .as_ref()
                .and_then(|id| scripts.iter().find(|s| &s.id == id))
                .map(|s| &s.data)
                .unwrap_or(&empty);
            let converted = lingforge_core::writing::transliterate(script, &p.units)?;
            blocks.push(converted.text);
            issues.extend(
                converted
                    .issues
                    .into_iter()
                    .map(|s| format!("Paragraph {}: {s}", i + 1)),
            );
        }
        Ok(Transliteration {
            text: if issues.is_empty() {
                blocks.join("\n\n")
            } else {
                String::new()
            },
            issues,
        })
    }
    pub fn export_notebook_bytes(
        &self,
        id: &str,
        revision: i64,
        format: ExportFormat,
    ) -> Result<Vec<u8>> {
        let record = self.notebook_record(id)?;
        if record.revision != revision {
            return Err(conflict());
        }
        if matches!(format, ExportFormat::Structured) {
            // Compact JSON ensures every valid exported record also fits the import bound.
            serde_json::to_vec(&NotebookFile {
                format: "lingforge-notebook".into(),
                version: 1,
                project_id: self.summary()?.id,
                record,
            })
            .map_err(|_| invalid("Cannot encode notebook file."))
        } else {
            let result = self.document_text(&record.data, matches!(format, ExportFormat::Plain))?;
            if !result.issues.is_empty() {
                return Err(input_error(&result.issues.join(" ")));
            }
            Ok(result.text.into_bytes())
        }
    }
    pub fn export_notebook(
        &self,
        id: &str,
        revision: i64,
        path: &Path,
        format: ExportFormat,
    ) -> Result<()> {
        let bytes = self.export_notebook_bytes(id, revision, format)?;
        let parent = path
            .parent()
            .ok_or_else(|| input_error("Choose an export folder."))?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(io)?;
        temporary.write_all(&bytes).map_err(io)?;
        temporary.as_file().sync_all().map_err(io)?;
        temporary.persist_noclobber(path).map_err(|e| io(e.error))?;
        crate::sync_directory(parent)
    }
    pub fn read_notebook_bytes(&self, bytes: &[u8]) -> Result<ImportCandidate> {
        if bytes.len() > MAX_FILE {
            return Err(input_error(
                "The notebook file exceeds 4 MiB plus its envelope.",
            ));
        }
        let file: NotebookFile = serde_json::from_slice(bytes)
            .map_err(|_| input_error("Invalid notebook JSON or unsupported fields."))?;
        if file.format != "lingforge-notebook" || file.version != 1 {
            return Err(AppError::new(
                ErrorCode::UnsupportedVersion,
                "Unsupported notebook format.",
            ));
        }
        if file.project_id != self.summary()?.id {
            return Err(input_error("This file belongs to another project. Use a complete project archive to transfer its dependencies and identities."));
        }
        validate(&file.record, &crate::writing::all(&self.connection)?)?;
        validate_targets(&self.connection, &references(&file.record))?;
        let existing = read(&self.connection, &file.record.id)?;
        if existing
            .as_ref()
            .is_some_and(|r| r.data.kind() != file.record.data.kind())
        {
            return Err(conflict());
        }
        Ok(ImportCandidate {
            record: file.record,
            existing,
        })
    }
    pub fn read_notebook_file(&self, path: &Path) -> Result<ImportCandidate> {
        crate::regular_file(path)?;
        let mut bytes = Vec::new();
        File::open(path)
            .map_err(io)?
            .take((MAX_FILE + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        self.read_notebook_bytes(&bytes)
    }
}
