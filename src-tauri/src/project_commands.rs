use crate::workspace::{local_path, Result, Workspace, WorkspaceSnapshot, WorkspaceState};
use lingforge_core::{
    project::{Preferences, ProjectMetadata},
    AppError, ErrorCode,
};
use lingforge_storage::{Catalog, Project};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

// Blocking database and native dialog work stays off the webview/main thread.
pub(crate) async fn work<T: Send + 'static>(
    app: AppHandle,
    action: impl FnOnce(&AppHandle, &mut Workspace, &std::path::Path) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = app.path().app_data_dir().map_err(|_| {
            AppError::new(
                ErrorCode::Io,
                "The application data directory is unavailable.",
            )
        })?;
        let state = app.state::<WorkspaceState>();
        let mut workspace = state.lock().map_err(|_| {
            AppError::new(
                ErrorCode::Internal,
                "The workspace could not be accessed. Restart LingForge.",
            )
        })?;
        action(&app, &mut workspace, &config)
    })
    .await
    .map_err(|_| {
        AppError::new(
            ErrorCode::Internal,
            "The project operation was interrupted.",
        )
    })?
}

#[tauri::command]
pub async fn workspace_state(app: AppHandle) -> Result<WorkspaceSnapshot> {
    work(app, |_, workspace, config| workspace.snapshot(config)).await
}

#[tauri::command]
pub async fn create_project(
    app: AppHandle,
    metadata: ProjectMetadata,
) -> Result<Option<WorkspaceSnapshot>> {
    metadata.validate()?;
    work(app, move |app, workspace, config| {
        let Some(parent) = app
            .dialog()
            .file()
            .set_title("Choose a parent folder for the new language project")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let project = Project::create(&local_path(parent)?, &metadata)?;
        workspace.activate(project);
        workspace.snapshot(config).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn open_project(
    app: AppHandle,
    recent_token: Option<String>,
) -> Result<Option<WorkspaceSnapshot>> {
    work(app, move |app, workspace, config| {
        let path = match recent_token {
            Some(token) => Catalog::open(config)?.path_for(&token)?,
            None => {
                let Some(path) = app
                    .dialog()
                    .file()
                    .set_title("Open a LingForge project folder")
                    .blocking_pick_folder()
                else {
                    return Ok(None);
                };
                local_path(path)?
            }
        };
        let canonical = std::fs::canonicalize(&path).map_err(|_| {
            AppError::new(
                ErrorCode::Io,
                "This project folder is missing or inaccessible.",
            )
        })?;
        if workspace
            .active
            .as_ref()
            .is_some_and(|project| project.path() == canonical)
        {
            workspace.remember_on_snapshot = true;
            return workspace.snapshot(config).map(Some);
        }
        workspace.activate(Project::open(&path)?);
        workspace.snapshot(config).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn save_project(
    app: AppHandle,
    session_id: String,
    revision: i64,
    metadata: ProjectMetadata,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        let project = workspace.project_mut(&session_id)?;
        let id = project.summary()?.id;
        project.save(&id, revision, &metadata)?;
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}

#[tauri::command]
pub async fn close_project(app: AppHandle, session_id: String) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace.project(&session_id)?;
        workspace.active = None;
        workspace.pending_import = None;
        workspace.pending_automation = None;
        workspace.snapshot(config)
    })
    .await
}

#[tauri::command]
pub async fn export_project(app: AppHandle, session_id: String) -> Result<Option<String>> {
    work(app, move |app, workspace, _| {
        let project = workspace.project(&session_id)?;
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Export saved project (choose a new filename)")
            .add_filter("LingForge archive", &["lingforge"])
            .set_file_name("Language.lingforge")
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let mut path = local_path(path)?;
        if path.extension().is_none() {
            path.set_extension("lingforge");
        }
        project.export(&path)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
}

#[tauri::command]
pub async fn import_project(app: AppHandle) -> Result<Option<WorkspaceSnapshot>> {
    work(app, move |app, workspace, config| {
        let Some(source) = app
            .dialog()
            .file()
            .set_title("Import a LingForge archive")
            .add_filter("LingForge archive", &["lingforge"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let Some(parent) = app
            .dialog()
            .file()
            .set_title("Choose a parent folder for the imported project")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let project =
            lingforge_storage::import_project(&local_path(source)?, &local_path(parent)?, false)?;
        workspace.activate(project);
        workspace.snapshot(config).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn duplicate_project(
    app: AppHandle,
    session_id: String,
) -> Result<Option<WorkspaceSnapshot>> {
    work(app, move |app, workspace, config| {
        let project = workspace.project(&session_id)?;
        let Some(parent) = app
            .dialog()
            .file()
            .set_title("Choose a parent folder for the duplicate project")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let duplicate = project.duplicate(&local_path(parent)?)?;
        workspace.activate(duplicate);
        workspace.snapshot(config).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn backup_project(app: AppHandle, session_id: String) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace.project(&session_id)?.backup("manual")?;
        workspace.snapshot(config)
    })
    .await
}

#[tauri::command]
pub async fn restore_project(
    app: AppHandle,
    session_id: String,
    backup_id: String,
) -> Result<Option<WorkspaceSnapshot>> {
    work(app, move |app, workspace, config| {
        let project = workspace.project(&session_id)?;
        let Some(parent) = app
            .dialog()
            .file()
            .set_title("Choose a parent folder for the recovered copy")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let recovered = project.restore_copy(&backup_id, &local_path(parent)?)?;
        workspace.activate(recovered);
        workspace.snapshot(config).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn save_preferences(app: AppHandle, preferences: Preferences) -> Result<()> {
    work(app, move |_, _, config| {
        Catalog::open(config)?.save_preferences(&preferences)
    })
    .await
}

#[tauri::command]
pub async fn forget_project(app: AppHandle, token: String) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        Catalog::open(config)?.forget(&token)?;
        workspace.remember_on_snapshot = false;
        workspace.snapshot(config)
    })
    .await
}
