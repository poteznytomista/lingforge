use crate::{
    project_commands::work,
    workspace::{local_path, Result, WorkspaceSnapshot},
};
use lingforge_core::{
    font::{FontDraft, FontProfile},
    writing::WritingSystem,
    AppError, ErrorCode,
};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct FontWorkspace {
    script: WritingSystem,
    profile: Option<FontProfile>,
    initial: FontDraft,
}
#[derive(Serialize)]
pub struct SavedFont {
    profile: FontProfile,
    workspace: WorkspaceSnapshot,
}
fn require_revision(script: &WritingSystem, revision: i64) -> Result<()> {
    if script.revision != revision {
        return Err(AppError::new(
            ErrorCode::Conflict,
            "The writing system changed. Reload its font profile before building or saving.",
        ));
    }
    Ok(())
}
#[tauri::command]
pub async fn font_workspace(
    app: AppHandle,
    session_id: String,
    script_id: String,
) -> Result<FontWorkspace> {
    work(app, move |_, workspace, _| {
        let project = workspace.project(&session_id)?;
        let script = project.writing_system(&script_id)?;
        let profile = project.font_profile(&script_id)?;
        let initial = profile
            .as_ref()
            .map(|p| p.data.clone())
            .unwrap_or_else(|| FontDraft::from_script(&script.data));
        Ok(FontWorkspace {
            script,
            profile,
            initial,
        })
    })
    .await
}
#[tauri::command]
pub async fn save_font_profile(
    app: AppHandle,
    session_id: String,
    script_id: String,
    script_revision: i64,
    revision: Option<i64>,
    data: FontDraft,
) -> Result<SavedFont> {
    work(app, move |_, workspace, config| {
        let profile = workspace.project_mut(&session_id)?.save_font_profile(
            &script_id,
            script_revision,
            revision,
            data,
        )?;
        workspace.remember_on_snapshot = true;
        Ok(SavedFont {
            profile,
            workspace: workspace.snapshot(config)?,
        })
    })
    .await
}
#[tauri::command]
pub async fn delete_font_profile(
    app: AppHandle,
    session_id: String,
    script_id: String,
    revision: i64,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace
            .project_mut(&session_id)?
            .delete_font_profile(&script_id, revision)?;
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn preview_font(
    app: AppHandle,
    session_id: String,
    script_id: String,
    script_revision: i64,
    data: FontDraft,
) -> Result<lingforge_font::FontPreview> {
    work(app, move |_, workspace, _| {
        let script = workspace.project(&session_id)?.writing_system(&script_id)?;
        require_revision(&script, script_revision)?;
        lingforge_font::preview(&script_id, &script.data, &data)
    })
    .await
}
#[tauri::command]
pub async fn export_font(
    app: AppHandle,
    session_id: String,
    script_id: String,
    script_revision: i64,
    data: FontDraft,
    rights_confirmed: bool,
) -> Result<Option<String>> {
    work(app, move |app,workspace,_| {
        let script = workspace.project(&session_id)?.writing_system(&script_id)?;
        require_revision(&script,script_revision)?;
        if !rights_confirmed || data.license.trim().is_empty() || data.copyright.trim().is_empty() {
            return Err(AppError::new(ErrorCode::InvalidInput,"Enter copyright and license information, choose embedding permissions, and confirm permission to distribute these outlines before exporting."));
        }
        let bytes = lingforge_font::compile(&script_id,&script.data,&data)?;
        let Some(path) = app.dialog().file().set_title("Export experimental font from current profile draft").set_file_name("LingForge-Regular.ttf").add_filter("TrueType font", &["ttf"]).blocking_save_file() else { return Ok(None); };
        let path = local_path(path)?;
        lingforge_storage::fonts::export_font(&path,&bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await
}
