//! Experimental documents and descriptive grammar. No automatic linguistic analysis.
use crate::{
    lexicon::{input_error, text},
    writing::{identifier, validate_units, ScriptDraft, TextUnit, WritingSystem},
    AppError,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordKind {
    Document,
    Grammar,
}
impl RecordKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Document => "document",
            Self::Grammar => "grammar",
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LexicalSpan {
    pub start: usize,
    pub end: usize,
    pub entry_id: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Paragraph {
    pub id: String,
    pub script_id: Option<String>,
    pub units: Vec<TextUnit>,
    pub links: Vec<LexicalSpan>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentDraft {
    pub title: String,
    pub notes: String,
    pub paragraphs: Vec<Paragraph>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GrammarFeature {
    pub id: String,
    pub name: String,
    pub values: String,
    pub description: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GrammarExample {
    pub id: String,
    pub text: String,
    pub gloss: String,
    pub translation: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MorphologyKind {
    Inflection,
    Derivation,
    Irregular,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MorphologyNote {
    pub id: String,
    pub kind: MorphologyKind,
    pub label: String,
    pub description: String,
    pub entry_id: Option<String>,
    pub form: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GrammarDraft {
    pub title: String,
    pub notes: String,
    pub features: Vec<GrammarFeature>,
    pub examples: Vec<GrammarExample>,
    pub lexeme_ids: Vec<String>,
    pub phoneme_ids: Vec<String>,
    pub morphology: Vec<MorphologyNote>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "content",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum NotebookDraft {
    Document(DocumentDraft),
    Grammar(GrammarDraft),
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotebookRecord {
    pub id: String,
    pub revision: i64,
    pub data: NotebookDraft,
}

fn distinct_ids<'a>(ids: impl Iterator<Item = &'a str>) -> Result<(), AppError> {
    let mut seen = HashSet::new();
    if ids
        .into_iter()
        .any(|id| !identifier(id) || !seen.insert(id))
    {
        return Err(input_error(
            "Identifiers must be canonical and distinct within their owner.",
        ));
    }
    Ok(())
}
pub fn validate_paragraph(p: &Paragraph, scripts: &[WritingSystem]) -> Result<(), AppError> {
    if !identifier(&p.id) {
        return Err(input_error("Invalid paragraph identity."));
    }
    let characters = match &p.script_id {
        None => HashSet::new(),
        Some(id) => scripts
            .iter()
            .find(|s| &s.id == id)
            .ok_or_else(|| input_error("A paragraph references an unavailable writing system."))?
            .data
            .characters
            .iter()
            .map(|c| c.id.as_str())
            .collect(),
    };
    validate_units(&p.units, &characters)?;
    if p.links.len() > 256 {
        return Err(input_error("Use at most 256 lexical links per paragraph."));
    }
    let mut end = 0;
    for link in &p.links {
        if !identifier(&link.entry_id)
            || link.start < end
            || link.start >= link.end
            || link.end > p.units.len()
        {
            return Err(input_error(
                "Lexical spans must be ordered, nonempty, nonoverlapping and within the paragraph.",
            ));
        }
        end = link.end;
    }
    Ok(())
}
impl NotebookDraft {
    pub fn kind(&self) -> RecordKind {
        match self {
            Self::Document(_) => RecordKind::Document,
            Self::Grammar(_) => RecordKind::Grammar,
        }
    }
    pub fn title(&self) -> &str {
        match self {
            Self::Document(d) => &d.title,
            Self::Grammar(g) => &g.title,
        }
    }
    pub fn validate(&self, scripts: &[WritingSystem]) -> Result<(), AppError> {
        text(self.title(), 160, true, false)?;
        match self {
            Self::Document(d) => {
                text(&d.notes, 20_000, false, true)?;
                if d.paragraphs.is_empty()
                    || d.paragraphs.len() > 128
                    || d.paragraphs.iter().map(|p| p.units.len()).sum::<usize>() > 65_536
                {
                    return Err(input_error(
                        "Documents need 1–128 paragraphs and at most 65,536 total text units.",
                    ));
                }
                distinct_ids(d.paragraphs.iter().map(|p| p.id.as_str()))?;
                for p in &d.paragraphs {
                    validate_paragraph(p, scripts)?;
                }
            }
            Self::Grammar(g) => {
                text(&g.notes, 40_000, false, true)?;
                if g.features.len() > 64
                    || g.examples.len() > 128
                    || g.morphology.len() > 128
                    || g.lexeme_ids.len() > 256
                    || g.phoneme_ids.len() > 256
                {
                    return Err(input_error(
                        "This grammar section exceeds its feature, example or reference limit.",
                    ));
                }
                distinct_ids(
                    g.features
                        .iter()
                        .map(|f| f.id.as_str())
                        .chain(g.examples.iter().map(|e| e.id.as_str()))
                        .chain(g.morphology.iter().map(|m| m.id.as_str())),
                )?;
                distinct_ids(g.lexeme_ids.iter().map(String::as_str))?;
                distinct_ids(g.phoneme_ids.iter().map(String::as_str))?;
                for f in &g.features {
                    text(&f.name, 120, true, false)?;
                    text(&f.values, 2000, false, true)?;
                    text(&f.description, 4000, false, true)?;
                }
                for e in &g.examples {
                    text(&e.text, 4000, true, true)?;
                    text(&e.gloss, 4000, false, true)?;
                    text(&e.translation, 4000, false, true)?;
                }
                for m in &g.morphology {
                    text(&m.label, 120, true, false)?;
                    text(&m.description, 4000, false, true)?;
                    text(&m.form, 2000, m.kind == MorphologyKind::Irregular, false)?;
                    if m.entry_id.as_ref().is_some_and(|id| !identifier(id))
                        || (m.kind == MorphologyKind::Irregular && m.entry_id.is_none())
                    {
                        return Err(input_error(
                            "An irregular form needs a linked lexical entry and an authored form.",
                        ));
                    }
                }
            }
        }
        Ok(())
    }
}

/// Half-open unit ranges. Insertion at a link boundary lies outside the link;
/// insertion inside or replacement touching it invalidates it explicitly.
pub fn replace_range(
    p: &Paragraph,
    start: usize,
    end: usize,
    units: Vec<TextUnit>,
) -> Result<Paragraph, AppError> {
    if start > end || end > p.units.len() || p.units.len() - (end - start) + units.len() > 4096 {
        return Err(input_error("Invalid selection or paragraph length."));
    }
    if start == end && units.is_empty() {
        return Ok(p.clone());
    }
    let shift = |n: usize| n - (end - start) + units.len();
    let mut result = p.clone();
    result.links = p
        .links
        .iter()
        .filter_map(|link| {
            if link.end <= start {
                Some(link.clone())
            } else if link.start >= end {
                Some(LexicalSpan {
                    start: shift(link.start),
                    end: shift(link.end),
                    entry_id: link.entry_id.clone(),
                })
            } else {
                None
            }
        })
        .collect();
    result.units.splice(start..end, units);
    Ok(result)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CharacterMapping {
    pub source_id: String,
    pub target_ids: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversion {
    pub paragraph: Option<Paragraph>,
    pub issues: Vec<String>,
}
/// Explicit orthography conversion. Defaults match exact nonempty transliteration,
/// never display names or glyphs. Overrides are reviewed per source character.
pub fn convert(
    p: &Paragraph,
    source: &ScriptDraft,
    target: &WritingSystem,
    overrides: &[CharacterMapping],
) -> Result<Conversion, AppError> {
    source.validate()?;
    target.data.validate()?;
    let from: HashMap<_, _> = source
        .characters
        .iter()
        .map(|c| (c.id.as_str(), c))
        .collect();
    validate_units(&p.units, &from.keys().copied().collect())?;
    distinct_ids(overrides.iter().map(|m| m.source_id.as_str()))?;
    if overrides.len() > 256
        || overrides.iter().any(|m| {
            !from.contains_key(m.source_id.as_str())
                || m.target_ids.is_empty()
                || m.target_ids.len() > 16
                || m.target_ids
                    .iter()
                    .any(|id| !target.data.characters.iter().any(|c| &c.id == id))
        })
    {
        return Err(input_error(
            "Conversion overrides need an existing source character and 1–16 target characters.",
        ));
    }
    let mut result = p.clone();
    result.script_id = Some(target.id.clone());
    result.units.clear();
    let mut boundaries = vec![0];
    let mut issues = Vec::new();
    for (i, unit) in p.units.iter().enumerate() {
        match unit {
            TextUnit::Text { .. } => result.units.push(unit.clone()),
            TextUnit::Symbol { character_id } => {
                let character = from[character_id.as_str()];
                let ids: Vec<String> = if let Some(mapping) =
                    overrides.iter().find(|m| &m.source_id == character_id)
                {
                    mapping.target_ids.clone()
                } else {
                    let candidates: Vec<_> = target
                        .data
                        .characters
                        .iter()
                        .filter(|c| {
                            !character.transliteration.is_empty()
                                && c.transliteration == character.transliteration
                        })
                        .collect();
                    if candidates.len() != 1 {
                        issues.push(format!(
                            "Unit {} ({}): {} target mapping. Choose an explicit replacement.",
                            i + 1,
                            character.name,
                            if candidates.is_empty() {
                                "missing"
                            } else {
                                "ambiguous"
                            }
                        ));
                        Vec::new()
                    } else {
                        vec![candidates[0].id.clone()]
                    }
                };
                result.units.extend(
                    ids.into_iter()
                        .map(|character_id| TextUnit::Symbol { character_id }),
                );
            }
        }
        boundaries.push(result.units.len());
    }
    if result.units.len() > 4096 {
        issues.push("The converted paragraph exceeds 4,096 units.".into());
    }
    if !issues.is_empty() {
        return Ok(Conversion {
            paragraph: None,
            issues,
        });
    }
    for link in &mut result.links {
        link.start = *boundaries
            .get(link.start)
            .ok_or_else(|| input_error("Invalid lexical span."))?;
        link.end = *boundaries
            .get(link.end)
            .ok_or_else(|| input_error("Invalid lexical span."))?;
    }
    Ok(Conversion {
        paragraph: Some(result),
        issues,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::writing::Character;
    fn id(n: usize) -> String {
        format!("00000000-0000-4000-8000-{n:012}")
    }
    fn literal(s: &str) -> TextUnit {
        TextUnit::Text { text: s.into() }
    }
    fn paragraph() -> Paragraph {
        Paragraph {
            id: id(1),
            script_id: None,
            units: vec![literal("a"), literal("b"), literal("c"), literal("d")],
            links: vec![LexicalSpan {
                start: 1,
                end: 3,
                entry_id: id(2),
            }],
        }
    }
    fn script(n: usize) -> WritingSystem {
        WritingSystem {
            id: id(n),
            revision: 0,
            data: ScriptDraft {
                name: "Fixture".into(),
                characters: vec![Character {
                    id: id(n + 1),
                    name: "Character".into(),
                    transliteration: "th".into(),
                    phoneme_ids: vec![],
                    glyphs: vec![],
                    default_glyph_id: None,
                }],
                ..Default::default()
            },
        }
    }
    #[test]
    fn edits_shift_links_at_boundaries_and_invalidate_intersections() {
        let p = paragraph();
        for start in [0, 1] {
            let next = replace_range(&p, start, start, vec![literal("x")]).unwrap();
            assert_eq!((next.links[0].start, next.links[0].end), (2, 4));
        }
        for start in [3, 4] {
            assert_eq!(
                replace_range(&p, start, start, vec![literal("x")])
                    .unwrap()
                    .links,
                p.links
            );
        }
        assert!(replace_range(&p, 2, 2, vec![literal("x")])
            .unwrap()
            .links
            .is_empty());
        assert!(replace_range(&p, 0, 2, vec![]).unwrap().links.is_empty());
        assert_eq!(replace_range(&p, 2, 2, vec![]).unwrap(), p);
        let before = replace_range(&p, 0, 1, vec![]).unwrap();
        assert_eq!((before.links[0].start, before.links[0].end), (0, 2));
        assert_eq!(p.units.len(), 4);
        assert_eq!(p.links.len(), 1);
        assert!(replace_range(&p, 4, 2, vec![]).is_err());
        assert!(replace_range(&p, 0, 5, vec![]).is_err());
    }
    #[test]
    fn conversion_requires_unambiguous_mappings_and_preserves_link_boundaries() {
        let source = script(10);
        let mut target = script(20);
        let p = Paragraph {
            id: id(1),
            script_id: Some(source.id.clone()),
            units: vec![
                TextUnit::Symbol {
                    character_id: source.data.characters[0].id.clone(),
                },
                literal(" "),
            ],
            links: vec![LexicalSpan {
                start: 0,
                end: 1,
                entry_id: id(2),
            }],
        };
        let converted = convert(&p, &source.data, &target, &[])
            .unwrap()
            .paragraph
            .unwrap();
        assert_eq!(converted.id, p.id);
        assert_eq!(converted.script_id, Some(target.id.clone()));
        assert_eq!(converted.links, p.links);
        let mut duplicate = target.data.characters[0].clone();
        duplicate.id = id(22);
        target.data.characters.push(duplicate);
        let ambiguous = convert(&p, &source.data, &target, &[]).unwrap();
        assert!(ambiguous.paragraph.is_none());
        assert!(ambiguous.issues[0].contains("ambiguous"));
        let overrides = [CharacterMapping {
            source_id: source.data.characters[0].id.clone(),
            target_ids: vec![id(21), id(22)],
        }];
        let expanded = convert(&p, &source.data, &target, &overrides)
            .unwrap()
            .paragraph
            .unwrap();
        assert_eq!(expanded.units.len(), 3);
        assert_eq!(expanded.links[0].end, 2);
        assert_eq!(expanded.links[0].entry_id, id(2));
        target
            .data
            .characters
            .iter_mut()
            .for_each(|c| c.transliteration.clear());
        let missing = convert(&p, &source.data, &target, &[]).unwrap();
        assert!(missing.paragraph.is_none());
        assert!(missing.issues[0].contains("missing"));
        assert!(convert(
            &p,
            &source.data,
            &target,
            &[CharacterMapping {
                source_id: id(11),
                target_ids: vec![id(999)]
            }]
        )
        .is_err());
    }
    #[test]
    fn paragraphs_reject_bad_spans_unknown_symbols_and_split_graphemes() {
        let mut p = paragraph();
        assert!(validate_paragraph(&p, &[]).is_ok());
        p.links.push(LexicalSpan {
            start: 2,
            end: 4,
            entry_id: id(3),
        });
        assert!(validate_paragraph(&p, &[]).is_err());
        p.links.pop();
        p.units[0] = literal("a\u{303}");
        assert!(validate_paragraph(&p, &[]).is_ok());
        p.units[0] = literal("ab");
        assert!(validate_paragraph(&p, &[]).is_err());
        p.units[0] = TextUnit::Symbol {
            character_id: id(11),
        };
        assert!(validate_paragraph(&p, &[]).is_err());
        p.script_id = Some(id(10));
        assert!(validate_paragraph(&p, &[script(10)]).is_ok());
        assert!(serde_json::from_str::<Paragraph>(r#"{"id":"00000000-0000-4000-8000-000000000001","scriptId":null,"units":[],"links":[],"html":"ignored?"}"#).is_err());
    }
    #[test]
    fn irregular_descriptions_require_an_entry_and_form_and_child_ids_are_unique() {
        let mut g = GrammarDraft {
            title: "Grammar".into(),
            notes: String::new(),
            features: vec![],
            examples: vec![],
            lexeme_ids: vec![],
            phoneme_ids: vec![],
            morphology: vec![MorphologyNote {
                id: id(1),
                kind: MorphologyKind::Irregular,
                label: "Plural".into(),
                description: "Authored".into(),
                entry_id: None,
                form: String::new(),
            }],
        };
        assert!(NotebookDraft::Grammar(g.clone()).validate(&[]).is_err());
        g.morphology[0].entry_id = Some(id(2));
        g.morphology[0].form = "forms".into();
        assert!(NotebookDraft::Grammar(g.clone()).validate(&[]).is_ok());
        g.features.push(GrammarFeature {
            id: id(1),
            name: "Number".into(),
            values: "one, many".into(),
            description: String::new(),
        });
        assert!(NotebookDraft::Grammar(g).validate(&[]).is_err());
    }
}
