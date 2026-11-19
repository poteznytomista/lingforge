mod automation_commands;
mod commands;
mod font_commands;
mod glyph_commands;
mod lexicon_commands;
mod notebook_commands;
mod phonology_commands;
mod project_commands;
mod workspace;
mod writing_commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(workspace::WorkspaceState::default())
        .invoke_handler(tauri::generate_handler![
            commands::application_info,
            project_commands::workspace_state,
            project_commands::create_project,
            project_commands::open_project,
            project_commands::save_project,
            project_commands::close_project,
            project_commands::export_project,
            project_commands::import_project,
            project_commands::duplicate_project,
            project_commands::backup_project,
            project_commands::restore_project,
            project_commands::save_preferences,
            project_commands::forget_project,
            lexicon_commands::lexicon_page,
            lexicon_commands::lexeme_details,
            lexicon_commands::save_lexeme,
            lexicon_commands::delete_lexeme,
            lexicon_commands::choose_lexicon_import,
            lexicon_commands::preview_lexicon_import,
            lexicon_commands::commit_lexicon_import,
            lexicon_commands::export_lexicon,
            phonology_commands::phonology_inventory,
            phonology_commands::phoneme_details,
            phonology_commands::save_phoneme,
            phonology_commands::delete_phoneme,
            phonology_commands::save_phonology_profile,
            writing_commands::writing_systems,
            writing_commands::new_writing_identity,
            writing_commands::writing_system,
            writing_commands::save_writing_system,
            writing_commands::delete_writing_system,
            writing_commands::preview_script_input,
            writing_commands::transliterate_script,
            writing_commands::import_glyph_outline,
            notebook_commands::notebook_records,
            notebook_commands::notebook_record,
            notebook_commands::save_notebook_record,
            notebook_commands::delete_notebook_record,
            notebook_commands::edit_document_paragraph,
            notebook_commands::convert_document_paragraph,
            notebook_commands::document_text,
            notebook_commands::choose_notebook_import,
            notebook_commands::export_notebook_record,
            glyph_commands::decode_glyph,
            glyph_commands::edit_glyph,
            glyph_commands::encode_glyph,
            glyph_commands::export_glyph_outline,
            automation_commands::automation_index,
            automation_commands::automation_program,
            automation_commands::automation_batch,
            automation_commands::new_automation_identity,
            automation_commands::save_automation_program,
            automation_commands::delete_automation_program,
            automation_commands::preview_automation,
            automation_commands::apply_automation,
            automation_commands::revert_automation_batch,
            font_commands::font_workspace,
            font_commands::save_font_profile,
            font_commands::delete_font_profile,
            font_commands::preview_font,
            font_commands::export_font,
        ])
        .run(tauri::generate_context!())
        .expect("LingForge could not start its desktop runtime");
}
