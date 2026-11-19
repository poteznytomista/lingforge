use crate::{
    project_commands::work,
    workspace::{Result, WorkspaceSnapshot},
};
use lingforge_core::{
    automation::{Program, ProgramDraft},
    AppError, ErrorCode,
};
use lingforge_storage::automation::{Batch, Index, Preview};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
pub struct SavedProgram {
    program: Program,
    workspace: WorkspaceSnapshot,
}
#[tauri::command]
pub async fn automation_index(app: AppHandle, session_id: String) -> Result<Index> {
    work(app, move |_, w, _| {
        w.project(&session_id)?.automation_index()
    })
    .await
}
#[tauri::command]
pub async fn automation_program(app: AppHandle, session_id: String, id: String) -> Result<Program> {
    work(app, move |_, w, _| {
        w.project(&session_id)?.automation_program(&id)
    })
    .await
}
#[tauri::command]
pub async fn automation_batch(app: AppHandle, session_id: String, id: String) -> Result<Batch> {
    work(app, move |_, w, _| {
        w.project(&session_id)?.automation_batch(&id)
    })
    .await
}
#[tauri::command]
pub async fn new_automation_identity(app: AppHandle, session_id: String) -> Result<String> {
    work(app, move |_, w, _| {
        w.project(&session_id)?;
        Ok(lingforge_storage::writing::new_identity())
    })
    .await
}
#[tauri::command]
pub async fn save_automation_program(
    app: AppHandle,
    session_id: String,
    id: Option<String>,
    revision: Option<i64>,
    data: ProgramDraft,
) -> Result<SavedProgram> {
    work(app, move |_, w, config| {
        let program = w
            .project_mut(&session_id)?
            .save_automation(id.as_deref(), revision, data)?;
        w.remember_on_snapshot = true;
        Ok(SavedProgram {
            program,
            workspace: w.snapshot(config)?,
        })
    })
    .await
}
#[tauri::command]
pub async fn delete_automation_program(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, w, config| {
        w.project_mut(&session_id)?
            .delete_automation(&id, revision)?;
        w.remember_on_snapshot = true;
        w.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn preview_automation(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
    entries: Vec<String>,
    cells: Vec<String>,
) -> Result<Preview> {
    work(app, move |_, w, _| {
        // A failed replacement preview must not leave an older token usable.
        w.project(&session_id)?;
        w.pending_automation = None;
        let prepared = w
            .project(&session_id)?
            .prepare_automation(&id, revision, &entries, &cells)?;
        let preview = prepared.preview();
        w.pending_automation = Some(prepared);
        Ok(preview)
    })
    .await
}
#[tauri::command]
pub async fn apply_automation(
    app: AppHandle,
    session_id: String,
    token: String,
    selected: Vec<usize>,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, w, config| {
        w.project(&session_id)?;
        let pending = w
            .pending_automation
            .take()
            .ok_or_else(|| AppError::new(ErrorCode::Conflict, "Preview this generation again."))?;
        let result = if pending.token() != token {
            Err(AppError::new(
                ErrorCode::Conflict,
                "This generation preview is obsolete.",
            ))
        } else {
            w.project_mut(&session_id)?
                .apply_automation(&pending, &selected)
        };
        if let Err(e) = result {
            w.pending_automation = Some(pending);
            return Err(e);
        }
        w.remember_on_snapshot = true;
        w.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn revert_automation_batch(
    app: AppHandle,
    session_id: String,
    id: String,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, w, config| {
        w.project_mut(&session_id)?.revert_automation(&id)?;
        w.remember_on_snapshot = true;
        w.snapshot(config)
    })
    .await
}
