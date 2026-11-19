use lingforge_core::{
    font::{FontDraft, LigatureRule},
    writing::WritingSystem,
};
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
#[test]
fn identities_not_unicode_assignments_control_saved_samples() {
    let (script, mut data) = fixture();
    let original = data.sample.clone();
    data.glyphs[0].codepoint = Some(0xf0000);
    data.validate(&script.data).unwrap();
    assert_eq!(data.sample, original);
    data.glyphs[0].variant_id = "00000000-0000-4000-8000-000000009999".into();
    assert!(data.validate(&script.data).is_err());
}
#[test]
fn rejects_unbounded_unknown_and_ambiguous_profiles() {
    let (script, data) = fixture();
    data.validate(&script.data).unwrap();
    for cp in [0xd800, 0x110000, 0xffff, 0x202e, 0x200d, 0xfe0f, 0x20] {
        let mut d = data.clone();
        d.glyphs[0].codepoint = Some(cp);
        assert!(d.validate(&script.data).is_err(), "{cp:x}");
    }
    let mut d = data.clone();
    d.glyphs[1].codepoint = d.glyphs[0].codepoint;
    assert!(d.validate(&script.data).is_err());
    let mut d = data.clone();
    d.glyphs[4].advance = 100;
    assert!(d.validate(&script.data).is_err());
    let mut d = data.clone();
    d.sample.resize(257, d.sample[0].clone());
    assert!(d.validate(&script.data).is_err());
    let mut d = data.clone();
    let rule = LigatureRule {
        input: vec![
            d.glyphs[0].variant_id.clone(),
            d.glyphs[1].variant_id.clone(),
        ],
        output: d.glyphs[3].variant_id.clone(),
    };
    d.ligatures = vec![rule.clone(), rule];
    assert!(d.validate(&script.data).is_err());
    let mut json = serde_json::to_value(data).unwrap();
    json["featuresFile"] = "include(secret.fea)".into();
    assert!(serde_json::from_value::<FontDraft>(json).is_err());
}
