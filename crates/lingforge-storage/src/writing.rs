use crate::{invalid, lexicon::touch_project, sql, Project, Result};
use lingforge_core::{
    lexicon::{input_error, search_key},
    writing::{identifier, ScriptDraft, WritingSystem},
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::Serialize;
use std::collections::BTreeSet;
use uuid::Uuid;

const MAX_REVISION: i64 = 9_007_199_254_740_991;
pub fn new_identity() -> String {
    Uuid::new_v4().to_string()
}
/// Exports explicitly supplied draft geometry; does not imply a project save.
pub fn export_glyph(
    path: &std::path::Path,
    model: &lingforge_core::glyph_edit::EditableOutline,
) -> Result<()> {
    use std::io::Write;
    let svg = lingforge_core::glyph_edit::svg(model)?;
    let parent = path
        .parent()
        .ok_or_else(|| input_error("Choose a destination folder."))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(crate::io)?;
    temporary.write_all(svg.as_bytes()).map_err(crate::io)?;
    temporary.as_file().sync_all().map_err(crate::io)?;
    temporary
        .persist_noclobber(path)
        .map_err(|e| crate::io(e.error))?;
    crate::sync_directory(parent)
}
fn conflict() -> AppError {
    AppError::new(
        ErrorCode::Conflict,
        "This writing system changed. Reload it before continuing.",
    )
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSummary {
    pub id: String,
    pub name: String,
    pub character_count: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptReference {
    pub script_id: String,
    pub name: String,
    pub character_id: String,
    pub character_name: String,
}
fn decode(row: &Row<'_>) -> rusqlite::Result<WritingSystem> {
    let json: String = row.get(2)?;
    let data = serde_json::from_str(&json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(WritingSystem {
        id: row.get(0)?,
        revision: row.get(1)?,
        data,
    })
}
pub(crate) fn all(connection: &Connection) -> Result<Vec<WritingSystem>> {
    let count: i64 = connection
        .query_row("SELECT count(*) FROM writing_systems", [], |row| row.get(0))
        .map_err(sql)?;
    if count > 32 {
        return Err(invalid(
            "The experimental project limit is 32 writing systems.",
        ));
    }
    let mut statement = connection
        .prepare("SELECT id,revision,data_json FROM writing_systems ORDER BY id")
        .map_err(sql)?;
    let rows = statement
        .query_map([], decode)
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    Ok(rows)
}
fn read(connection: &Connection, id: &str) -> Result<WritingSystem> {
    connection
        .query_row(
            "SELECT id,revision,data_json FROM writing_systems WHERE id=?1",
            [id],
            decode,
        )
        .optional()
        .map_err(sql)?
        .ok_or_else(conflict)
}
fn validate(script: &WritingSystem) -> Result<()> {
    script.data.validate()?;
    if !identifier(&script.id) || !(0..=MAX_REVISION).contains(&script.revision) {
        return Err(invalid("Invalid writing-system identifier or revision."));
    }
    if serde_json::to_vec(&script.data)
        .map_err(|_| invalid("Cannot encode writing system."))?
        .len()
        > 2 * 1024 * 1024
    {
        return Err(input_error(
            "A writing system, including outlines and sample text, must fit within 2 MiB.",
        ));
    }
    Ok(())
}
fn references(script: &WritingSystem) -> BTreeSet<(String, String, String)> {
    script
        .data
        .characters
        .iter()
        .flat_map(|character| {
            character
                .phoneme_ids
                .iter()
                .map(move |id| (script.id.clone(), character.id.clone(), id.clone()))
        })
        .collect()
}
pub(crate) fn validate_database(connection: &Connection) -> Result<()> {
    let phonemes = crate::phonology::phoneme_ids(connection)?;
    let mut expected = BTreeSet::new();
    for script in all(connection)? {
        validate(&script)?;
        let links = references(&script);
        if links.iter().any(|(_, _, id)| !phonemes.contains(id)) {
            return Err(invalid("A character references a missing phoneme."));
        }
        expected.extend(links);
    }
    let mut statement = connection
        .prepare("SELECT script_id,character_id,phoneme_id FROM script_phoneme_references")
        .map_err(sql)?;
    let actual = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(sql)?
        .collect::<std::result::Result<BTreeSet<_>, _>>()
        .map_err(sql)?;
    if actual != expected {
        return Err(invalid(
            "Writing-system phoneme references do not match their source data.",
        ));
    }
    Ok(())
}
pub(crate) fn incoming(
    connection: &Connection,
    phoneme_id: &str,
) -> Result<(Vec<ScriptReference>, u32)> {
    let count = connection
        .query_row(
            "SELECT count(*) FROM script_phoneme_references WHERE phoneme_id=?1",
            [phoneme_id],
            |row| row.get(0),
        )
        .map_err(sql)?;
    let mut statement = connection.prepare("SELECT w.id,json_extract(w.data_json,'$.name'),r.character_id,json_extract(c.value,'$.name') FROM script_phoneme_references r JOIN writing_systems w ON w.id=r.script_id JOIN json_each(w.data_json,'$.characters') c ON json_extract(c.value,'$.id')=r.character_id WHERE r.phoneme_id=?1 ORDER BY w.id,r.character_id LIMIT 50").map_err(sql)?;
    let rows = statement
        .query_map([phoneme_id], |row| {
            Ok(ScriptReference {
                script_id: row.get(0)?,
                name: row.get(1)?,
                character_id: row.get(2)?,
                character_name: row.get(3)?,
            })
        })
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    Ok((rows, count))
}
impl Project {
    pub fn writing_systems(&self) -> Result<Vec<ScriptSummary>> {
        let mut rows: Vec<_> = all(&self.connection)?
            .into_iter()
            .map(|script| ScriptSummary {
                id: script.id,
                name: script.data.name,
                character_count: script.data.characters.len(),
            })
            .collect();
        rows.sort_by_cached_key(|row| (search_key(&row.name, false), row.id.clone()));
        Ok(rows)
    }
    pub fn writing_system(&self, id: &str) -> Result<WritingSystem> {
        read(&self.connection, id)
    }
    pub fn save_writing_system(
        &mut self,
        id: Option<&str>,
        revision: Option<i64>,
        data: ScriptDraft,
    ) -> Result<WritingSystem> {
        let old = id.map(|id| read(&self.connection, id)).transpose()?;
        if old.as_ref().map(|script| script.revision) != revision
            || revision.is_some_and(|rev| rev >= MAX_REVISION)
        {
            return Err(conflict());
        }
        if old.is_none() && all(&self.connection)?.len() >= 32 {
            return Err(input_error(
                "The experimental limit is 32 writing systems per project.",
            ));
        }
        let script = WritingSystem {
            id: id
                .map(str::to_owned)
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            revision: old.as_ref().map_or(0, |s| s.revision + 1),
            data,
        };
        validate(&script)?;
        crate::notebook::check_characters(&self.connection, &script.id, &script.data)?;
        crate::fonts::check_script(&self.connection, &script.id, &script.data)?;
        let links = references(&script);
        let phonemes = crate::phonology::phoneme_ids(&self.connection)?;
        if links.iter().any(|(_, _, id)| !phonemes.contains(id)) {
            return Err(input_error(
                "A character references a phoneme that is no longer available.",
            ));
        }
        if let Some(old) = old.as_ref().filter(|old| old.data == script.data) {
            return Ok(old.clone());
        }
        let json = serde_json::to_string(&script.data)
            .map_err(|_| invalid("Cannot encode writing system."))?;
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if let Some(revision) = revision {
            if transaction.execute("UPDATE writing_systems SET revision=?2,data_json=?3 WHERE id=?1 AND revision=?4", params![script.id, script.revision, json, revision]).map_err(sql)? != 1 { return Err(conflict()); }
        } else {
            transaction
                .execute(
                    "INSERT INTO writing_systems VALUES (?1,?2,?3)",
                    params![script.id, script.revision, json],
                )
                .map_err(sql)?;
        }
        transaction
            .execute(
                "DELETE FROM script_phoneme_references WHERE script_id=?1",
                [&script.id],
            )
            .map_err(sql)?;
        for (script_id, character_id, phoneme_id) in links {
            transaction
                .execute(
                    "INSERT INTO script_phoneme_references VALUES (?1,?2,?3)",
                    params![script_id, character_id, phoneme_id],
                )
                .map_err(sql)?;
        }
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)?;
        Ok(script)
    }
    pub fn delete_writing_system(&mut self, id: &str, revision: i64) -> Result<()> {
        if read(&self.connection, id)?.revision != revision {
            return Err(conflict());
        }
        crate::notebook::require_unreferenced(&self.connection, 2, id)?;
        crate::fonts::require_unreferenced(&self.connection, id)?;
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if transaction
            .execute(
                "DELETE FROM writing_systems WHERE id=?1 AND revision=?2",
                params![id, revision],
            )
            .map_err(sql)?
            != 1
        {
            return Err(conflict());
        }
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)
    }
}
