use crate::{invalid, now, sql, Project, Result};
use lingforge_core::{
    lexicon::{input_error, search_key, searchable_text, EntryKind, Lexeme, LexemeDraft, Relation},
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub const MAX_ENTRIES: usize = 20_000;
// Schema 3 allowed 256 KiB. Empty segment arrays add at most 27 bytes for
// the entry and each of its 128 forms; preserve valid records at that limit.
const MAX_ENTRY_BYTES: usize = 260 * 1024;
const MAX_REVISION: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LexiconSort {
    Lemma,
    Updated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LexiconQuery {
    pub text: String,
    pub part_of_speech: String,
    pub kind: Option<EntryKind>,
    pub ignore_marks: bool,
    pub sort: LexiconSort,
    pub descending: bool,
    pub offset: u32,
    pub limit: u32,
}
impl Default for LexiconQuery {
    fn default() -> Self {
        Self {
            text: String::new(),
            part_of_speech: String::new(),
            kind: None,
            ignore_marks: false,
            sort: LexiconSort::Lemma,
            descending: false,
            offset: 0,
            limit: 50,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexemeListItem {
    pub id: String,
    pub lemma: String,
    pub pronunciation: String,
    pub part_of_speech: String,
    pub kind: EntryKind,
    pub definition: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexiconPage {
    pub items: Vec<LexemeListItem>,
    pub total: u32,
    pub offset: u32,
    pub limit: u32,
    pub categories: Vec<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexemeReference {
    pub id: String,
    pub lemma: String,
    pub relation_type: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexemeDetails {
    pub entry: Lexeme,
    pub incoming: Vec<LexemeReference>,
    pub incoming_count: u32,
}

pub(crate) fn canonical_id(id: &str) -> bool {
    Uuid::parse_str(id)
        .map(|uuid| uuid.to_string())
        .ok()
        .as_deref()
        == Some(id)
}

pub(crate) fn validate_entry(entry: &Lexeme) -> Result<()> {
    entry.data.validate()?;
    if !canonical_id(&entry.id)
        || !(0..=MAX_REVISION).contains(&entry.revision)
        || !(0..=8_640_000_000_000_000).contains(&entry.created_at)
        || !(0..=8_640_000_000_000_000).contains(&entry.updated_at)
    {
        return Err(invalid(
            "Invalid lexical identifier, revision, or timestamp.",
        ));
    }
    for id in entry
        .data
        .senses
        .iter()
        .map(|item| &item.id)
        .chain(entry.data.forms.iter().map(|item| &item.id))
    {
        if !id.as_ref().is_some_and(|id| canonical_id(id)) {
            return Err(invalid(
                "A saved sense or form is missing a valid identifier.",
            ));
        }
    }
    if entry
        .data
        .root_id
        .as_ref()
        .is_some_and(|id| !canonical_id(id) || *id == entry.id)
        || entry
            .data
            .relations
            .iter()
            .any(|relation| !canonical_id(&relation.target_id) || relation.target_id == entry.id)
    {
        return Err(invalid("Invalid or self-referencing lexical relationship."));
    }
    if serde_json::to_vec(&entry.data)
        .map_err(|_| invalid("Cannot encode lexical entry."))?
        .len()
        > MAX_ENTRY_BYTES
    {
        return Err(input_error("An entry must fit within 260 KiB."));
    }
    Ok(())
}

fn json_column<T: serde::de::DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
    let value: String = row.get(index)?;
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

const COLUMNS: &str = "id, revision, lemma, pronunciation, part_of_speech, kind, root_id, etymology, notes, senses_json, forms_json, created_at, updated_at";
fn columns(connection: &Connection) -> Result<String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(sql)?;
    Ok(format!(
        "{COLUMNS}, {}",
        if version >= 4 {
            "pronunciation_json"
        } else {
            "'[]'"
        }
    ))
}
fn entry_row(row: &Row<'_>) -> rusqlite::Result<Lexeme> {
    let kind: String = row.get(5)?;
    let kind = match kind.as_str() {
        "root" => EntryKind::Root,
        "lexeme" => EntryKind::Lexeme,
        _ => return Err(rusqlite::Error::InvalidQuery),
    };
    Ok(Lexeme {
        id: row.get(0)?,
        revision: row.get(1)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        data: LexemeDraft {
            lemma: row.get(2)?,
            pronunciation: row.get(3)?,
            pronunciation_segments: json_column(row, 13)?,
            part_of_speech: row.get(4)?,
            kind,
            root_id: row.get(6)?,
            etymology: row.get(7)?,
            notes: row.get(8)?,
            senses: json_column(row, 9)?,
            forms: json_column(row, 10)?,
            relations: Vec::new(),
        },
    })
}

pub(crate) fn read_entry(connection: &Connection, id: &str) -> Result<Lexeme> {
    let mut entry = connection
        .query_row(
            &format!("SELECT {} FROM lexemes WHERE id=?1", columns(connection)?),
            [id],
            entry_row,
        )
        .optional()
        .map_err(sql)?
        .ok_or_else(|| {
            AppError::new(
                ErrorCode::Conflict,
                "This lexical entry no longer exists. Refresh the list.",
            )
        })?;
    let mut statement = connection.prepare("SELECT target_id, relation_type FROM lexical_relations WHERE source_id=?1 ORDER BY relation_type, target_id").map_err(sql)?;
    entry.data.relations = statement
        .query_map([id], |row| {
            Ok(Relation {
                target_id: row.get(0)?,
                relation_type: row.get(1)?,
            })
        })
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    Ok(entry)
}

pub(crate) fn all_entries(connection: &Connection) -> Result<Vec<Lexeme>> {
    let count: i64 = connection
        .query_row("SELECT count(*) FROM lexemes", [], |row| row.get(0))
        .map_err(sql)?;
    if count > MAX_ENTRIES as i64 {
        return Err(invalid(
            "This project exceeds the current 20,000-entry lexicon limit.",
        ));
    }
    let mut statement = connection
        .prepare(&format!(
            "SELECT {} FROM lexemes ORDER BY id",
            columns(connection)?
        ))
        .map_err(sql)?;
    let mut entries: Vec<Lexeme> = statement
        .query_map([], entry_row)
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    let indexes: HashMap<String, usize> = entries
        .iter()
        .enumerate()
        .map(|(index, entry)| (entry.id.clone(), index))
        .collect();
    let mut links = connection.prepare("SELECT source_id, target_id, relation_type FROM lexical_relations ORDER BY source_id, relation_type, target_id").map_err(sql)?;
    let rows = links
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Relation {
                    target_id: row.get(1)?,
                    relation_type: row.get(2)?,
                },
            ))
        })
        .map_err(sql)?;
    for row in rows {
        let (source, relation) = row.map_err(sql)?;
        let index = indexes
            .get(&source)
            .ok_or_else(|| invalid("A relationship has no source entry."))?;
        entries[*index].data.relations.push(relation);
    }
    Ok(entries)
}

pub(crate) fn validate_graph(
    entries: &[Lexeme],
    existing: &HashMap<String, EntryKind>,
) -> Result<()> {
    let mut kinds = existing.clone();
    let mut seen = HashSet::new();
    for entry in entries {
        validate_entry(entry)?;
        if !seen.insert(&entry.id) {
            return Err(invalid("The lexicon contains duplicate identifiers."));
        }
        kinds.insert(entry.id.clone(), entry.data.kind);
    }
    for entry in entries {
        if let Some(root) = &entry.data.root_id {
            if kinds.get(root) != Some(&EntryKind::Root) {
                return Err(input_error(
                    "The selected root is missing or is not a root entry.",
                ));
            }
        }
        if entry
            .data
            .relations
            .iter()
            .any(|relation| !kinds.contains_key(&relation.target_id))
        {
            return Err(input_error(
                "A related entry is missing from this project or import.",
            ));
        }
    }
    Ok(())
}

pub(crate) fn existing_kinds(connection: &Connection) -> Result<HashMap<String, EntryKind>> {
    let mut statement = connection
        .prepare("SELECT id, kind FROM lexemes")
        .map_err(sql)?;
    let kinds = statement
        .query_map([], |row| {
            let kind: String = row.get(1)?;
            Ok((
                row.get(0)?,
                if kind == "root" {
                    EntryKind::Root
                } else {
                    EntryKind::Lexeme
                },
            ))
        })
        .map_err(sql)?
        .collect::<std::result::Result<_, _>>()
        .map_err(sql)?;
    Ok(kinds)
}

pub(crate) fn write_entry(connection: &Connection, entry: &Lexeme, update: bool) -> Result<()> {
    let data = &entry.data;
    let search = searchable_text(data);
    let senses =
        serde_json::to_string(&data.senses).map_err(|_| invalid("Cannot encode senses."))?;
    let forms = serde_json::to_string(&data.forms).map_err(|_| invalid("Cannot encode forms."))?;
    let pronunciation = serde_json::to_string(&data.pronunciation_segments)
        .map_err(|_| invalid("Cannot encode pronunciation segments."))?;
    let query = if update {
        "UPDATE lexemes SET revision=?2, lemma=?3, pronunciation=?4, part_of_speech=?5, kind=?6, root_id=?7, etymology=?8, notes=?9, senses_json=?10, forms_json=?11, search_key=?12, search_fold=?13, lemma_key=?14, created_at=?15, updated_at=?16, pronunciation_json=?17 WHERE id=?1"
    } else {
        "INSERT INTO lexemes (id,revision,lemma,pronunciation,part_of_speech,kind,root_id,etymology,notes,senses_json,forms_json,search_key,search_fold,lemma_key,created_at,updated_at,pronunciation_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)"
    };
    connection
        .execute(
            query,
            params![
                entry.id,
                entry.revision,
                data.lemma,
                data.pronunciation,
                data.part_of_speech,
                data.kind.as_str(),
                data.root_id,
                data.etymology,
                data.notes,
                senses,
                forms,
                search_key(&search, false),
                search_key(&search, true),
                search_key(&data.lemma, false),
                entry.created_at,
                entry.updated_at,
                pronunciation
            ],
        )
        .map_err(sql)?;
    Ok(())
}

pub(crate) fn write_relations(connection: &Connection, entry: &Lexeme) -> Result<()> {
    connection
        .execute(
            "DELETE FROM lexical_relations WHERE source_id=?1",
            [&entry.id],
        )
        .map_err(sql)?;
    for relation in &entry.data.relations {
        connection
            .execute(
                "INSERT INTO lexical_relations VALUES (?1,?2,?3)",
                params![entry.id, relation.target_id, relation.relation_type],
            )
            .map_err(sql)?;
    }
    Ok(())
}

pub(crate) fn touch_project(connection: &Connection) -> Result<()> {
    if connection.execute("UPDATE project SET revision=revision+1, updated_at=?1 WHERE singleton=1 AND revision < 9007199254740991", [now()]).map_err(sql)? != 1 {
        return Err(AppError::new(ErrorCode::Conflict, "The project revision cannot be advanced."));
    }
    let pages: u32 = connection
        .query_row("PRAGMA page_count", [], |row| row.get(0))
        .map_err(sql)?;
    let size: u32 = connection
        .query_row("PRAGMA page_size", [], |row| row.get(0))
        .map_err(sql)?;
    if u64::from(pages) * u64::from(size) > crate::database::MAX_DATABASE {
        return Err(input_error(
            "The project has reached its current 256 MiB limit.",
        ));
    }
    Ok(())
}

pub(crate) fn validate_database(connection: &Connection) -> Result<()> {
    let entries = all_entries(connection)?;
    validate_graph(&entries, &HashMap::new())?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(sql)?;
    if version >= 4 {
        crate::phonology::validate_lexical_graph(connection, &entries)?;
    }
    // Derived keys must match the authored content even in imported databases.
    let mut statement = connection
        .prepare("SELECT search_key, search_fold, lemma_key FROM lexemes WHERE id=?1")
        .map_err(sql)?;
    for entry in entries {
        let keys: (String, String, String) = statement
            .query_row([&entry.id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(sql)?;
        let text = searchable_text(&entry.data);
        if keys
            != (
                search_key(&text, false),
                search_key(&text, true),
                search_key(&entry.data.lemma, false),
            )
        {
            return Err(invalid(
                "A lexicon search index does not match its stored content.",
            ));
        }
    }
    Ok(())
}

impl Project {
    pub fn lexicon_page(&self, query: &LexiconQuery) -> Result<LexiconPage> {
        if query.text.chars().count() > 256
            || query.part_of_speech.chars().count() > 120
            || query.limit == 0
            || query.limit > 100
            || query.offset > MAX_ENTRIES as u32
        {
            return Err(input_error("Invalid lexicon search or page size."));
        }
        let key = search_key(query.text.trim(), query.ignore_marks)
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = if key.is_empty() {
            String::new()
        } else {
            format!("%{key}%")
        };
        let column = if query.ignore_marks {
            "search_fold"
        } else {
            "search_key"
        };
        let filter = format!("(?1='' OR {column} LIKE ?1 ESCAPE '\\') AND (?2='' OR part_of_speech=?2) AND (?3='' OR kind=?3)");
        let kind = query.kind.map(EntryKind::as_str).unwrap_or("");
        let total: u32 = self
            .connection
            .query_row(
                &format!("SELECT count(*) FROM lexemes WHERE {filter}"),
                params![pattern, query.part_of_speech, kind],
                |row| row.get(0),
            )
            .map_err(sql)?;
        let order = match query.sort {
            LexiconSort::Lemma => "lemma_key",
            LexiconSort::Updated => "updated_at",
        };
        let direction = if query.descending { "DESC" } else { "ASC" };
        let mut statement = self.connection.prepare(&format!("SELECT id,lemma,pronunciation,part_of_speech,kind,substr(json_extract(senses_json,'$[0].definition'),1,180) FROM lexemes WHERE {filter} ORDER BY {order} {direction}, id ASC LIMIT ?4 OFFSET ?5")).map_err(sql)?;
        let items = statement
            .query_map(
                params![
                    pattern,
                    query.part_of_speech,
                    kind,
                    query.limit,
                    query.offset
                ],
                |row| {
                    let kind: String = row.get(4)?;
                    Ok(LexemeListItem {
                        id: row.get(0)?,
                        lemma: row.get(1)?,
                        pronunciation: row.get(2)?,
                        part_of_speech: row.get(3)?,
                        kind: if kind == "root" {
                            EntryKind::Root
                        } else {
                            EntryKind::Lexeme
                        },
                        definition: row.get(5)?,
                    })
                },
            )
            .map_err(sql)?
            .collect::<std::result::Result<_, _>>()
            .map_err(sql)?;
        let mut categories = self.connection.prepare("SELECT DISTINCT part_of_speech FROM lexemes WHERE part_of_speech<>'' ORDER BY part_of_speech").map_err(sql)?;
        let categories = categories
            .query_map([], |row| row.get(0))
            .map_err(sql)?
            .collect::<std::result::Result<_, _>>()
            .map_err(sql)?;
        Ok(LexiconPage {
            items,
            total,
            offset: query.offset,
            limit: query.limit,
            categories,
        })
    }

    pub fn lexeme(&self, id: &str) -> Result<LexemeDetails> {
        let entry = read_entry(&self.connection, id)?;
        let query = "SELECT id,lemma,'root' AS relation_type FROM lexemes WHERE root_id=?1 UNION ALL SELECT l.id,l.lemma,r.relation_type FROM lexical_relations r JOIN lexemes l ON l.id=r.source_id WHERE r.target_id=?1";
        let incoming_count = self
            .connection
            .query_row(&format!("SELECT count(*) FROM ({query})"), [id], |row| {
                row.get(0)
            })
            .map_err(sql)?;
        let mut statement = self
            .connection
            .prepare(&format!("{query} ORDER BY lemma,id LIMIT 50"))
            .map_err(sql)?;
        let incoming = statement
            .query_map([id], |row| {
                Ok(LexemeReference {
                    id: row.get(0)?,
                    lemma: row.get(1)?,
                    relation_type: row.get(2)?,
                })
            })
            .map_err(sql)?
            .collect::<std::result::Result<_, _>>()
            .map_err(sql)?;
        Ok(LexemeDetails {
            entry,
            incoming,
            incoming_count,
        })
    }

    pub fn save_lexeme(
        &mut self,
        id: Option<&str>,
        revision: Option<i64>,
        mut data: LexemeDraft,
    ) -> Result<LexemeDetails> {
        data.validate()?;
        let old = id.map(|id| read_entry(&self.connection, id)).transpose()?;
        match &old {
            Some(old) if Some(old.revision) != revision || old.revision >= MAX_REVISION => {
                return Err(AppError::new(
                    ErrorCode::Conflict,
                    "This entry changed. Reload it before saving.",
                ))
            }
            None if revision.is_some() => {
                return Err(input_error("A new entry cannot have an existing revision."))
            }
            _ => {}
        }
        for child in data
            .senses
            .iter_mut()
            .map(|item| &mut item.id)
            .chain(data.forms.iter_mut().map(|item| &mut item.id))
        {
            if child.is_none() {
                *child = Some(Uuid::new_v4().to_string());
            }
        }
        let entry = Lexeme {
            id: old
                .as_ref()
                .map(|entry| entry.id.clone())
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            revision: old.as_ref().map_or(0, |entry| entry.revision + 1),
            created_at: old.as_ref().map_or_else(now, |entry| entry.created_at),
            updated_at: now(),
            data,
        };
        let kinds = existing_kinds(&self.connection)?;
        if old.is_none() && kinds.len() >= MAX_ENTRIES {
            return Err(input_error(
                "The current limit is 20,000 entries per project.",
            ));
        }
        validate_graph(std::slice::from_ref(&entry), &kinds)?;
        crate::phonology::validate_links(
            std::slice::from_ref(&entry),
            &crate::phonology::phoneme_ids(&self.connection)?,
        )?;
        if entry.data.kind != EntryKind::Root {
            let count: i64 = self
                .connection
                .query_row(
                    "SELECT count(*) FROM lexemes WHERE root_id=?1",
                    [&entry.id],
                    |row| row.get(0),
                )
                .map_err(sql)?;
            if count > 0 {
                return Err(input_error(
                    "Other entries use this root. Unlink them before changing its kind.",
                ));
            }
        }
        if old
            .as_ref()
            .is_some_and(|previous| previous.data == entry.data)
        {
            return self.lexeme(&entry.id);
        }
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if let Some(previous) = &old {
            if read_entry(&transaction, &entry.id)?.revision != previous.revision {
                return Err(AppError::new(
                    ErrorCode::Conflict,
                    "This entry changed while saving.",
                ));
            }
        }
        write_entry(&transaction, &entry, old.is_some())?;
        write_relations(&transaction, &entry)?;
        crate::phonology::write_references(&transaction, &entry)?;
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)?;
        self.lexeme(&entry.id)
    }

    pub fn delete_lexeme(&mut self, id: &str, revision: i64) -> Result<()> {
        let details = self.lexeme(id)?;
        if details.entry.revision != revision {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "This entry changed. Reload it before deleting.",
            ));
        }
        crate::notebook::require_unreferenced(&self.connection, 0, id)?;
        crate::automation::require_unreferenced(&self.connection, id)?;
        if details.incoming_count > 0 {
            return Err(input_error(
                "Other entries reference this entry. Remove those links before deleting it.",
            ));
        }
        self.backup("auto")?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if transaction
            .execute(
                "DELETE FROM lexemes WHERE id=?1 AND revision=?2",
                params![id, revision],
            )
            .map_err(sql)?
            != 1
        {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "This entry changed while deleting.",
            ));
        }
        touch_project(&transaction)?;
        transaction.commit().map_err(sql)
    }
}
