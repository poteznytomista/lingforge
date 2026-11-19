use crate::{
    invalid,
    lexicon::{canonical_id, touch_project},
    now, sql, Project, Result,
};
use lingforge_core::{
    lexicon::{input_error, search_key, Lexeme},
    phonology::{
        Articulation, Phoneme, PhonemeDraft, PhonemeKind, PhonologyDraft, PhonologyProfile,
        PronunciationSegment,
    },
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::Serialize;
use std::collections::{BTreeSet, HashSet};
use uuid::Uuid;

pub const MAX_PHONEMES: usize = 1000;
const MAX_REVISION: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhonemeSummary {
    pub id: String,
    pub label: String,
    pub kind: PhonemeKind,
    pub articulation: Articulation,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    pub phonemes: Vec<PhonemeSummary>,
    pub total: usize,
    pub profile: PhonologyProfile,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhonemeReference {
    pub entry_id: String,
    pub lemma: String,
    pub form_id: Option<String>,
    pub form_text: String,
    pub occurrences: u32,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhonemeDetails {
    pub phoneme: Phoneme,
    pub incoming: Vec<PhonemeReference>,
    pub incoming_count: u32,
    pub script_incoming: Vec<crate::writing::ScriptReference>,
    pub script_incoming_count: u32,
}

fn conflict() -> AppError {
    AppError::new(
        ErrorCode::Conflict,
        "This phonology record changed. Reload it before continuing.",
    )
}
pub(crate) fn validate_phoneme(phoneme: &Phoneme) -> Result<()> {
    phoneme.data.validate()?;
    if !canonical_id(&phoneme.id)
        || !(0..=MAX_REVISION).contains(&phoneme.revision)
        || !(0..=8_640_000_000_000_000).contains(&phoneme.created_at)
        || !(0..=8_640_000_000_000_000).contains(&phoneme.updated_at)
        || phoneme
            .data
            .allophones
            .iter()
            .any(|item| !item.id.as_deref().is_some_and(canonical_id))
    {
        return Err(invalid(
            "Invalid phoneme identifier, allophone identifier, revision, or timestamp.",
        ));
    }
    if serde_json::to_vec(&phoneme.data)
        .map_err(|_| invalid("Cannot encode phoneme."))?
        .len()
        > 128 * 1024
    {
        return Err(input_error("A phoneme must fit within 128 KiB."));
    }
    Ok(())
}
fn decode_phoneme(row: &Row<'_>) -> rusqlite::Result<Phoneme> {
    let json: String = row.get(2)?;
    let data = serde_json::from_str(&json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(Phoneme {
        id: row.get(0)?,
        revision: row.get(1)?,
        data,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}
pub(crate) fn all_phonemes(connection: &Connection) -> Result<Vec<Phoneme>> {
    let count: u32 = connection
        .query_row("SELECT count(*) FROM phonemes", [], |row| row.get(0))
        .map_err(sql)?;
    if u64::from(count) > MAX_PHONEMES as u64 {
        return Err(invalid("The current inventory limit is 1,000 phonemes."));
    }
    let mut statement = connection
        .prepare("SELECT id,revision,data_json,created_at,updated_at FROM phonemes ORDER BY id")
        .map_err(sql)?;
    let phonemes = statement
        .query_map([], decode_phoneme)
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    Ok(phonemes)
}
fn read_phoneme(connection: &Connection, id: &str) -> Result<Phoneme> {
    connection
        .query_row(
            "SELECT id,revision,data_json,created_at,updated_at FROM phonemes WHERE id=?1",
            [id],
            decode_phoneme,
        )
        .optional()
        .map_err(sql)?
        .ok_or_else(conflict)
}
pub(crate) fn phoneme_ids(connection: &Connection) -> Result<HashSet<String>> {
    let mut statement = connection.prepare("SELECT id FROM phonemes").map_err(sql)?;
    let ids = statement
        .query_map([], |row| row.get(0))
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    Ok(ids)
}
pub(crate) fn linked_ids(entry: &Lexeme) -> impl Iterator<Item = &str> {
    entry
        .data
        .pronunciation_segments
        .iter()
        .chain(
            entry
                .data
                .forms
                .iter()
                .flat_map(|form| &form.pronunciation_segments),
        )
        .filter_map(PronunciationSegment::phoneme_id)
}
pub(crate) fn validate_links(entries: &[Lexeme], ids: &HashSet<String>) -> Result<()> {
    for entry in entries {
        if linked_ids(entry).any(|id| !canonical_id(id) || !ids.contains(id)) {
            return Err(input_error("A pronunciation references a missing phoneme. Choose an inventory phoneme or import its definition."));
        }
    }
    Ok(())
}
pub(crate) fn write_phoneme(
    connection: &Connection,
    phoneme: &Phoneme,
    previous_revision: Option<i64>,
) -> Result<()> {
    let data =
        serde_json::to_string(&phoneme.data).map_err(|_| invalid("Cannot encode phoneme."))?;
    let changed = if let Some(revision) = previous_revision {
        connection.execute("UPDATE phonemes SET revision=?2,data_json=?3,created_at=?4,updated_at=?5 WHERE id=?1 AND revision=?6", params![phoneme.id, phoneme.revision, data, phoneme.created_at, phoneme.updated_at, revision]).map_err(sql)?
    } else {
        connection
            .execute(
                "INSERT INTO phonemes VALUES (?1,?2,?3,?4,?5)",
                params![
                    phoneme.id,
                    phoneme.revision,
                    data,
                    phoneme.created_at,
                    phoneme.updated_at
                ],
            )
            .map_err(sql)?
    };
    if changed != 1 {
        return Err(conflict());
    }
    Ok(())
}

fn references(entry: &Lexeme) -> Vec<(String, String, u32, String)> {
    let mut rows = Vec::new();
    let mut add = |form_id: &str, segments: &[PronunciationSegment]| {
        for (position, segment) in segments.iter().enumerate() {
            if let Some(id) = segment.phoneme_id() {
                rows.push((entry.id.clone(), form_id.into(), position as u32, id.into()));
            }
        }
    };
    add("", &entry.data.pronunciation_segments);
    for form in &entry.data.forms {
        add(
            form.id.as_deref().unwrap_or(""),
            &form.pronunciation_segments,
        );
    }
    rows
}
pub(crate) fn write_references(connection: &Connection, entry: &Lexeme) -> Result<()> {
    connection
        .execute(
            "DELETE FROM phoneme_references WHERE entry_id=?1",
            [&entry.id],
        )
        .map_err(sql)?;
    for (entry_id, form_id, position, phoneme_id) in references(entry) {
        connection
            .execute(
                "INSERT INTO phoneme_references VALUES (?1,?2,?3,?4)",
                params![entry_id, form_id, position, phoneme_id],
            )
            .map_err(sql)?;
    }
    Ok(())
}
pub(crate) fn validate_lexical_graph(connection: &Connection, entries: &[Lexeme]) -> Result<()> {
    validate_links(entries, &phoneme_ids(connection)?)?;
    let expected: BTreeSet<_> = entries.iter().flat_map(references).collect();
    let mut statement = connection
        .prepare("SELECT entry_id,form_id,position,phoneme_id FROM phoneme_references")
        .map_err(sql)?;
    let actual = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u32>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(sql)?
        .collect::<std::result::Result<BTreeSet<_>, _>>()
        .map_err(sql)?;
    if expected != actual {
        return Err(invalid(
            "The phoneme reference index does not match the stored pronunciations.",
        ));
    }
    Ok(())
}
fn validate_profile(profile: &PhonologyProfile) -> Result<()> {
    profile.data.validate()?;
    if !(0..=MAX_REVISION).contains(&profile.revision)
        || profile
            .data
            .patterns
            .iter()
            .map(|item| &item.id)
            .chain(profile.data.rules.iter().map(|item| &item.id))
            .any(|id| !id.as_deref().is_some_and(canonical_id))
    {
        return Err(invalid(
            "Invalid phonology description identifiers or revision.",
        ));
    }
    if serde_json::to_vec(&profile.data)
        .map_err(|_| invalid("Cannot encode phonology descriptions."))?
        .len()
        > 256 * 1024
    {
        return Err(input_error(
            "Phonology descriptions must fit within 256 KiB.",
        ));
    }
    Ok(())
}
fn read_profile(connection: &Connection) -> Result<PhonologyProfile> {
    let (revision, json): (i64, String) = connection
        .query_row(
            "SELECT revision,data_json FROM phonology_profile WHERE singleton=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(sql)?;
    Ok(PhonologyProfile {
        revision,
        data: serde_json::from_str(&json)
            .map_err(|_| invalid("Invalid phonology descriptions."))?,
    })
}
pub(crate) fn validate_database(connection: &Connection) -> Result<()> {
    for phoneme in all_phonemes(connection)? {
        validate_phoneme(&phoneme)?;
    }
    let count: i64 = connection
        .query_row("SELECT count(*) FROM phonology_profile", [], |row| {
            row.get(0)
        })
        .map_err(sql)?;
    if count != 1 {
        return Err(invalid(
            "A project must contain exactly one phonology description record.",
        ));
    }
    validate_profile(&read_profile(connection)?)
}

impl Project {
    pub fn phonology_inventory(&self, search: &str) -> Result<Inventory> {
        if search.chars().count() > 256 {
            return Err(input_error("Limit inventory searches to 256 characters."));
        }
        let phonemes = all_phonemes(&self.connection)?;
        let total = phonemes.len();
        let key = search_key(search.trim(), false);
        let mut phonemes: Vec<_> = phonemes
            .into_iter()
            .filter(|phoneme| {
                let data = &phoneme.data;
                let searchable = format!(
                    "{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
                    data.label,
                    data.articulation.place,
                    data.articulation.manner,
                    data.articulation.voicing,
                    data.articulation.height,
                    data.articulation.backness,
                    data.articulation.rounding,
                    data.notes
                );
                key.is_empty() || search_key(&searchable, false).contains(&key)
            })
            .map(|phoneme| PhonemeSummary {
                id: phoneme.id,
                label: phoneme.data.label,
                kind: phoneme.data.kind,
                articulation: phoneme.data.articulation,
            })
            .collect();
        phonemes
            .sort_by_cached_key(|phoneme| (search_key(&phoneme.label, false), phoneme.id.clone()));
        Ok(Inventory {
            phonemes,
            total,
            profile: read_profile(&self.connection)?,
        })
    }
    pub fn phoneme(&self, id: &str) -> Result<PhonemeDetails> {
        let phoneme = read_phoneme(&self.connection, id)?;
        let incoming_count = self.connection.query_row("SELECT count(*) FROM (SELECT DISTINCT entry_id,form_id FROM phoneme_references WHERE phoneme_id=?1)", [id], |row| row.get(0)).map_err(sql)?;
        let mut statement = self.connection.prepare("SELECT l.id,l.lemma,r.form_id,coalesce(json_extract(f.value,'$.text'),''),count(*) FROM phoneme_references r JOIN lexemes l ON l.id=r.entry_id LEFT JOIN json_each(l.forms_json) f ON json_extract(f.value,'$.id')=r.form_id WHERE r.phoneme_id=?1 GROUP BY l.id,r.form_id ORDER BY l.lemma,l.id,r.form_id LIMIT 50").map_err(sql)?;
        let incoming = statement
            .query_map([id], |row| {
                let form_id: String = row.get(2)?;
                Ok(PhonemeReference {
                    entry_id: row.get(0)?,
                    lemma: row.get(1)?,
                    form_id: if form_id.is_empty() {
                        None
                    } else {
                        Some(form_id)
                    },
                    form_text: row.get(3)?,
                    occurrences: row.get(4)?,
                })
            })
            .map_err(sql)?
            .collect::<std::result::Result<_, _>>()
            .map_err(sql)?;
        let (script_incoming, script_incoming_count) =
            crate::writing::incoming(&self.connection, id)?;
        Ok(PhonemeDetails {
            phoneme,
            incoming,
            incoming_count,
            script_incoming,
            script_incoming_count,
        })
    }
    pub fn save_phoneme(
        &mut self,
        id: Option<&str>,
        revision: Option<i64>,
        mut data: PhonemeDraft,
    ) -> Result<PhonemeDetails> {
        data.validate()?;
        let old = id
            .map(|id| read_phoneme(&self.connection, id))
            .transpose()?;
        if old.as_ref().map(|item| item.revision) != revision
            || revision.is_some_and(|value| value >= MAX_REVISION)
        {
            return Err(conflict());
        }
        if old.is_none() && phoneme_ids(&self.connection)?.len() >= MAX_PHONEMES {
            return Err(input_error(
                "The current limit is 1,000 phonemes per project.",
            ));
        }
        for allophone in &mut data.allophones {
            if allophone.id.is_none() {
                allophone.id = Some(Uuid::new_v4().to_string());
            }
        }
        let phoneme = Phoneme {
            id: old
                .as_ref()
                .map(|item| item.id.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            revision: old.as_ref().map_or(0, |item| item.revision + 1),
            created_at: old.as_ref().map_or_else(now, |item| item.created_at),
            updated_at: now(),
            data,
        };
        validate_phoneme(&phoneme)?;
        if old.as_ref().is_some_and(|item| item.data == phoneme.data) {
            return self.phoneme(&phoneme.id);
        }
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        write_phoneme(&transaction, &phoneme, revision)?;
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)?;
        self.phoneme(&phoneme.id)
    }
    pub fn delete_phoneme(&mut self, id: &str, revision: i64) -> Result<()> {
        let details = self.phoneme(id)?;
        if details.phoneme.revision != revision {
            return Err(conflict());
        }
        crate::notebook::require_unreferenced(&self.connection, 1, id)?;
        if details.incoming_count > 0 || details.script_incoming_count > 0 {
            return Err(input_error("Pronunciations or writing-system characters reference this phoneme. Remove or replace those links before deleting it."));
        }
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if transaction
            .execute(
                "DELETE FROM phonemes WHERE id=?1 AND revision=?2",
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
    pub fn save_phonology_profile(
        &mut self,
        revision: i64,
        mut data: PhonologyDraft,
    ) -> Result<PhonologyProfile> {
        data.validate()?;
        let old = read_profile(&self.connection)?;
        if old.revision != revision || revision >= MAX_REVISION {
            return Err(conflict());
        }
        for id in data
            .patterns
            .iter_mut()
            .map(|item| &mut item.id)
            .chain(data.rules.iter_mut().map(|item| &mut item.id))
        {
            if id.is_none() {
                *id = Some(Uuid::new_v4().to_string());
            }
        }
        let next = PhonologyProfile {
            revision: revision + 1,
            data,
        };
        validate_profile(&next)?;
        if old.data == next.data {
            return Ok(old);
        }
        let json = serde_json::to_string(&next.data)
            .map_err(|_| invalid("Cannot encode phonology descriptions."))?;
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if transaction.execute("UPDATE phonology_profile SET revision=?1,data_json=?2 WHERE singleton=1 AND revision=?3", params![next.revision, json, revision]).map_err(sql)? != 1 { return Err(conflict()); }
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)?;
        Ok(next)
    }
}
