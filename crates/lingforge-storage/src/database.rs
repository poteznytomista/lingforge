use crate::{invalid, sql, Result};
use lingforge_core::{
    project::{ProjectMetadata, ProjectSummary},
    AppError, ErrorCode,
};
use rusqlite::{config::DbConfig, limits::Limit, Connection, OpenFlags};
use std::{path::Path, time::Duration};

pub(crate) const SCHEMA: i64 = 8;
const APPLICATION_ID: i64 = 0x4c464731;
pub(crate) const MAX_DATABASE: u64 = 256 * 1024 * 1024;

pub(crate) fn connect(path: &Path, create: bool) -> Result<Connection> {
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if create {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    let connection = Connection::open_with_flags(path, flags).map_err(sql)?;
    connection
        .busy_timeout(Duration::from_secs(3))
        .map_err(sql)?;
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
        .map_err(sql)?;
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)
        .map_err(sql)?;
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_TRIGGER, false)
        .map_err(sql)?;
    connection
        .set_limit(Limit::SQLITE_LIMIT_LENGTH, 20 * 1024 * 1024)
        .map_err(sql)?;
    connection
        .set_limit(Limit::SQLITE_LIMIT_ATTACHED, 0)
        .map_err(sql)?;
    connection
        .execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;")
        .map_err(sql)?;
    Ok(connection)
}

pub(crate) fn initialize(
    connection: &mut Connection,
    id: &str,
    metadata: &ProjectMetadata,
) -> Result<()> {
    metadata.validate()?;
    let transaction = connection.transaction().map_err(sql)?;
    transaction
        .execute_batch(
            "PRAGMA application_id=1279674161;
         CREATE TABLE project (
           singleton INTEGER PRIMARY KEY CHECK(singleton=1),
           id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, language_name TEXT NOT NULL,
           description TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
         ) STRICT;
         CREATE TABLE assets (
           id TEXT PRIMARY KEY, logical_path TEXT NOT NULL UNIQUE,
           display_name TEXT NOT NULL, media_type TEXT NOT NULL, data BLOB NOT NULL
         ) STRICT;
         PRAGMA user_version=1;",
        )
        .map_err(sql)?;
    let time = crate::now();
    transaction
        .execute(
            "INSERT INTO project VALUES (1, ?1, ?2, ?3, ?4, ?5, ?5)",
            rusqlite::params![
                id,
                metadata.name,
                metadata.language_name,
                metadata.description,
                time
            ],
        )
        .map_err(sql)?;
    transaction.commit().map_err(sql)?;
    migrate(connection)?;
    Ok(())
}

