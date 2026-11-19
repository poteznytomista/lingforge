use crate::{invalid, lexicon::touch_project, sql, Project, Result};
use lingforge_core::{
    font::{FontDraft, FontProfile},
    lexicon::input_error,
    writing::{identifier, ScriptDraft},
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

const MAX_REVISION: i64 = 9_007_199_254_740_991;
fn conflict() -> AppError {
    AppError::new(
        ErrorCode::Conflict,
        "This font profile or its writing system changed. Reload before continuing.",
    )
}
fn read(connection: &Connection, script_id: &str) -> Result<Option<FontProfile>> {
    connection
        .query_row(
            "SELECT revision,data_json FROM font_profiles WHERE script_id=?1",
            [script_id],
            |row| {
                let json: String = row.get(1)?;
                let data = serde_json::from_str(&json).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
                Ok(FontProfile {
                    script_id: script_id.into(),
                    revision: row.get(0)?,
                    data,
                })
            },
        )
        .optional()
        .map_err(sql)
}
pub(crate) fn check_script(
    connection: &Connection,
    script_id: &str,
    data: &ScriptDraft,
) -> Result<()> {
    if let Some(profile) = read(connection, script_id)? {
        profile.data.validate(data)?;
    }
    Ok(())
}
pub(crate) fn require_unreferenced(connection: &Connection, script_id: &str) -> Result<()> {
    if read(connection, script_id)?.is_some() {
        return Err(input_error(
            "Remove this writing system's font profile before deleting the writing system.",
        ));
    }
    Ok(())
}
pub(crate) fn validate_database(connection: &Connection) -> Result<()> {
    let mut statement = connection
        .prepare("SELECT script_id FROM font_profiles ORDER BY script_id")
        .map_err(sql)?;
    let ids = statement
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(sql)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(sql)?;
    if ids.len() > 32 {
        return Err(invalid("Too many font profiles."));
    }
    let scripts = crate::writing::all(connection)?;
    for id in ids {
        let profile = read(connection, &id)?.ok_or_else(conflict)?;
        if !identifier(&id) || !(0..=MAX_REVISION).contains(&profile.revision) {
            return Err(invalid("Invalid font profile identity or revision."));
        }
        let script = scripts
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| invalid("A font profile references a missing writing system."))?;
        profile.data.validate(&script.data)?;
        bounded_json(&profile.data)?;
    }
    Ok(())
}
fn bounded_json(data: &FontDraft) -> Result<String> {
    let json = serde_json::to_string(data).map_err(|_| invalid("Cannot encode font profile."))?;
    if json.len() > 1024 * 1024 {
        return Err(input_error("Font profiles must fit within 1 MiB."));
    }
    Ok(json)
}
impl Project {
    pub fn font_profile(&self, script_id: &str) -> Result<Option<FontProfile>> {
        self.writing_system(script_id)?;
        read(&self.connection, script_id)
    }
    pub fn save_font_profile(
        &mut self,
        script_id: &str,
        script_revision: i64,
        revision: Option<i64>,
        data: FontDraft,
    ) -> Result<FontProfile> {
        let script = self.writing_system(script_id)?;
        let old = read(&self.connection, script_id)?;
        if script.revision != script_revision
            || old.as_ref().map(|p| p.revision) != revision
            || revision.is_some_and(|r| r >= MAX_REVISION)
        {
            return Err(conflict());
        }
        data.validate(&script.data)?;
        let json = bounded_json(&data)?;
        if let Some(old) = old.as_ref().filter(|p| p.data == data) {
            return Ok(old.clone());
        }
        let profile = FontProfile {
            script_id: script_id.into(),
            revision: old.map_or(0, |p| p.revision + 1),
            data,
        };
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if let Some(revision) = revision {
            if tx.execute("UPDATE font_profiles SET revision=?2,data_json=?3 WHERE script_id=?1 AND revision=?4", params![script_id, profile.revision, json, revision]).map_err(sql)? != 1 { return Err(conflict()); }
        } else {
            tx.execute(
                "INSERT INTO font_profiles VALUES (?1,?2,?3)",
                params![script_id, profile.revision, json],
            )
            .map_err(sql)?;
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)?;
        Ok(profile)
    }
    pub fn delete_font_profile(&mut self, script_id: &str, revision: i64) -> Result<()> {
        if read(&self.connection, script_id)?.map(|p| p.revision) != Some(revision) {
            return Err(conflict());
        }
        self.backup("auto")?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql)?;
        if tx
            .execute(
                "DELETE FROM font_profiles WHERE script_id=?1 AND revision=?2",
                params![script_id, revision],
            )
            .map_err(sql)?
            != 1
        {
            return Err(conflict());
        }
        touch_project(&tx)?;
        tx.commit().map_err(sql)
    }
}

/// Called only with compiler-produced bytes by the host; no user supplied path over IPC.
pub fn export_font(path: &std::path::Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    if bytes.is_empty() || bytes.len() > 4 * 1024 * 1024 {
        return Err(input_error("The experimental font limit is 4 MiB."));
    }
    let parent = path
        .parent()
        .ok_or_else(|| input_error("Choose a destination folder."))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(crate::io)?;
    temp.write_all(bytes).map_err(crate::io)?;
    temp.as_file().sync_all().map_err(crate::io)?;
    temp.persist_noclobber(path)
        .map_err(|e| crate::io(e.error))?;
    crate::sync_directory(parent)
}
