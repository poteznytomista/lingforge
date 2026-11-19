use lingforge_core::{
    project::{Preferences, ProjectSummary},
    AppError, ErrorCode,
};
use lingforge_storage::{BackupInfo, Catalog, Project};
use serde::Serialize;
use std::{path::PathBuf, sync::Mutex};

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Default)]
pub struct Workspace {
    pub active: Option<Project>,
    pub remember_on_snapshot: bool,
    pub pending_import: Option<PendingImport>,
    pub pending_automation: Option<lingforge_storage::automation::Prepared>,
}
pub struct PendingImport {
    pub session_id: String,
    pub source: lingforge_storage::lexicon_transfer::ImportSource,
    pub prepared: Option<lingforge_storage::lexicon_transfer::PreparedImport>,
}
pub type WorkspaceState = Mutex<Workspace>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProject {
    pub summary: ProjectSummary,
    pub session_id: String,
    pub location: String,
    pub backups: Vec<BackupInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub active: Option<OpenProject>,
    pub recent: Vec<lingforge_storage::RecentProject>,
    pub preferences: Preferences,
    pub warnings: Vec<String>,
}

impl Workspace {
    pub fn project(&self, id: &str) -> Result<&Project> {
        let project = self
            .active
            .as_ref()
            .ok_or_else(|| AppError::new(ErrorCode::Unavailable, "Open a project first."))?;
        if project.session_id() != id {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "The project session changed. Reopen the project before continuing.",
            ));
        }
        Ok(project)
    }

    pub fn project_mut(&mut self, id: &str) -> Result<&mut Project> {
        let project = self
            .active
            .as_mut()
            .ok_or_else(|| AppError::new(ErrorCode::Unavailable, "Open a project first."))?;
        if project.session_id() != id {
            return Err(AppError::new(
                ErrorCode::Conflict,
                "The project session changed. Reopen the project before continuing.",
            ));
        }
        Ok(project)
    }

    pub fn activate(&mut self, project: Project) {
        // Replace only after the new project has fully opened. Failed opens
        // leave the previous project and its lock untouched.
        self.active = Some(project);
        self.pending_import = None;
        self.pending_automation = None;
        self.remember_on_snapshot = true;
    }

    pub fn snapshot(&mut self, config_directory: &std::path::Path) -> Result<WorkspaceSnapshot> {
        let mut warnings = Vec::new();
        let active = self
            .active
            .as_ref()
            .map(|project| -> Result<OpenProject> {
                let backups = project.backups().unwrap_or_else(|error| {
                    warnings.push(error.message);
                    Vec::new()
                });
                Ok(OpenProject {
                    summary: project.summary()?,
                    session_id: project.session_id().to_owned(),
                    location: project.path().to_string_lossy().into_owned(),
                    backups,
                })
            })
            .transpose()?;
        // A committed project save must not be reported as failed just because
        // the unrelated recent-project catalog cannot be updated.
        let (recent, preferences) = match Catalog::open(config_directory) {
            Ok(mut catalog) => {
                if std::mem::take(&mut self.remember_on_snapshot) {
                    if let Some(project) = &self.active {
                        if let Err(error) = catalog.remember(project.path(), &project.summary()?) {
                            warnings.push(error.message);
                        }
                    }
                }
                let recent = catalog.list().unwrap_or_else(|error| {
                    warnings.push(error.message);
                    Vec::new()
                });
                let preferences = catalog.preferences().unwrap_or_else(|error| {
                    warnings.push(error.message);
                    Preferences::default()
                });
                (recent, preferences)
            }
            Err(error) => {
                warnings.push(error.message);
                (Vec::new(), Preferences::default())
            }
        };
        warnings.sort();
        warnings.dedup();
        Ok(WorkspaceSnapshot {
            active,
            recent,
            preferences,
            warnings,
        })
    }
}

pub fn local_path(path: tauri_plugin_dialog::FilePath) -> Result<PathBuf> {
    path.into_path().map_err(|_| {
        AppError::new(
            ErrorCode::InvalidInput,
            "Choose a local filesystem location.",
        )
    })
}
