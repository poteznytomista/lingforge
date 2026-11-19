use crate::{AppError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Lexeme,
    Root,
}
impl EntryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lexeme => "lexeme",
            Self::Root => "root",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sense {
    pub id: Option<String>,
    pub definition: String,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LexicalForm {
    pub id: Option<String>,
    pub text: String,
    pub label: String,
    pub pronunciation: String,
    #[serde(default)]
    pub pronunciation_segments: Vec<crate::phonology::PronunciationSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Relation {
    pub target_id: String,
    pub relation_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LexemeDraft {
    pub lemma: String,
    pub pronunciation: String,
    #[serde(default)]
    pub pronunciation_segments: Vec<crate::phonology::PronunciationSegment>,
    pub part_of_speech: String,
    pub kind: EntryKind,
    pub root_id: Option<String>,
    pub etymology: String,
    pub notes: String,
    pub senses: Vec<Sense>,
    pub forms: Vec<LexicalForm>,
    pub relations: Vec<Relation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Lexeme {
    pub id: String,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub data: LexemeDraft,
}

pub fn input_error(message: &str) -> AppError {
    AppError::new(ErrorCode::InvalidInput, message)
}

pub(crate) fn text(
    value: &str,
    maximum: usize,
    required: bool,
    multiline: bool,
) -> Result<(), AppError> {
    if value.chars().count() > maximum
        || (required && value.trim().is_empty())
        || value
            .chars()
            .any(|c| c.is_control() && !(multiline && matches!(c, '\n' | '\r' | '\t')))
    {
        return Err(input_error(
            "A field is empty, too long, or contains unsupported control characters.",
        ));
    }
    Ok(())
}

impl LexemeDraft {
    pub fn validate(&self) -> Result<(), AppError> {
        text(&self.lemma, 256, true, false)?;
        text(&self.pronunciation, 512, false, false)?;
        crate::phonology::validate_segments(&self.pronunciation_segments)?;
        text(&self.part_of_speech, 120, false, false)?;
        text(&self.etymology, 10_000, false, true)?;
        text(&self.notes, 20_000, false, true)?;
        if self.kind == EntryKind::Root && self.root_id.is_some() {
            return Err(input_error(
                "A root cannot have a root parent. Use a named relationship for other connections.",
            ));
        }
        if self.senses.is_empty()
            || self.senses.len() > 64
            || self.forms.len() > 128
            || self.relations.len() > 128
        {
            return Err(input_error(
                "Provide 1–64 senses, at most 128 forms, and at most 128 relationships.",
            ));
        }
        let mut ids = HashSet::new();
        for sense in &self.senses {
            text(&sense.definition, 4000, true, true)?;
            text(&sense.notes, 4000, false, true)?;
            if let Some(id) = &sense.id {
                if !ids.insert(id) {
                    return Err(input_error(
                        "Sense/form identifiers must be distinct within an entry.",
                    ));
                }
            }
        }
        for form in &self.forms {
            text(&form.text, 256, true, false)?;
            text(&form.label, 120, true, false)?;
            text(&form.pronunciation, 512, false, false)?;
            crate::phonology::validate_segments(&form.pronunciation_segments)?;
            if let Some(id) = &form.id {
                if !ids.insert(id) {
                    return Err(input_error(
                        "Sense/form identifiers must be distinct within an entry.",
                    ));
                }
            }
        }
        let mut links = HashSet::new();
        for relation in &self.relations {
            text(&relation.relation_type, 120, true, false)?;
            if !links.insert((&relation.target_id, &relation.relation_type)) {
                return Err(input_error(
                    "The same relationship is listed more than once.",
                ));
            }
        }
        Ok(())
    }
}

/// Derived keys only. Never rewrite original linguistic content. Unicode
/// lowercase is locale-independent, not a complete case-folding implementation.
pub fn search_key(text: &str, ignore_marks: bool) -> String {
    let lowered = text
        .chars()
        .flat_map(char::to_lowercase)
        .collect::<String>();
    if ignore_marks {
        lowered
            .nfd()
            .filter(|c| !is_combining_mark(*c))
            .collect::<String>()
            .nfc()
            .collect()
    } else {
        lowered.nfc().collect()
    }
}

pub fn searchable_text(data: &LexemeDraft) -> String {
    let mut parts = vec![
        data.lemma.as_str(),
        data.pronunciation.as_str(),
        data.part_of_speech.as_str(),
        data.notes.as_str(),
        data.etymology.as_str(),
    ];
    for sense in &data.senses {
        parts.extend([sense.definition.as_str(), sense.notes.as_str()]);
    }
    for form in &data.forms {
        parts.extend([
            form.text.as_str(),
            form.label.as_str(),
            form.pronunciation.as_str(),
        ]);
    }
    for segment in data.pronunciation_segments.iter().chain(
        data.forms
            .iter()
            .flat_map(|form| &form.pronunciation_segments),
    ) {
        let value = segment.text();
        if !value.is_empty() {
            parts.push(value);
        }
    }
    parts.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_is_canonically_equivalent_without_destroying_diacritics() {
        assert_eq!(search_key("A\u{301}", false), search_key("Á", false));
        assert_ne!(search_key("á", false), search_key("a", false));
        assert_eq!(search_key("a\u{301}", true), "a");
        assert_ne!(search_key("θ", true), search_key("t", true));
    }
}
