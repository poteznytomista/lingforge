use crate::{
    project_commands::work,
    workspace::{local_path, Result, WorkspaceSnapshot},
};
use lingforge_core::{
    notebook::{
        CharacterMapping, Conversion, NotebookDraft, NotebookRecord, Paragraph, RecordKind,
    },
    writing::{TextUnit, Transliteration},
};
use lingforge_storage::notebook::{ExportFormat, ImportCandidate, RecordSummary};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct SavedRecord {
    record: NotebookRecord,
    workspace: WorkspaceSnapshot,
}
#[tauri::command]
pub async fn notebook_records(
    app: AppHandle,
    session_id: String,
    kind: RecordKind,
) -> Result<Vec<RecordSummary>> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.notebook_records(kind)
    })
    .await
}
#[tauri::command]
pub async fn notebook_record(
    app: AppHandle,
    session_id: String,
    id: String,
) -> Result<NotebookRecord> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.notebook_record(&id)
    })
    .await
}
#[tauri::command]
pub async fn save_notebook_record(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: Option<i64>,
    data: NotebookDraft,
) -> Result<SavedRecord> {
    work(app, move |_, workspace, config| {
        let record = workspace
            .project_mut(&session_id)?
            .save_notebook_record(&id, revision, data)?;
        workspace.remember_on_snapshot = true;
        Ok(SavedRecord {
            record,
            workspace: workspace.snapshot(config)?,
        })
    })
    .await
}
#[tauri::command]
pub async fn delete_notebook_record(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace
            .project_mut(&session_id)?
            .delete_notebook_record(&id, revision)?;
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn edit_document_paragraph(
    app: AppHandle,
    session_id: String,
    paragraph: Paragraph,
    start: usize,
    end: usize,
    units: Vec<TextUnit>,
) -> Result<Paragraph> {
    work(app, move |_, workspace, _| {
        workspace
            .project(&session_id)?
            .edit_paragraph(&paragraph, start, end, units)
    })
    .await
}
#[tauri::command]
pub async fn convert_document_paragraph(
    app: AppHandle,
    session_id: String,
    paragraph: Paragraph,
    target_id: String,
    mappings: Vec<CharacterMapping>,
) -> Result<Conversion> {
    work(app, move |_, workspace, _| {
        workspace
            .project(&session_id)?
            .convert_paragraph(&paragraph, &target_id, &mappings)
    })
    .await
}
#[tauri::command]
pub async fn document_text(
    app: AppHandle,
    session_id: String,
    data: NotebookDraft,
    plain: bool,
) -> Result<Transliteration> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.document_text(&data, plain)
    })
    .await
}
#[tauri::command]
pub async fn choose_notebook_import(
    app: AppHandle,
    session_id: String,
) -> Result<Option<ImportCandidate>> {
    work(app, move |app, workspace, _| {
        let project = workspace.project(&session_id)?;
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Review a LingForge notebook file")
            .add_filter("Notebook JSON", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        project.read_notebook_file(&local_path(path)?).map(Some)
    })
    .await
}
#[tauri::command]
pub async fn export_notebook_record(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
    format: ExportFormat,
) -> Result<Option<String>> {
    work(app, move |app, workspace, _| {
        let project = workspace.project(&session_id)?;
        // Validate loss/identity constraints before presenting the destination picker.
        project.export_notebook_bytes(&id, revision, format)?;
        let extension = if matches!(format, ExportFormat::Structured) {
            "json"
        } else {
            "txt"
        };
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Export saved notebook record")
            .set_file_name(format!("lingforge-document.{extension}"))
            .add_filter("Notebook export", &[extension])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = local_path(path)?;
        project.export_notebook(&id, revision, &path, format)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
}
