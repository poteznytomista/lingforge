use crate::{
    lexicon::{input_error, text},
    AppError,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhonemeKind {
    Consonant,
    Vowel,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PronunciationSegment {
    Phoneme {
        #[serde(rename = "phonemeId")]
        phoneme_id: String,
        annotation: String,
    },
    Text {
        text: String,
    },
}
impl PronunciationSegment {
    pub fn phoneme_id(&self) -> Option<&str> {
        match self {
            Self::Phoneme { phoneme_id, .. } => Some(phoneme_id),
            Self::Text { .. } => None,
        }
    }
    pub fn text(&self) -> &str {
        match self {
            Self::Phoneme { annotation, .. } => annotation,
            Self::Text { text } => text,
        }
    }
}
pub fn validate_segments(segments: &[PronunciationSegment]) -> Result<(), AppError> {
    if segments.len() > 256 {
        return Err(input_error(
            "A pronunciation can contain at most 256 segments.",
        ));
    }
    for segment in segments {
        text(segment.text(), 256, false, false)?;
        match segment {
            PronunciationSegment::Phoneme { phoneme_id, .. } if phoneme_id.len() != 36 => {
                return Err(input_error(
                    "Select an existing phoneme for every linked segment.",
                ))
            }
            PronunciationSegment::Text { text } if text.is_empty() => {
                return Err(input_error(
                    "A literal pronunciation segment cannot be empty.",
                ))
            }
            _ => {}
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Articulation {
    pub place: String,
    pub manner: String,
    pub voicing: String,
    pub height: String,
    pub backness: String,
    pub rounding: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomFeature {
    pub name: String,
    pub value: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Allophone {
    pub id: Option<String>,
    pub label: String,
    pub environment: String,
    pub notes: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhonemeDraft {
    pub label: String,
    pub kind: PhonemeKind,
    pub articulation: Articulation,
    pub features: Vec<CustomFeature>,
    pub allophones: Vec<Allophone>,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Phoneme {
    pub id: String,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub data: PhonemeDraft,
}

impl PhonemeDraft {
    pub fn validate(&self) -> Result<(), AppError> {
        text(&self.label, 64, true, false)?;
        for value in [
            &self.articulation.place,
            &self.articulation.manner,
            &self.articulation.voicing,
            &self.articulation.height,
            &self.articulation.backness,
            &self.articulation.rounding,
        ] {
            text(value, 80, false, false)?;
        }
        text(&self.notes, 10_000, false, true)?;
        if self.features.len() > 32 || self.allophones.len() > 64 {
            return Err(input_error(
                "Use at most 32 custom features and 64 allophone descriptions per phoneme.",
            ));
        }
        let mut names = HashSet::new();
        for feature in &self.features {
            text(&feature.name, 80, true, false)?;
            text(&feature.value, 256, true, false)?;
            if !names.insert(feature.name.trim()) {
                return Err(input_error(
                    "Custom feature names must be distinct within a phoneme.",
                ));
            }
        }
        let mut ids = HashSet::new();
        for allophone in &self.allophones {
            text(&allophone.label, 128, true, false)?;
            text(&allophone.environment, 2000, false, true)?;
            text(&allophone.notes, 4000, false, true)?;
            if let Some(id) = &allophone.id {
                if !ids.insert(id) {
                    return Err(input_error(
                        "Allophone identifiers must be distinct within a phoneme.",
                    ));
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyllablePattern {
    pub id: Option<String>,
    pub label: String,
    pub onset: String,
    pub nucleus: String,
    pub coda: String,
    pub notes: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhonotacticRule {
    pub id: Option<String>,
    pub label: String,
    pub description: String,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhonologyDraft {
    pub notes: String,
    pub patterns: Vec<SyllablePattern>,
    pub rules: Vec<PhonotacticRule>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhonologyProfile {
    pub revision: i64,
    pub data: PhonologyDraft,
}
impl PhonologyDraft {
    pub fn validate(&self) -> Result<(), AppError> {
        text(&self.notes, 20_000, false, true)?;
        if self.patterns.len() > 128 || self.rules.len() > 128 {
            return Err(input_error(
                "Use at most 128 syllable patterns and 128 phonotactic descriptions.",
            ));
        }
        let mut ids = HashSet::new();
        for pattern in &self.patterns {
            text(&pattern.label, 120, true, false)?;
            for value in [&pattern.onset, &pattern.nucleus, &pattern.coda] {
                text(value, 256, false, false)?;
            }
            text(&pattern.notes, 4000, false, true)?;
            if let Some(id) = &pattern.id {
                if !ids.insert(id) {
                    return Err(input_error(
                        "Phonology description identifiers must be distinct.",
                    ));
                }
            }
        }
        for rule in &self.rules {
            text(&rule.label, 120, true, false)?;
            text(&rule.description, 4000, true, true)?;
            if let Some(id) = &rule.id {
                if !ids.insert(id) {
                    return Err(input_error(
                        "Phonology description identifiers must be distinct.",
                    ));
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn literal_boundaries_are_preserved_but_empty_and_overlong_sequences_fail() {
        assert!(validate_segments(&[PronunciationSegment::Text { text: " ".into() }]).is_ok());
        assert!(validate_segments(&[PronunciationSegment::Text {
            text: String::new()
        }])
        .is_err());
        assert!(validate_segments(&[PronunciationSegment::Text { text: "\0".into() }]).is_err());
        assert!(validate_segments(&vec![
            PronunciationSegment::Text { text: "ã".into() };
            257
        ])
        .is_err());
        let malformed = r#"{"kind":"phoneme","phonemeId":"00000000-0000-4000-8000-000000000001","annotation":"","unknown":true}"#;
        assert!(serde_json::from_str::<PronunciationSegment>(malformed).is_err());
    }
}
