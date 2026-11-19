//! Creates a new disposable native-test project through the normal storage API.
//! Never use this as application startup/seed data. Existing directories fail.
use lingforge_core::{
    glyph::import_svg,
    project::ProjectMetadata,
    writing::{Character, GlyphVariant, InputMapping, ScriptDraft},
};
use lingforge_storage::{Catalog, Project};
use std::{env, fs, path::PathBuf};
use uuid::Uuid;

fn main() {
    let root = PathBuf::from(env::args_os().nth(1).expect("Pass a NEW fixture directory"));
    fs::create_dir(&root).expect("Fixture directory must not exist");
    let root = root.canonicalize().expect("Resolve fixture directory");
    let projects = root.join("projects");
    fs::create_dir(&projects).expect("Create disposable project parent");
    let mut project = Project::create(
        &projects,
        &ProjectMetadata {
            name: "Disposable native editor checks".into(),
            language_name: "Test fixture".into(),
            description: "Synthetic test data; safe to remove after verification.".into(),
        },
    )
    .expect("Create valid project through storage");
    let mut characters = Vec::new();
    for (name, transliteration, path) in [
        ("Test T", "t", "M 10 90 L 50 10 L 90 90 Z"),
        ("Test TH", "th", "M 10 10 L 90 10 L 90 90 L 10 90 Z"),
    ] {
        let glyph_id = Uuid::new_v4().to_string();
        characters.push(Character {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            transliteration: transliteration.into(),
            phoneme_ids: vec![],
            glyphs: vec![GlyphVariant {
                id: glyph_id.clone(),
                name: "Test outline".into(),
                outline: import_svg(&format!(
                    r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="{path}"/></svg>"#
                ))
                .expect("Parse fixture geometry"),
            }],
            default_glyph_id: Some(glyph_id),
        });
    }
    let ids: Vec<_> = characters.iter().map(|c| c.id.clone()).collect();
    let mappings = [
        ("t", vec![ids[0].clone()]),
        ("th", vec![ids[1].clone()]),
        ("x", vec![ids[0].clone()]),
        ("tt", vec![ids[0].clone(), ids[0].clone()]),
        ("q", vec![ids[0].clone()]),
        ("q", vec![ids[1].clone()]),
    ]
    .into_iter()
    .map(|(input, character_ids)| InputMapping {
        id: Uuid::new_v4().to_string(),
        input: input.into(),
        character_ids,
    })
    .collect();
    let script = project
        .save_writing_system(
            None,
            None,
            ScriptDraft {
                name: "Native fixture alphabet".into(),
                notes: "Synthetic triangle/square outlines authored for testing.".into(),
                characters,
                mappings,
                sample: vec![],
            },
        )
        .expect("Persist validated alphabet fixture");
    for directory in ["data", "config", "cache"] {
        fs::create_dir(root.join(directory)).expect("Create isolated profile directory");
    }
    Catalog::open(&root.join("data/app.lingforge.desktop"))
        .expect("Open isolated catalog")
        .remember(project.path(), &project.summary().expect("Read summary"))
        .expect("Remember only the fixture project");
    let fixture = serde_json::json!({
        "fixtureSource": "native_fixture",
        "profileRoot": root,
        "projectPath": project.path(),
        "scriptId": script.id,
        "scriptName": script.data.name,
        "characterIds": ids,
    });
    fs::write(
        root.join("fixture.json"),
        serde_json::to_vec_pretty(&fixture).expect("Encode fixture manifest"),
    )
    .expect("Write fixture manifest");
    println!("{fixture}");
}
