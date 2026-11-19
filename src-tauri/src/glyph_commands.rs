use crate::{
    project_commands::work,
    workspace::{local_path, Result},
};
use lingforge_core::{
    glyph::GlyphOutline,
    glyph_edit::{self, EditableOutline, GlyphOperation},
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn decode_glyph(
    app: AppHandle,
    session_id: String,
    outline: Option<GlyphOutline>,
) -> Result<EditableOutline> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?;
        outline
            .as_ref()
            .map(EditableOutline::from_outline)
            .unwrap_or_else(|| Ok(EditableOutline::default()))
    })
    .await
}
#[tauri::command]
pub async fn edit_glyph(
    app: AppHandle,
    session_id: String,
    model: EditableOutline,
    operation: GlyphOperation,
) -> Result<EditableOutline> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?;
        glyph_edit::edit(&model, operation)
    })
    .await
}
#[tauri::command]
pub async fn encode_glyph(
    app: AppHandle,
    session_id: String,
    model: EditableOutline,
) -> Result<GlyphOutline> {
    work(app, move |_, workspace, _| {
        workspace.project(&session_id)?;
        model.to_outline()
    })
    .await
}
#[tauri::command]
pub async fn export_glyph_outline(
    app: AppHandle,
    session_id: String,
    model: EditableOutline,
) -> Result<Option<String>> {
    work(app, move |app, workspace, _| {
        workspace.project(&session_id)?;
        glyph_edit::svg(&model)?;
        let Some(path) = app
            .dialog()
            .file()
            .set_title("Export current glyph geometry")
            .set_file_name("glyph.svg")
            .add_filter("Outline SVG", &["svg"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = local_path(path)?;
        lingforge_storage::writing::export_glyph(&path, &model)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
}
