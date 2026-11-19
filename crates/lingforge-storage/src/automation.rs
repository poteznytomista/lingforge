use crate::{
    invalid,
    lexicon::{read_entry, touch_project},
    sql, Project, Result,
};
use lingforge_core::{
    automation::{Evaluation, Program, ProgramDraft, SourceField},
    lexicon::input_error,
    writing::identifier,
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;

const MAX_REVISION: i64 = 9_007_199_254_740_991;
fn conflict() -> AppError {
    AppError::new(
        ErrorCode::Conflict,
        "The program or project changed. Save and preview again before applying.",
    )
}
fn bounded<T: Serialize>(value: &T, max: usize) -> Result<String> {
    let text =
        serde_json::to_string(value).map_err(|_| invalid("Cannot encode automation data."))?;
    if text.len() > max {
        return Err(input_error(
            "Automation data exceeds its size limit. Select fewer cells or simplify the program.",
        ));
    }
    Ok(text)
}
fn decode<T: serde::de::DeserializeOwned>(text: &str) -> Result<T> {
    serde_json::from_str(text).map_err(|_| invalid("An automation record is malformed."))
}
fn read(connection: &Connection, id: &str) -> Result<Program> {
    let row: Option<(i64, String)> = connection
        .query_row(
            "SELECT revision,data_json FROM automation_programs WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(sql)?;
    let (revision, json) = row.ok_or_else(conflict)?;
    Ok(Program {
        id: id.into(),
        revision,
        data: decode(&json)?,
    })
}
fn overrides(data: &ProgramDraft) -> BTreeSet<String> {
    data.overrides.iter().map(|o| o.entry_id.clone()).collect()
}
fn references(connection: &Connection, data: &ProgramDraft) -> Result<()> {
    for id in overrides(data) {
        read_entry(connection, &id)?;
    }
    Ok(())
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub entry_id: String,
    pub revision: i64,
    pub lemma: String,
    pub input: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Row {
    pub source: Source,
    pub cell_id: String,
    pub evaluation: Option<Evaluation>,
    pub error: Option<String>,
    pub conflicts: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchData {
    pub program: Program,
    pub rows: Vec<Row>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Batch {
    pub id: String,
    pub created_at: i64,
    pub data: BatchData,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramSummary {
    pub id: String,
    pub revision: i64,
    pub name: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSummary {
    pub id: String,
    pub program_id: String,
    pub name: String,
    pub created_at: i64,
    pub count: usize,
}
#[derive(Serialize)]
pub struct Index {
    pub programs: Vec<ProgramSummary>,
    pub batches: Vec<BatchSummary>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub token: String,
    pub project_revision: i64,
    pub rows: Vec<Row>,
}
pub struct Prepared {
    token: String,
    session_id: String,
    revision: i64,
    data: BatchData,
}
impl Prepared {
    pub fn token(&self) -> &str {
        &self.token
    }
    pub fn preview(&self) -> Preview {
        Preview {
            token: self.token.clone(),
            project_revision: self.revision,
            rows: self.data.rows.clone(),
        }
    }
}
fn read_batch(connection: &Connection, id: &str) -> Result<Batch> {
    let row: Option<(i64, String)> = connection
        .query_row(
            "SELECT created_at,data_json FROM automation_batches WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(sql)?;
    let (created_at, json) = row.ok_or_else(conflict)?;
    Ok(Batch {
        id: id.into(),
        created_at,
        data: decode(&json)?,
    })
}
pub(crate) fn require_unreferenced(connection: &Connection, entry_id: &str) -> Result<()> {
    let count:i64=connection.query_row("SELECT (SELECT count(*) FROM automation_overrides WHERE entry_id=?1)+(SELECT count(*) FROM automation_cells WHERE entry_id=?1)",[entry_id],|r|r.get(0)).map_err(sql)?;
    if count > 0 {
        return Err(input_error("Automation overrides or generated batches reference this entry. Remove those overrides or revert the batches before deleting it."));
    }
    Ok(())
}
fn ids(connection: &Connection, table: &str) -> Result<Vec<String>> {
    // Callers supply fixed internal table names only.
    let mut statement = connection
        .prepare(&format!("SELECT id FROM {table} ORDER BY id"))
        .map_err(sql)?;
    let values = statement
        .query_map([], |r| r.get(0))
        .map_err(sql)?
        .collect::<std::result::Result<Vec<String>, _>>()
        .map_err(sql)?;
    if values.len() > 32 {
        return Err(invalid(
            "Automation is limited to 32 programs and 32 batches.",
        ));
    }
    Ok(values)
}
pub(crate) fn validate_database(connection: &Connection) -> Result<()> {
    let programs = ids(connection, "automation_programs")?;
    let mut expected_overrides = BTreeSet::new();
    for id in &programs {
        let p = read(connection, id)?;
        if !identifier(id) || !(0..=MAX_REVISION).contains(&p.revision) {
            return Err(invalid("Invalid program identity or revision."));
        }
        p.data.validate()?;
        references(connection, &p.data)?;
        bounded(&p.data, 1024 * 1024)?;
        expected_overrides.extend(
            overrides(&p.data)
                .into_iter()
                .map(|entry| (id.clone(), entry)),
        );
    }
    let mut expected_cells = BTreeSet::new();
    for id in ids(connection, "automation_batches")? {
        let batch = read_batch(connection, &id)?;
        let p = &batch.data.program;
        if !identifier(&id)
            || !(0..=8_640_000_000_000_000).contains(&batch.created_at)
            || batch.data.rows.is_empty()
            || batch.data.rows.len() > 64
        {
            return Err(invalid("Invalid generated batch."));
        }
        let current = read(connection, &p.id)?;
        if !(0..=current.revision).contains(&p.revision) {
            return Err(invalid(
                "A generated batch has an invalid program revision.",
            ));
        }
        let column: String = connection
            .query_row(
                "SELECT program_id FROM automation_batches WHERE id=?1",
                [&id],
                |r| r.get(0),
            )
            .map_err(sql)?;
        if column != p.id {
            return Err(invalid(
                "A generated batch has a mismatched program identity.",
            ));
        }
        p.data.validate()?;
        bounded(&p.data, 1024 * 1024)?;
        bounded(&batch.data, 2 * 1024 * 1024)?;
        let mut seen = BTreeSet::new();
        for row in &batch.data.rows {
            if !identifier(&row.source.entry_id)
                || !(0..=MAX_REVISION).contains(&row.source.revision)
                || row.source.lemma.trim().is_empty()
                || row.source.lemma.chars().count() > 256
                || row.source.lemma.chars().any(char::is_control)
                || row.error.is_some()
                || !row.conflicts.is_empty()
                || !seen.insert((&row.source.entry_id, &row.cell_id))
            {
                return Err(invalid(
                    "A generated row has invalid source metadata or conflicts.",
                ));
            }
            let current_source = read_entry(connection, &row.source.entry_id)?;
            if current_source.revision < row.source.revision
                || (p.data.input == SourceField::Lemma && row.source.input != row.source.lemma)
            {
                return Err(invalid(
                    "A generated source snapshot has inconsistent text or revision.",
                ));
            }
            let expected =
                p.data
                    .evaluate(&row.source.entry_id, &row.cell_id, &row.source.input)?;
            if expected.phonotactics == Some(false) || row.evaluation.as_ref() != Some(&expected) {
                return Err(invalid(
                    "Generated provenance does not reproduce the saved result.",
                ));
            }
            expected_cells.insert((
                p.id.clone(),
                row.source.entry_id.clone(),
                row.cell_id.clone(),
                id.clone(),
            ));
        }
    }
    let mut stmt = connection
        .prepare("SELECT program_id,entry_id FROM automation_overrides")
        .map_err(sql)?;
    let actual = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(sql)?
        .collect::<std::result::Result<BTreeSet<_>, _>>()
        .map_err(sql)?;
    if actual != expected_overrides {
        return Err(invalid(
            "Automation override references do not match their source JSON.",
        ));
    }
    let mut stmt = connection
        .prepare("SELECT program_id,entry_id,cell_id,batch_id FROM automation_cells")
        .map_err(sql)?;
    let actual = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(sql)?
        .collect::<std::result::Result<BTreeSet<_>, _>>()
        .map_err(sql)?;
    if actual != expected_cells {
        return Err(invalid(
            "Generated cell references do not match their source JSON.",
        ));
    }
    Ok(())
}
impl Project {
    pub fn automation_index(&self) -> Result<Index> {
        let programs = ids(&self.connection, "automation_programs")?
            .iter()
            .map(|id| {
                read(&self.connection, id).map(|p| ProgramSummary {
                    id: p.id,
                    revision: p.revision,
                    name: p.data.name,
                })
            })
            .collect::<Result<_>>()?;
        let batches = ids(&self.connection, "automation_batches")?
            .iter()
            .map(|id| {
                read_batch(&self.connection, id).map(|b| BatchSummary {
                    id: b.id,
                    program_id: b.data.program.id,
                    name: b.data.program.data.name,
                    created_at: b.created_at,
                    count: b.data.rows.len(),
                })
            })
            .collect::<Result<_>>()?;
        Ok(Index { programs, batches })
    }
    pub fn automation_program(&self, id: &str) -> Result<Program> {
        read(&self.connection, id)
    }
    pub fn automation_batch(&self, id: &str) -> Result<Batch> {
        read_batch(&self.connection, id)
    }
    pub fn save_automation(
        &mut self,
        id: Option<&str>,
        revision: Option<i64>,
        data: ProgramDraft,
    ) -> Result<Program> {
        data.validate()?;
        references(&self.connection, &data)?;
        let json = bounded(&data, 1024 * 1024)?;
        let old = id.map(|id| read(&self.connection, id)).transpose()?;
        if old.as_ref().map(|p| p.revision) != revision
            || revision.is_some_and(|r| r >= MAX_REVISION)
        {
            return Err(conflict());
        }
        if let Some(p) = old.as_ref().filter(|p| p.data == data) {
            return Ok(p.clone());
        }
        if old.is_none() && ids(&self.connection, "automation_programs")?.len() >= 32 {
            return Err(input_error(
                "The project already has 32 automation programs.",
            ));
        }
        let next = Program {
            id: old
                .as_ref()
                .map_or_else(|| Uuid::new_v4().to_string(), |p| p.id.clone()),
            revision: old.map_or(0, |p| p.revision + 1),
            data,
        };
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if let Some(previous) = revision {
            if tx.execute("UPDATE automation_programs SET revision=?2,data_json=?3 WHERE id=?1 AND revision=?4",params![next.id,next.revision,json,previous]).map_err(sql)?!=1 { return Err(conflict()); }
        } else {
            tx.execute(
                "INSERT INTO automation_programs VALUES (?1,?2,?3)",
                params![next.id, next.revision, json],
            )
            .map_err(sql)?;
        }
        tx.execute(
            "DELETE FROM automation_overrides WHERE program_id=?1",
            [&next.id],
        )
        .map_err(sql)?;
        for entry in overrides(&next.data) {
            tx.execute(
                "INSERT INTO automation_overrides VALUES (?1,?2)",
                params![next.id, entry],
            )
            .map_err(sql)?;
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)?;
        Ok(next)
    }
    pub fn delete_automation(&mut self, id: &str, revision: i64) -> Result<()> {
        if read(&self.connection, id)?.revision != revision {
            return Err(conflict());
        }
        let count: i64 = self
            .connection
            .query_row(
                "SELECT count(*) FROM automation_batches WHERE program_id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(sql)?;
        if count > 0 {
            return Err(input_error(
                "Revert this program's generated batches before deleting the program.",
            ));
        }
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if tx
            .execute(
                "DELETE FROM automation_programs WHERE id=?1 AND revision=?2",
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
    pub fn prepare_automation(
        &self,
        id: &str,
        revision: i64,
        entries: &[String],
        cells: &[String],
    ) -> Result<Prepared> {
        let program = read(&self.connection, id)?;
        if program.revision != revision {
            return Err(conflict());
        }
        program.data.validate()?;
        if entries.is_empty()
            || cells.is_empty()
            || entries.len() > 64
            || cells.len() > 32
            || entries.len() * cells.len() > 64
            || entries.iter().collect::<BTreeSet<_>>().len() != entries.len()
            || cells.iter().collect::<BTreeSet<_>>().len() != cells.len()
        {
            return Err(input_error(
                "Select distinct entries and cells totaling 1–64 results.",
            ));
        }
        let mut rows = Vec::new();
        for entry_id in entries {
            let entry = read_entry(&self.connection, entry_id)?;
            let input = match program.data.input {
                SourceField::Lemma => &entry.data.lemma,
                SourceField::Pronunciation => &entry.data.pronunciation,
            };
            for cell_id in cells {
                let cell = program
                    .data
                    .cells
                    .iter()
                    .find(|c| c.id == *cell_id)
                    .ok_or_else(|| input_error("A selected cell no longer exists."))?;
                let mut conflicts = Vec::new();
                let (evaluation, error) = match program.data.evaluate(entry_id, cell_id, input) {
                    Ok(value) => (Some(value), None),
                    Err(e) => (None, Some(e.message)),
                };
                if let Some(result) = &evaluation {
                    if result.phonotactics == Some(false) {
                        conflicts.push("Output fails every configured phonotactic pattern.".into());
                    }
                    if entry.data.forms.iter().any(|f| {
                        f.label == cell.name
                            || match program.data.input {
                                SourceField::Lemma => f.text == result.output,
                                SourceField::Pronunciation => {
                                    !f.pronunciation.is_empty() && f.pronunciation == result.output
                                }
                            }
                    }) {
                        conflicts.push("An authored form already has this cell label or output. Authored forms are protected.".into());
                    }
                }
                let existing:bool=self.connection.query_row("SELECT EXISTS(SELECT 1 FROM automation_cells WHERE program_id=?1 AND entry_id=?2 AND cell_id=?3)",params![id,entry_id,cell_id],|r|r.get(0)).map_err(sql)?;
                if existing {
                    conflicts.push("This generated cell already exists. Revert its batch before applying it again.".into());
                }
                rows.push(Row {
                    source: Source {
                        entry_id: entry_id.clone(),
                        revision: entry.revision,
                        lemma: entry.data.lemma.clone(),
                        input: input.clone(),
                    },
                    cell_id: cell_id.clone(),
                    evaluation,
                    error,
                    conflicts,
                });
            }
        }
        let data = BatchData { program, rows };
        bounded(&data, 2 * 1024 * 1024)?;
        Ok(Prepared {
            token: Uuid::new_v4().to_string(),
            session_id: self.session_id().into(),
            revision: self.summary()?.revision,
            data,
        })
    }
    pub fn apply_automation(&mut self, prepared: &Prepared, selected: &[usize]) -> Result<Batch> {
        if self.session_id() != prepared.session_id || self.summary()?.revision != prepared.revision
        {
            return Err(conflict());
        }
        if selected.is_empty()
            || selected.len() > 64
            || selected.iter().collect::<BTreeSet<_>>().len() != selected.len()
        {
            return Err(input_error(
                "Select distinct eligible rows before applying.",
            ));
        }
        let mut rows = Vec::new();
        for index in selected {
            let row = prepared
                .data
                .rows
                .get(*index)
                .ok_or_else(|| input_error("A selected preview row is missing."))?;
            if row.error.is_some() || !row.conflicts.is_empty() || row.evaluation.is_none() {
                return Err(input_error(
                    "Resolve the selected row's errors or conflicts before applying.",
                ));
            }
            rows.push(row.clone());
        }
        if ids(&self.connection, "automation_batches")?.len() >= 32 {
            return Err(input_error(
                "Revert an older generated batch before creating more than 32 batches.",
            ));
        }
        let batch = Batch {
            id: Uuid::new_v4().to_string(),
            created_at: crate::now(),
            data: BatchData {
                program: prepared.data.program.clone(),
                rows,
            },
        };
        let json = bounded(&batch.data, 2 * 1024 * 1024)?;
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if crate::database::summary(&tx)?.revision != prepared.revision {
            return Err(conflict());
        }
        tx.execute(
            "INSERT INTO automation_batches VALUES (?1,?2,?3,?4)",
            params![batch.id, batch.data.program.id, batch.created_at, json],
        )
        .map_err(sql)?;
        for row in &batch.data.rows {
            tx.execute(
                "INSERT INTO automation_cells VALUES (?1,?2,?3,?4)",
                params![
                    batch.data.program.id,
                    row.source.entry_id,
                    row.cell_id,
                    batch.id
                ],
            )
            .map_err(sql)?;
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)?;
        Ok(batch)
    }
    pub fn revert_automation(&mut self, id: &str) -> Result<()> {
        read_batch(&self.connection, id)?;
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if tx
            .execute("DELETE FROM automation_batches WHERE id=?1", [id])
            .map_err(sql)?
            != 1
        {
            return Err(conflict());
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)
    }
}
