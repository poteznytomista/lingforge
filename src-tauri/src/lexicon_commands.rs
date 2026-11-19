use crate::{
    project_commands::work,
    workspace::{local_path, PendingImport, Result, WorkspaceSnapshot},
};
use lingforge_core::{lexicon::LexemeDraft, AppError, ErrorCode};
use lingforge_storage::{
    lexicon::{LexemeDetails, LexiconPage, LexiconQuery},
    lexicon_transfer::{
        CsvMapping, DuplicatePolicy, ImportPreview, ImportSource, SourceInfo, TransferFormat,
    },
};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedLexeme {
    details: LexemeDetails,
    workspace: WorkspaceSnapshot,
}

#[tauri::command]
pub async fn lexicon_page(
    app: AppHandle,
    session_id: String,
    query: LexiconQuery,
) -> Result<LexiconPage> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.lexicon_page(&query)
    })
    .await
}
#[tauri::command]
pub async fn lexeme_details(
    app: AppHandle,
    session_id: String,
    id: String,
) -> Result<LexemeDetails> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?.lexeme(&id)
    })
    .await
}
#[tauri::command]
pub async fn save_lexeme(
    app: AppHandle,
    session_id: String,
    id: Option<String>,
    revision: Option<i64>,
    data: LexemeDraft,
) -> Result<SavedLexeme> {
    work(app, move |_, workspace, config| {
        let details =
            workspace
                .project_mut(&session_id)?
                .save_lexeme(id.as_deref(), revision, data)?;
        workspace.remember_on_snapshot = true;
        Ok(SavedLexeme {
            details,
            workspace: workspace.snapshot(config)?,
        })
    })
    .await
}
#[tauri::command]
pub async fn delete_lexeme(
    app: AppHandle,
    session_id: String,
    id: String,
    revision: i64,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace
            .project_mut(&session_id)?
            .delete_lexeme(&id, revision)?;
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn choose_lexicon_import(
    app: AppHandle,
    session_id: String,
    format: TransferFormat,
) -> Result<Option<SourceInfo>> {
    work(app, move |app, workspace, _| {
        workspace.project(&session_id)?;
        let extension = match format {
            TransferFormat::Json => "json",
            TransferFormat::Csv => "csv",
        };
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Choose a lexicon to preview")
            .add_filter("Lexicon", &[extension])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let source = ImportSource::read(&local_path(path)?, format)?;
        let info = source.info();
        workspace.pending_import = Some(PendingImport {
            session_id,
            source,
            prepared: None,
        });
        Ok(Some(info))
    })
    .await
}
#[tauri::command]
pub async fn preview_lexicon_import(
    app: AppHandle,
    session_id: String,
    source_token: String,
    mapping: Option<CsvMapping>,
    policy: DuplicatePolicy,
) -> Result<ImportPreview> {
    work(app, move |_, workspace, _| {
        let project = workspace.project(&session_id)?;
        let pending = workspace
            .pending_import
            .as_ref()
            .filter(|pending| {
                pending.session_id == session_id && pending.source.token() == source_token
            })
            .ok_or_else(|| AppError::new(ErrorCode::Conflict, "Choose the import file again."))?;
        let prepared = pending.source.prepare(project, mapping.as_ref(), policy)?;
        let preview = prepared.preview();
        if let Some(pending) = &mut workspace.pending_import {
            pending.prepared = Some(prepared);
        }
        Ok(preview)
    })
    .await
}
#[tauri::command]
pub async fn commit_lexicon_import(
    app: AppHandle,
    session_id: String,
    preview_token: String,
) -> Result<WorkspaceSnapshot> {
    work(app, move |_, workspace, config| {
        workspace.project(&session_id)?;
        let pending = workspace
            .pending_import
            .take()
            .ok_or_else(|| AppError::new(ErrorCode::Conflict, "Preview the import again."))?;
        let result = (|| {
            let prepared = pending
                .prepared
                .as_ref()
                .filter(|prepared| {
                    pending.session_id == session_id && prepared.token() == preview_token
                })
                .ok_or_else(|| AppError::new(ErrorCode::Conflict, "Preview the import again."))?;
            workspace.project_mut(&session_id)?.import_lexicon(prepared)
        })();
        if let Err(error) = result {
            workspace.pending_import = Some(pending);
            return Err(error);
        }
        workspace.remember_on_snapshot = true;
        workspace.snapshot(config)
    })
    .await
}
#[tauri::command]
pub async fn export_lexicon(
    app: AppHandle,
    session_id: String,
    format: TransferFormat,
) -> Result<Option<String>> {
    work(app, move |app, workspace, _| {
        let project = workspace.project(&session_id)?;
        let extension = match format {
            TransferFormat::Json => "json",
            TransferFormat::Csv => "csv",
        };
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Export saved lexicon (choose a new filename)")
            .add_filter("Lexicon", &[extension])
            .set_file_name(format!("Lexicon.{extension}"))
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let mut path = local_path(path)?;
        if path.extension().is_none() {
            path.set_extension(extension);
        }
        project.export_lexicon(&path, format)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
}