pub(crate) fn inspect(connection: &Connection) -> Result<i64> {
    let app_id: i64 = connection
        .query_row("PRAGMA application_id", [], |row| row.get(0))
        .map_err(sql)?;
    if app_id != APPLICATION_ID {
        return Err(invalid("This database is not a LingForge project."));
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(sql)?;
    if !(1..=SCHEMA).contains(&version) {
        return Err(AppError::new(
            ErrorCode::UnsupportedVersion,
            "This project schema is unsupported. Open it with a compatible LingForge version.",
        ));
    }
    let integrity: String = connection
        .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
        .map_err(sql)?;
    if integrity != "ok" {
        return Err(invalid(
            "The project database is damaged. Restore a backup into a new folder.",
        ));
    }
    let unsafe_objects: i64 = connection.query_row(
        "SELECT count(*) FROM sqlite_schema WHERE type IN ('trigger','view') OR (type='table' AND name NOT IN ('project','assets','lexemes','lexical_relations','phonemes','phonology_profile','phoneme_references','writing_systems','script_phoneme_references','notebook_records','notebook_lexemes','notebook_phonemes','notebook_scripts','notebook_characters','font_profiles','automation_programs','automation_batches','automation_overrides','automation_cells') AND name NOT LIKE 'sqlite_%') OR (type='table' AND upper(sql) LIKE '%CREATE VIRTUAL TABLE%') OR (type='index' AND name NOT IN ('lexemes_order','lexemes_category','lexemes_root','lexical_relations_target','phoneme_references_target','script_phonemes_target','notebook_lexemes_target','notebook_phonemes_target','notebook_scripts_target','notebook_characters_target','automation_cells_batch') AND name NOT LIKE 'sqlite_autoindex_%')",
        [], |row| row.get(0),
    ).map_err(sql)?;
    if unsafe_objects != 0 {
        return Err(invalid(
            "The project contains an unexpected database schema.",
        ));
    }
    let project_count: i64 = connection
        .query_row("SELECT count(*) FROM project", [], |row| row.get(0))
        .map_err(sql)?;
    if project_count != 1 {
        return Err(invalid(
            "The project must contain exactly one metadata record.",
        ));
    }
    summary_for_version(connection, version)?;
    crate::project::validate_assets(connection)?;
    if version >= 3 {
        crate::lexicon::validate_database(connection)?;
    }
    if version >= 4 {
        crate::phonology::validate_database(connection)?;
    }
    if version >= 5 {
        crate::writing::validate_database(connection)?;
    }
    if version >= 6 {
        crate::notebook::validate_database(connection)?;
    }
    if version >= 7 {
        crate::fonts::validate_database(connection)?;
    }
    if version >= 8 {
        crate::automation::validate_database(connection)?;
    }
    if connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(sql)?
        .query([])
        .map_err(sql)?
        .next()
        .map_err(sql)?
        .is_some()
    {
        return Err(invalid("The project contains broken database references."));
    }
    Ok(version)
}

pub(crate) fn migrate(connection: &mut Connection) -> Result<()> {
    let version = inspect(connection)?;
    if version < SCHEMA {
        let transaction = connection.transaction().map_err(sql)?;
        if version == 1 {
            transaction.execute_batch("ALTER TABLE project ADD COLUMN revision INTEGER NOT NULL DEFAULT 0; PRAGMA user_version=2;").map_err(sql)?;
        }
        if version < 3 {
            transaction
                .execute_batch(include_str!("migrations/003_lexicon.sql"))
                .map_err(sql)?;
        }
        if version < 4 {
            transaction
                .execute_batch(include_str!("migrations/004_phonology.sql"))
                .map_err(sql)?;
        }
        if version < 5 {
            transaction
                .execute_batch(include_str!("migrations/005_writing.sql"))
                .map_err(sql)?;
        }
        if version < 6 {
            transaction
                .execute_batch(include_str!("migrations/006_notebook.sql"))
                .map_err(sql)?;
        }
        if version < 7 {
            transaction
                .execute_batch(include_str!("migrations/007_fonts.sql"))
                .map_err(sql)?;
        }
        if version < 8 {
            transaction
                .execute_batch(include_str!("migrations/008_automation.sql"))
                .map_err(sql)?;
        }
        transaction.commit().map_err(sql)?;
    }
    Ok(())
}

pub(crate) fn summary(connection: &Connection) -> Result<ProjectSummary> {
    summary_for_version(connection, SCHEMA)
}

fn summary_for_version(connection: &Connection, version: i64) -> Result<ProjectSummary> {
    let result = connection.query_row(
        if version == 1 { "SELECT id, name, language_name, description, 0, created_at, updated_at FROM project WHERE singleton=1" }
        else { "SELECT id, name, language_name, description, revision, created_at, updated_at FROM project WHERE singleton=1" },
        [], |row| Ok(ProjectSummary {
            id: row.get(0)?,
            metadata: ProjectMetadata { name: row.get(1)?, language_name: row.get(2)?, description: row.get(3)? },
            revision: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
        }),
    ).map_err(sql)?;
    result.metadata.validate()?;
    if uuid::Uuid::parse_str(&result.id)
        .map(|id| id.to_string())
        .ok()
        .as_deref()
        != Some(result.id.as_str())
        || !(0..=9_007_199_254_740_991).contains(&result.revision)
        || !(0..=8_640_000_000_000_000).contains(&result.created_at)
        || !(0..=8_640_000_000_000_000).contains(&result.updated_at)
    {
        return Err(invalid(
            "The project contains invalid identifiers or metadata.",
        ));
    }
    Ok(result)
}

pub(crate) fn snapshot(connection: &Connection, path: &Path) -> Result<()> {
    let mut target = connect(path, true)?;
    {
        let backup = rusqlite::backup::Backup::new(connection, &mut target).map_err(sql)?;
        // Bounded completion: do not spin forever if a non-cooperating writer
        // changes the DB. The project lock excludes normal LingForge writers.
        match backup.step(-1).map_err(sql)? {
            rusqlite::backup::StepResult::Done => {}
            _ => {
                return Err(AppError::new(
                    ErrorCode::Conflict,
                    "The database is busy. Try the snapshot again.",
                ))
            }
        }
    }
    target.close().map_err(|(_, error)| sql(error))?;
    std::fs::File::open(path)
        .map_err(crate::io)?
        .sync_all()
        .map_err(crate::io)?;
    Ok(())
}
