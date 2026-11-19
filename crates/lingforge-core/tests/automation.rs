use lingforge_core::automation::*;
fn fixture() -> ProgramDraft {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/automation/program-v1.json"
    ))
    .unwrap()
}
fn id(n: usize) -> String {
    format!("00000000-0000-4000-8000-{n:012}")
}
fn run(p: &ProgramDraft, input: &str) -> Evaluation {
    p.evaluate(&id(100), &p.cells[0].id, input).unwrap()
}
#[test]
fn affixes_infixes_reduplication_and_root_templates_are_deterministic() {
    let mut p = fixture();
    let first = run(&p, "kat");
    assert_eq!(first.output, "kati");
    assert_eq!(first, run(&p, "kat"));
    assert_eq!(first.steps[0].before, "kat");
    assert_eq!(first.steps[0].rule_id, p.rules[0].id);
    assert_eq!(first.phonotactics, None);
    p.rules[0].operation = Operation::Infix {
        at: 1,
        text: "um".into(),
    };
    assert_eq!(run(&p, "kat").output, "kumat");
    p.rules[0].operation = Operation::Template {
        pieces: vec![
            Piece::Stem,
            Piece::Literal { text: "-".into() },
            Piece::Stem,
        ],
    };
    assert_eq!(run(&p, "kat").output, "kat-kat");
    p.rules[0].operation = Operation::Template {
        pieces: vec![
            Piece::Slice { start: 0, end: 1 },
            Piece::Literal { text: "a".into() },
            Piece::Slice { start: 1, end: 2 },
            Piece::Literal { text: "a".into() },
            Piece::Slice { start: 2, end: 3 },
        ],
    };
    assert_eq!(run(&p, "ktb").output, "katab");
    assert!(p.evaluate(&id(100), &p.cells[0].id, "k").is_err());
}
#[test]
fn graphemes_are_not_split_or_normalized_and_rewrites_do_not_rematch_output() {
    let mut p = fixture();
    p.rules[0].operation = Operation::Infix {
        at: 1,
        text: "x".into(),
    };
    assert_eq!(run(&p, "a\u{303}b").output, "a\u{303}xb");
    p.rules[0].operation = Operation::Rewrite {
        from: "a".into(),
        to: "aa".into(),
        before: None,
        after: None,
        word_start: false,
        word_end: false,
    };
    assert_eq!(run(&p, "aaa").output, "aaaaaa");
    assert_eq!(run(&p, "a\u{303}").output, "a\u{303}");
    p.rules[0].operation = Operation::Rewrite {
        from: "aa".into(),
        to: "x".into(),
        before: None,
        after: None,
        word_start: false,
        word_end: false,
    };
    assert_eq!(run(&p, "aaa").output, "xa");
}
#[test]
fn ordered_sound_changes_respect_classes_boundaries_and_trace_each_step() {
    let mut p = fixture();
    p.rules[0].operation = Operation::Rewrite {
        from: "t".into(),
        to: "d".into(),
        before: Some(p.classes[0].id.clone()),
        after: Some(p.classes[0].id.clone()),
        word_start: false,
        word_end: false,
    };
    p.rules.push(Rule {
        id: id(6),
        name: "Final vowel loss".into(),
        operation: Operation::Rewrite {
            from: "a".into(),
            to: String::new(),
            before: None,
            after: None,
            word_start: false,
            word_end: true,
        },
    });
    p.cells[0].rules.push(id(6));
    let result = run(&p, "ata");
    assert_eq!(result.output, "ad");
    assert_eq!(result.steps.len(), 2);
    assert_eq!(result.steps[0].after, "ada");
    assert_eq!(run(&p, "tta").output, "tt");
    p.cells[0].rules.reverse();
    assert_eq!(run(&p, "ata").output, "at");
}
#[test]
fn overrides_and_bounded_phonotactics_are_explicit() {
    let mut p = fixture();
    p.phonotactics.push(Phonotactic {
        id: id(7),
        name: "Vowel-only".into(),
        slots: vec![ClassSlot {
            class_id: p.classes[0].id.clone(),
            min: 1,
            max: 3,
        }],
    });
    assert_eq!(run(&p, "kat").phonotactics, Some(false));
    p.overrides.push(Irregular {
        entry_id: id(100),
        cell_id: p.cells[0].id.clone(),
        output: "ai".into(),
        reason: "Authored irregular stem".into(),
    });
    let result = run(&p, "kat");
    assert_eq!(result.output, "ai");
    assert_eq!(result.phonotactics, Some(true));
    assert!(result.steps.is_empty());
    assert_eq!(
        result.irregular_reason.as_deref(),
        Some("Authored irregular stem")
    );
    assert_eq!(
        p.evaluate(&id(101), &p.cells[0].id, "kat").unwrap().output,
        "kati"
    );
    p.phonotactics[0].slots[0].min = 0;
    p.phonotactics[0].slots.push(ClassSlot {
        class_id: p.classes[0].id.clone(),
        min: 1,
        max: 2,
    });
    assert_eq!(run(&p, "kat").phonotactics, Some(true));
}
#[test]
fn missing_references_cycles_and_ambiguous_feature_bundles_fail_before_evaluation() {
    let mut p = fixture();
    p.rules.push(Rule {
        id: id(6),
        name: "Reusable".into(),
        operation: Operation::Call {
            rule_id: p.rules[0].id.clone(),
        },
    });
    p.cells[0].rules = vec![id(6)];
    assert_eq!(run(&p, "kat").output, "kati");
    p.rules[0].operation = Operation::Call { rule_id: id(6) };
    assert!(p.validate().unwrap_err().message.contains("cycle"));
    p.cells[0].rules.clear();
    assert!(p.validate().is_err()); // Unused cycles are still rejected.
    let mut p = fixture();
    p.cells[0].rules = vec![id(999)];
    assert!(p.validate().is_err());
    let mut p = fixture();
    let mut cell = p.cells[0].clone();
    cell.id = id(7);
    cell.name = "Ambiguous".into();
    p.cells.push(cell);
    assert!(p.validate().is_err());
    let mut p = fixture();
    p.features[0].values.clear();
    assert!(p.validate().is_err());
}
#[test]
fn output_depth_and_unknown_code_are_bounded() {
    let mut p = fixture();
    p.rules[0].operation = Operation::Template {
        pieces: vec![Piece::Stem; 16],
    };
    assert!(p
        .evaluate(&id(100), &p.cells[0].id, &"a".repeat(256))
        .is_err());
    let mut p = fixture();
    for n in 10..28 {
        p.rules.push(Rule {
            id: id(n),
            name: "Call".into(),
            operation: Operation::Call {
                rule_id: if n == 27 {
                    p.rules[0].id.clone()
                } else {
                    id(n + 1)
                },
            },
        });
    }
    assert!(p.validate().is_err());
    let mut json = serde_json::to_value(fixture()).unwrap();
    json["rules"][0]["operation"] = serde_json::json!({"kind":"script","code":"system command"});
    assert!(serde_json::from_value::<ProgramDraft>(json).is_err());
}
