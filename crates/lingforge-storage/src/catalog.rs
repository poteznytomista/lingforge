use crate::{invalid, io, now, sql, Result};
use lingforge_core::{
    project::{Preferences, ProjectSummary},
    AppError, ErrorCode,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

pub struct Catalog {
    connection: Connection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub token: String,
    pub name: String,
    pub location: String,
    pub last_opened: i64,
    pub available: bool,
}

impl Catalog {
    pub fn open(directory: &Path) -> Result<Self> {
        fs::create_dir_all(directory).map_err(io)?;
        let connection = Connection::open(directory.join("workspace.sqlite3")).map_err(sql)?;
        connection
            .busy_timeout(Duration::from_secs(3))
            .map_err(sql)?;
        connection
            .execute_batch(
                "PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;",
            )
            .map_err(sql)?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(sql)?;
        match version {
            0 => connection.execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE IF NOT EXISTS recent_projects (
                   token TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, last_opened INTEGER NOT NULL
                 ) STRICT;
                 CREATE TABLE IF NOT EXISTS preferences (singleton INTEGER PRIMARY KEY CHECK(singleton=1), json TEXT NOT NULL) STRICT;
                 PRAGMA user_version=1;
                 COMMIT;"
            ).map_err(sql)?,
            1 => {},
            _ => return Err(AppError::new(ErrorCode::UnsupportedVersion, "These application preferences were written by a newer LingForge version.")),
        }
        Ok(Self { connection })
    }

    pub fn remember(&mut self, path: &Path, project: &ProjectSummary) -> Result<()> {
        let path = path.to_str().ok_or_else(|| {
            invalid("This path cannot be represented as Unicode. Choose a different folder.")
        })?;
        let transaction = self.connection.transaction().map_err(sql)?;
        transaction.execute(
            "INSERT INTO recent_projects VALUES (?1, ?2, ?3, ?4) ON CONFLICT(path) DO UPDATE SET name=excluded.name, last_opened=excluded.last_opened",
            params![uuid::Uuid::new_v4().to_string(), path, project.metadata.name, now()],
        ).map_err(sql)?;
        transaction.execute("DELETE FROM recent_projects WHERE token NOT IN (SELECT token FROM recent_projects ORDER BY last_opened DESC, token DESC LIMIT 20)", []).map_err(sql)?;
        transaction.commit().map_err(sql)
    }

    pub fn list(&self) -> Result<Vec<RecentProject>> {
        let mut statement = self.connection.prepare("SELECT token, name, path, last_opened FROM recent_projects ORDER BY last_opened DESC, token DESC").map_err(sql)?;
        let rows = statement
            .query_map([], |row| {
                let location: String = row.get(2)?;
                let available = Path::new(&location).join("manifest.json").is_file();
                Ok(RecentProject {
                    token: row.get(0)?,
                    name: row.get(1)?,
                    location,
                    last_opened: row.get(3)?,
                    available,
                })
            })
            .map_err(sql)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(sql)
    }

    pub fn path_for(&self, token: &str) -> Result<PathBuf> {
        self.connection
            .query_row(
                "SELECT path FROM recent_projects WHERE token=?1",
                [token],
                |row| row.get::<_, String>(0),
            )
            .map(PathBuf::from)
            .map_err(|_| {
                invalid("This project is no longer in the recent list. Open its folder instead.")
            })
    }

    pub fn forget(&self, token: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM recent_projects WHERE token=?1", [token])
            .map_err(sql)?;
        Ok(())
    }

    pub fn preferences(&self) -> Result<Preferences> {
        let json: Option<String> = self
            .connection
            .query_row(
                "SELECT json FROM preferences WHERE singleton=1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(sql)?;
        match json {
            None => Ok(Preferences::default()),
            Some(json) => serde_json::from_str(&json).map_err(|_| invalid("Application preferences cannot be read. The stored values have been preserved.")),
        }
    }

    pub fn save_preferences(&self, preferences: &Preferences) -> Result<()> {
        let json = serde_json::to_string(preferences)
            .map_err(|_| invalid("Cannot encode preferences."))?;
        self.connection.execute("INSERT INTO preferences VALUES (1, ?1) ON CONFLICT(singleton) DO UPDATE SET json=excluded.json", [json]).map_err(sql)?;
        Ok(())
    }
}
