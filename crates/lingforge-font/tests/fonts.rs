use lingforge_core::{
    font::{ContextRule, FontDraft, LigatureRule, RunDirection},
    writing::WritingSystem,
};
use lingforge_font::{compile, preview};

fn fixture() -> (WritingSystem, FontDraft) {
    (
        serde_json::from_str(include_str!(
            "../../../tests/fixtures/fonts/simple-script.json"
        ))
        .unwrap(),
        serde_json::from_str(include_str!(
            "../../../tests/fixtures/fonts/simple-profile.json"
        ))
        .unwrap(),
    )
}
fn table<'a>(bytes: &'a [u8], tag: &[u8; 4]) -> &'a [u8] {
    let u16_at = |i| u16::from_be_bytes(bytes[i..i + 2].try_into().unwrap());
    let u32_at = |i| u32::from_be_bytes(bytes[i..i + 4].try_into().unwrap()) as usize;
    for i in 0..usize::from(u16_at(4)) {
        let at = 12 + i * 16;
        if &bytes[at..at + 4] == tag {
            return &bytes[u32_at(at + 8)..u32_at(at + 8) + u32_at(at + 12)];
        }
    }
    panic!("missing table")
}
#[test]
fn deterministic_sfnt_metrics_cmap_licenses_and_checksums() {
    let (script, data) = fixture();
    let bytes = compile(&script.id, &script.data, &data).unwrap();
    assert_eq!(compile(&script.id, &script.data, &data).unwrap(), bytes);
    let face = rustybuzz::ttf_parser::Face::parse(&bytes, 0).unwrap();
    assert_eq!(face.units_per_em(), 1000);
    assert_eq!(face.number_of_glyphs(), 6);
    assert_eq!(face.glyph_index('\u{e000}').unwrap().0, 1);
    assert_eq!(face.glyph_index('\u{301}').unwrap().0, 5);
    assert_eq!(
        face.glyph_hor_advance(rustybuzz::ttf_parser::GlyphId(5)),
        Some(0)
    );
    assert_eq!(
        u16::from_be_bytes(table(&bytes, b"OS/2")[4..6].try_into().unwrap()),
        400
    );
    assert_eq!(
        u16::from_be_bytes(table(&bytes, b"OS/2")[6..8].try_into().unwrap()),
        5
    );
    assert_eq!(
        u16::from_be_bytes(table(&bytes, b"OS/2")[8..10].try_into().unwrap()),
        2
    );
    assert!(face
        .names()
        .into_iter()
        .any(|n| n.name_id == 13 && n.to_string().as_deref() == Some(data.license.as_str())));
    let checksum = bytes.chunks(4).fold(0u32, |sum, chunk| {
        let mut word = [0u8; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum.wrapping_add(u32::from_be_bytes(word))
    });
    assert_eq!(checksum, 0xb1b0afba);
    assert!(!table(&bytes, b"glyf").is_empty());
    assert!(!table(&bytes, b"GDEF").is_empty());
    assert!(!table(&bytes, b"GPOS").is_empty());
}
#[test]
fn contextual_form_and_ligature_keep_original_character_ranges() {
    let (script, mut data) = fixture();
    let original = data.sample.clone();
    data.contexts.push(ContextRule {
        before: vec![],
        input: data.glyphs[0].variant_id.clone(),
        after: vec![data.glyphs[1].variant_id.clone()],
        output: data.glyphs[2].variant_id.clone(),
    });
    let result = preview(&script.id, &script.data, &data).unwrap();
    assert_eq!(
        result.glyphs.iter().map(|g| g.glyph_id).collect::<Vec<_>>(),
        vec![3, 2]
    );
    assert_eq!(data.sample, original);
    assert_eq!((result.glyphs[0].start, result.glyphs[0].end), (0, 1));
    data.contexts.clear();
    data.ligatures.push(LigatureRule {
        input: vec![
            data.glyphs[0].variant_id.clone(),
            data.glyphs[1].variant_id.clone(),
        ],
        output: data.glyphs[3].variant_id.clone(),
    });
    let result = preview(&script.id, &script.data, &data).unwrap();
    assert_eq!(result.glyphs.len(), 1);
    assert_eq!(
        (
            result.glyphs[0].glyph_id,
            result.glyphs[0].start,
            result.glyphs[0].end
        ),
        (4, 0, 2)
    );
    assert_eq!(data.sample, original);
}
#[test]
fn mark_attachment_and_explicit_rtl_run_have_inspectable_positions() {
    let (script, mut data) = fixture();
    data.sample = vec![
        data.glyphs[0].character_id.clone(),
        data.glyphs[4].character_id.clone(),
    ];
    let result = preview(&script.id, &script.data, &data).unwrap();
    let mark = result.glyphs.iter().find(|g| g.glyph_id == 5).unwrap();
    assert_eq!(mark.x_advance, 0);
    assert_eq!(mark.y_offset, 100);
    assert_eq!(mark.x_offset, -550);
    data.sample = vec![
        data.glyphs[0].character_id.clone(),
        data.glyphs[1].character_id.clone(),
    ];
    data.direction = RunDirection::Rtl;
    let result = preview(&script.id, &script.data, &data).unwrap();
    assert_eq!(
        result.glyphs.iter().map(|g| g.start).collect::<Vec<_>>(),
        vec![1, 0]
    );
    assert_eq!(
        result.glyphs.iter().map(|g| g.end).collect::<Vec<_>>(),
        vec![2, 1]
    );
}
#[test]
fn rejects_unsupported_geometry_bounds_and_duplicate_mappings_without_rewriting_sources() {
    let (mut script, mut data) = fixture();
    let original = script.data.clone();
    data.glyphs[1].codepoint = data.glyphs[0].codepoint;
    assert!(compile(&script.id, &script.data, &data).is_err());
    data.glyphs[1].codepoint = Some(0xe001);
    data.metrics.source_em = 16;
    assert!(compile(&script.id, &script.data, &data).is_err());
    assert_eq!(script.data, original);
    data.metrics.source_em = 1000;
    script.data.characters[0].glyphs[0]
        .outline
        .paths
        .push("M 0 0 L 100 100 L 100 0 Z".into());
    assert!(compile(&script.id, &script.data, &data)
        .unwrap_err()
        .message
        .contains("one SVG path"));
}
#[test]
fn no_layout_rules_no_marks_and_supplementary_pua_still_make_a_font() {
    let (script, mut data) = fixture();
    data.glyphs.retain(|g| !g.mark);
    data.glyphs[0].codepoint = Some(0xf0000);
    let bytes = compile(&script.id, &script.data, &data).unwrap();
    let face = rustybuzz::ttf_parser::Face::parse(&bytes, 0).unwrap();
    assert_eq!(face.glyph_index('\u{f0000}').unwrap().0, 1);
    data.sample.clear();
    assert!(preview(&script.id, &script.data, &data)
        .unwrap()
        .glyphs
        .is_empty());
}
#[test]
fn windows_line_extents_cover_attached_marks_and_reject_overflow() {
    let (script, mut data) = fixture();
    let bytes = compile(&script.id, &script.data, &data).unwrap();
    let os2 = table(&bytes, b"OS/2");
    // Authored typography is unchanged; Windows extents include positioned ink.
    assert_eq!(i16::from_be_bytes(os2[68..70].try_into().unwrap()), 800);
    assert_eq!(i16::from_be_bytes(os2[70..72].try_into().unwrap()), -200);
    assert_eq!(u16::from_be_bytes(os2[74..76].try_into().unwrap()), 900);
    assert_eq!(u16::from_be_bytes(os2[76..78].try_into().unwrap()), 200);
    data.glyphs[0].anchor = Some([0, i16::MAX]);
    data.glyphs[4].anchor = Some([0, i16::MIN]);
    assert!(compile(&script.id, &script.data, &data)
        .unwrap_err()
        .message
        .contains("Windows ascent limit"));
}
