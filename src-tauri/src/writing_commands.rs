use crate::{
    project_commands::work,
    workspace::{local_path, Result, WorkspaceSnapshot},
};
use lingforge_core::{
    glyph::{import_svg, GlyphOutline, MAX_SVG_BYTES},
    writing::{
        map_input, transliterate, InputPreview, ScriptDraft, TextUnit, Transliteration,
        WritingSystem,
    },
    AppError, ErrorCode,
};
use lingforge_storage::writing::ScriptSummary;
use serde::Serialize;
use std::{fs::File, io::Read};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct SavedWritingSystem {
    script: WritingSystem,
    workspace: WorkspaceSnapshot,
}
#[tauri::command]
pub async fn new_writing_identity(app: AppHandle, session_id: String) -> Result<String> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?;
        Ok(lingforge_storage::writing::new_identity())
    })
    .await
}
#[tauri::command]
pub async fn writing_systems(app: AppHandle, session_id: String) -> Result<Vec<ScriptSummary>> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.writing_systems()
    })
    .await
}
#[tauri::command]
pub async fn writing_system(
    app: AppHandle,
    session_id: String,
    id: String,
) -> Result<WritingSystem> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.writing_system(&id)
    })
    .await
}
#[tauri::command]
pub async fn save_writing_system(
    app: AppHandle,
    session_id: String,
    id: Option<String>,
    revision: Option<i64>,
    data: ScriptDraft,
) -> Result<SavedWritingSystem> {
    work(app, move |_, workspace, config| {
        let script = workspace.project_mut(&session_id)?.save_writing_system(
            id.as_deref(),
            revision,
            data,
        )?;
        workspace.remember_on_snapshot = true;
        Ok(SavedWritingSystem {
            script,
            workspace: workspace.snapshot(config)?,
        })
    })
    .await
}
#[tauri::command]
pub async fn delete_writing_system(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace
            .project_mut(&session_id)?
            .delete_writing_system(&id, revision)?;
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn preview_script_input(
    app: AppHandle,
    session_id: String,
    data: ScriptDraft,
    input: String,
    commit: bool,
    literal: bool,
) -> Result<InputPreview> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?;
        map_input(&data, &input, commit, literal)
    })
    .await
}
#[tauri::command]
pub async fn transliterate_script(
    app: AppHandle,
    session_id: String,
    data: ScriptDraft,
    units: Vec<TextUnit>,
) -> Result<Transliteration> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?;
        transliterate(&data, &units)
    })
    .await
}
#[tauri::command]
pub async fn import_glyph_outline(
    app: AppHandle,
    session_id: String,
) -> Result<Option<GlyphOutline>> {
    work(app, move |app, workspace, _| {
        workspace.project(&session_id)?;
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Import an outline SVG")
            .add_filter("Outline SVG", &["svg"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = local_path(path)?;
        let io_error = |_| AppError::new(ErrorCode::Io, "Cannot read the selected SVG file.");
        if !std::fs::symlink_metadata(&path)
            .map_err(io_error)?
            .file_type()
            .is_file()
        {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Choose a regular SVG file.",
            ));
        }
        let mut bytes = Vec::new();
        File::open(path)
            .map_err(io_error)?
            .take((MAX_SVG_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(io_error)?;
        let source = std::str::from_utf8(&bytes)
            .map_err(|_| AppError::new(ErrorCode::InvalidInput, "SVG input must be UTF-8."))?;
        import_svg(source).map(Some)
    })
    .await
}
