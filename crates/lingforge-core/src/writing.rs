//! Experimental alphabet model. IDs, never glyphs or PUA values, identify symbols.
use crate::{
    glyph::GlyphOutline,
    lexicon::{input_error, text},
    AppError,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use unicode_segmentation::UnicodeSegmentation;

pub const MAX_UNITS: usize = 4096;
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GlyphVariant {
    pub id: String,
    pub name: String,
    pub outline: GlyphOutline,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub transliteration: String,
    pub phoneme_ids: Vec<String>,
    pub glyphs: Vec<GlyphVariant>,
    pub default_glyph_id: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputMapping {
    pub id: String,
    pub input: String,
    pub character_ids: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TextUnit {
    Symbol {
        #[serde(rename = "characterId")]
        character_id: String,
    },
    Text {
        text: String,
    },
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptDraft {
    pub name: String,
    pub notes: String,
    pub characters: Vec<Character>,
    pub mappings: Vec<InputMapping>,
    pub sample: Vec<TextUnit>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WritingSystem {
    pub id: String,
    pub revision: i64,
    pub data: ScriptDraft,
}

// UUID syntax without introducing a UUID dependency into the domain crate.
pub fn identifier(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        })
}
impl ScriptDraft {
    pub fn validate(&self) -> Result<(), AppError> {
        text(&self.name, 120, true, false)?;
        text(&self.notes, 10_000, false, true)?;
        if self.characters.len() > 256 || self.mappings.len() > 512 {
            return Err(input_error(
                "Use at most 256 characters and 512 input mappings in this experiment.",
            ));
        }
        let mut ids = HashSet::new();
        let mut add_id = |id: &str| -> Result<(), AppError> {
            if !identifier(id) || !ids.insert(id.to_owned()) {
                return Err(input_error(
                    "Writing-system child identifiers must be valid and distinct.",
                ));
            }
            Ok(())
        };
        for character in &self.characters {
            add_id(&character.id)?;
            text(&character.name, 120, true, false)?;
            text(&character.transliteration, 128, false, false)?;
            if character.phoneme_ids.len() > 32
                || character.phoneme_ids.iter().any(|id| !identifier(id))
                || character.phoneme_ids.iter().collect::<HashSet<_>>().len()
                    != character.phoneme_ids.len()
                || character.glyphs.len() > 8
            {
                return Err(input_error(
                    "Use at most 32 distinct phoneme links and eight glyph variants per character.",
                ));
            }
            for glyph in &character.glyphs {
                add_id(&glyph.id)?;
                text(&glyph.name, 120, true, false)?;
                glyph.outline.validate()?;
            }
            if character
                .default_glyph_id
                .as_ref()
                .is_some_and(|id| !character.glyphs.iter().any(|glyph| &glyph.id == id))
            {
                return Err(input_error(
                    "The default glyph must belong to its character.",
                ));
            }
        }
        let characters: HashSet<_> = self.characters.iter().map(|c| c.id.as_str()).collect();
        for mapping in &self.mappings {
            add_id(&mapping.id)?;
            text(&mapping.input, 32, true, false)?;
            if mapping.input.chars().any(char::is_whitespace)
                || mapping.character_ids.is_empty()
                || mapping.character_ids.len() > 16
                || mapping
                    .character_ids
                    .iter()
                    .any(|id| !characters.contains(id.as_str()))
            {
                return Err(input_error("Mappings need a non-whitespace input and 1–16 existing characters. Remove mapping references before deleting a character."));
            }
        }
        validate_units(&self.sample, &characters)
    }
}
pub fn validate_units(units: &[TextUnit], characters: &HashSet<&str>) -> Result<(), AppError> {
    if units.len() > MAX_UNITS {
        return Err(input_error(
            "The experimental text is limited to 4,096 units.",
        ));
    }
    for unit in units {
        match unit {
            TextUnit::Symbol { character_id } if !characters.contains(character_id.as_str()) => return Err(input_error("Text references a missing character. Remove or replace its occurrences before deleting it.")),
            TextUnit::Text { text: value } => {
                text(value, 128, false, true)?;
                if value.graphemes(true).count() != 1 { return Err(input_error("Literal units must contain one complete Unicode grapheme.")); }
            },
            _ => {},
        }
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPreview {
    pub units: Vec<TextUnit>,
    pub pending: String,
    pub issues: Vec<String>,
}

/// Streaming preview; explicit commit releases a trailing exact prefix.
/// Longest match wins. Equal input with different outputs is an error.
pub fn map_input(
    script: &ScriptDraft,
    input: &str,
    commit: bool,
    literal: bool,
) -> Result<InputPreview, AppError> {
    script.validate()?;
    if input.len() > 16 * 1024 {
        return Err(input_error("Input is limited to 16 KiB per insertion."));
    }
    text(input, 4096, false, true)?;
    let mut result = InputPreview {
        units: Vec::new(),
        pending: String::new(),
        issues: Vec::new(),
    };
    let mut remaining = input;
    while !remaining.is_empty() {
        let next = remaining
            .graphemes(true)
            .next()
            .ok_or_else(|| input_error("Invalid input."))?;
        if literal || next.chars().all(char::is_whitespace) {
            result.units.push(TextUnit::Text { text: next.into() });
            remaining = &remaining[next.len()..];
            continue;
        }
        if !commit
            && script
                .mappings
                .iter()
                .any(|m| m.input.starts_with(remaining) && m.input != remaining)
        {
            result.pending = remaining.into();
            break;
        }
        let matching: Vec<_> = script
            .mappings
            .iter()
            .filter(|m| remaining.starts_with(&m.input))
            .collect();
        let longest = matching.iter().map(|m| m.input.len()).max();
        if let Some(length) = longest {
            let candidates: Vec<_> = matching
                .into_iter()
                .filter(|m| m.input.len() == length)
                .collect();
            let selected = candidates[0];
            if candidates
                .iter()
                .any(|m| m.character_ids != selected.character_ids)
            {
                result.issues.push(format!("Input ‘{}’ has multiple outputs. Choose a character explicitly or revise the mappings.", selected.input));
                result.pending = remaining.into();
                break;
            }
            result
                .units
                .extend(selected.character_ids.iter().map(|id| TextUnit::Symbol {
                    character_id: id.clone(),
                }));
            remaining = &remaining[length..];
        } else {
            result.issues.push(format!(
                "No mapping for ‘{next}’. Use literal input to retain Unicode text."
            ));
            result.pending = remaining.into();
            break;
        }
        if result.units.len() > MAX_UNITS {
            return Err(input_error("The mapped insertion exceeds 4,096 units."));
        }
    }
    let characters = script.characters.iter().map(|c| c.id.as_str()).collect();
    validate_units(&result.units, &characters)?;
    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct Transliteration {
    pub text: String,
    pub issues: Vec<String>,
}
pub fn transliterate(
    script: &ScriptDraft,
    units: &[TextUnit],
) -> Result<Transliteration, AppError> {
    script.validate()?;
    let characters: HashMap<_, _> = script
        .characters
        .iter()
        .map(|c| (c.id.as_str(), c))
        .collect();
    validate_units(units, &characters.keys().copied().collect())?;
    let mut result = Transliteration {
        text: String::new(),
        issues: Vec::new(),
    };
    for (position, unit) in units.iter().enumerate() {
        match unit {
            TextUnit::Text { text } => result.text.push_str(text),
            TextUnit::Symbol { character_id } => {
                let character = characters[character_id.as_str()];
                if character.transliteration.is_empty() {
                    result.issues.push(format!(
                        "Unit {}: ‘{}’ has no transliteration.",
                        position + 1,
                        character.name
                    ));
                } else {
                    result.text.push_str(&character.transliteration);
                }
            }
        }
    }
    // Prevent an incomplete conversion from appearing to be usable output.
    if !result.issues.is_empty() {
        result.text.clear();
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn id(n: usize) -> String {
        format!("00000000-0000-4000-8000-{n:012}")
    }
    fn fixture() -> ScriptDraft {
        ScriptDraft {
            name: "Test alphabet".into(),
            characters: vec![
                Character {
                    id: id(1),
                    name: "First".into(),
                    transliteration: "t".into(),
                    phoneme_ids: Vec::new(),
                    glyphs: Vec::new(),
                    default_glyph_id: None,
                },
                Character {
                    id: id(2),
                    name: "Second".into(),
                    transliteration: "th".into(),
                    phoneme_ids: Vec::new(),
                    glyphs: Vec::new(),
                    default_glyph_id: None,
                },
            ],
            mappings: vec![
                InputMapping {
                    id: id(3),
                    input: "t".into(),
                    character_ids: vec![id(1)],
                },
                InputMapping {
                    id: id(4),
                    input: "th".into(),
                    character_ids: vec![id(2)],
                },
            ],
            ..Default::default()
        }
    }
    #[test]
    fn prefix_commit_delimiters_and_longest_match_are_explicit() {
        let script = fixture();
        let preview = map_input(&script, "t", false, false).unwrap();
        assert!(preview.units.is_empty());
        assert_eq!(preview.pending, "t");
        assert_eq!(
            map_input(&script, "t", true, false).unwrap().units,
            vec![TextUnit::Symbol {
                character_id: id(1)
            }]
        );
        let resolved = map_input(&script, "th t ", false, false).unwrap();
        assert!(resolved.pending.is_empty());
        assert!(resolved.issues.is_empty());
        assert_eq!(
            transliterate(&script, &resolved.units).unwrap().text,
            "th t "
        );
        let unknown = map_input(&script, "tz", true, false).unwrap();
        assert!(!unknown.issues.is_empty());
        assert_eq!(unknown.pending, "z");
    }
    #[test]
    fn aliases_sequences_and_ambiguity_never_depend_on_labels() {
        let mut script = fixture();
        script.characters[0].name = "Renamed without changing identity".into();
        script.mappings.push(InputMapping {
            id: id(5),
            input: "x".into(),
            character_ids: vec![id(1), id(2)],
        });
        script.mappings.push(InputMapping {
            id: id(6),
            input: "a".into(),
            character_ids: vec![id(1)],
        });
        let result = map_input(&script, "xa", true, false).unwrap();
        assert_eq!(result.units.len(), 3);
        assert_eq!(transliterate(&script, &result.units).unwrap().text, "ttht");
        script.mappings.push(InputMapping {
            id: id(7),
            input: "x".into(),
            character_ids: vec![id(2)],
        });
        let ambiguous = map_input(&script, "x", true, false).unwrap();
        assert!(ambiguous.units.is_empty());
        assert_eq!(ambiguous.issues.len(), 1);
    }
    #[test]
    fn literal_graphemes_and_missing_transliteration_are_preserved_or_reported() {
        let mut script = fixture();
        let result = map_input(&script, "a\u{303} 👩‍🔬", true, true).unwrap();
        assert_eq!(result.units.len(), 3);
        assert_eq!(
            transliterate(&script, &result.units).unwrap().text,
            "a\u{303} 👩‍🔬"
        );
        script.characters[0].transliteration.clear();
        let conversion = transliterate(
            &script,
            &[
                TextUnit::Text { text: "x".into() },
                TextUnit::Symbol {
                    character_id: id(1),
                },
            ],
        )
        .unwrap();
        assert!(conversion.text.is_empty());
        assert_eq!(conversion.issues.len(), 1);
        assert!(map_input(&script, "\0", true, true).is_err());
    }
    #[test]
    fn removing_referenced_characters_and_invalid_units_is_rejected() {
        let mut script = fixture();
        script.sample = vec![TextUnit::Symbol {
            character_id: id(1),
        }];
        script.characters.remove(0);
        assert!(script.validate().is_err());
        script.mappings.clear();
        assert!(script.validate().is_err());
        script.sample = vec![TextUnit::Text { text: "ab".into() }];
        assert!(script.validate().is_err());
        script.sample = vec![TextUnit::Text { text: " ".into() }; MAX_UNITS + 1];
        assert!(script.validate().is_err());
        assert!(serde_json::from_str::<TextUnit>(r#"{"kind":"symbol","characterId":"00000000-0000-4000-8000-000000000001","glyph":"wrong identity"}"#).is_err());
    }
}
