use crate::{
    project_commands::work,
    workspace::{Result, WorkspaceSnapshot},
};
use lingforge_core::phonology::{PhonemeDraft, PhonologyDraft, PhonologyProfile};
use lingforge_storage::phonology::{Inventory, PhonemeDetails};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPhoneme {
    details: PhonemeDetails,
    workspace: WorkspaceSnapshot,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPhonology {
    profile: PhonologyProfile,
    workspace: WorkspaceSnapshot,
}

#[tauri::command]
pub async fn phonology_inventory(
    app: AppHandle,
    session_id: String,
    search: String,
) -> Result<Inventory> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.phonology_inventory(&search)
    })
    .await
}
#[tauri::command]
pub async fn phoneme_details(
    app: AppHandle,
    session_id: String,
    id: String,
) -> Result<PhonemeDetails> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.phoneme(&id)
    })
    .await
}
#[tauri::command]
pub async fn save_phoneme(
    app: AppHandle,
    session_id: String,
    id: Option<String>,
    revision: Option<i64>,
    data: PhonemeDraft,
) -> Result<SavedPhoneme> {
    work(app, move |_, workspace, config| {
        let details =
            workspace
                .project_mut(&session_id)?
                .save_phoneme(id.as_deref(), revision, data)?;
        workspace.remember_on_snapshot = true;
        Ok(SavedPhoneme {
            details,
            workspace: workspace.snapshot(config)?,
        })
    })
    .await
}
#[tauri::command]
pub async fn delete_phoneme(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace
            .project_mut(&session_id)?
            .delete_phoneme(&id, revision)?;
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn save_phonology_profile(
    app: AppHandle,
    session_id: String,
    revision: i64,
    data: PhonologyDraft,
) -> Result<SavedPhonology> {
    work(app, move |_, workspace, config| {
        let profile = workspace
            .project_mut(&session_id)?
            .save_phonology_profile(revision, data)?;
        workspace.remember_on_snapshot = true;
        Ok(SavedPhonology {
            profile,
            workspace: workspace.snapshot(config)?,
        })
    })
    .await
}
