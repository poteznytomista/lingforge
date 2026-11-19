//! Experimental export metadata. Character/variant UUIDs remain authoritative.
use crate::{
    lexicon::input_error,
    writing::{identifier, ScriptDraft},
    AppError,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_FONT_GLYPHS: usize = 512;
pub const MAX_FONT_RULES: usize = 128;
pub const MAX_FONT_SAMPLE: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Embedding {
    Restricted,
    PreviewPrint,
    Editable,
    Installable,
}
impl Embedding {
    pub fn bits(self) -> u16 {
        match self {
            Self::Restricted => 2,
            Self::PreviewPrint => 4,
            Self::Editable => 8,
            Self::Installable => 0,
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunDirection {
    Ltr,
    Rtl,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FontMetrics {
    pub units_per_em: u16,
    pub ascender: i16,
    pub descender: i16,
    pub line_gap: i16,
    /// Shared source coordinate system, independent of SVG viewport framing.
    pub source_em: u16,
    pub source_baseline: i16,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FontGlyph {
    pub character_id: String,
    pub variant_id: String,
    /// A scalar export mapping; null denotes an unencoded alternate.
    pub codepoint: Option<u32>,
    pub advance: u16,
    pub mark: bool,
    /// Font units, y up: attachment on a base, or origin on a mark.
    pub anchor: Option<[i16; 2]>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContextRule {
    pub before: Vec<String>,
    pub input: String,
    pub after: Vec<String>,
    pub output: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LigatureRule {
    pub input: Vec<String>,
    pub output: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FontDraft {
    pub family: String,
    pub copyright: String,
    pub license: String,
    pub embedding: Embedding,
    pub metrics: FontMetrics,
    pub glyphs: Vec<FontGlyph>,
    pub contexts: Vec<ContextRule>,
    pub ligatures: Vec<LigatureRule>,
    /// Stable character identities, never PUA/glyph numbers.
    pub sample: Vec<String>,
    pub direction: RunDirection,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FontProfile {
    pub script_id: String,
    pub revision: i64,
    pub data: FontDraft,
}

fn text(value: &str, limit: usize) -> bool {
    value.chars().count() <= limit
        && !value
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
}
pub fn export_scalar(value: u32) -> bool {
    char::from_u32(value).is_some_and(|c| !c.is_control() && !c.is_whitespace())
        && !(0xfdd0..=0xfdef).contains(&value)
        && value & 0xffff < 0xfffe
        && !matches!(value, 0x061c | 0x200b..=0x200f | 0x202a..=0x202e | 0x2060..=0x206f | 0xfeff)
        && !(0xfe00..=0xfe0f).contains(&value)
        && !(0xe0000..=0xe0fff).contains(&value)
}
impl FontDraft {
    /// A reviewable starting draft: PUA values assigned explicitly by this action.
    pub fn from_script(script: &ScriptDraft) -> Self {
        let glyphs = script
            .characters
            .iter()
            .enumerate()
            .filter_map(|(i, c)| {
                let variant = c
                    .glyphs
                    .iter()
                    .find(|v| Some(&v.id) == c.default_glyph_id.as_ref())
                    .or_else(|| c.glyphs.first())?;
                Some(FontGlyph {
                    character_id: c.id.clone(),
                    variant_id: variant.id.clone(),
                    codepoint: Some(0xe000 + i as u32),
                    advance: 1000,
                    mark: false,
                    anchor: None,
                })
            })
            .collect();
        Self {
            family: script.name.chars().take(63).collect(),
            copyright: String::new(),
            license: String::new(),
            embedding: Embedding::Restricted,
            metrics: FontMetrics {
                units_per_em: 1000,
                ascender: 800,
                descender: -200,
                line_gap: 0,
                source_em: 1000,
                source_baseline: 800,
            },
            glyphs,
            contexts: vec![],
            ligatures: vec![],
            sample: vec![],
            direction: RunDirection::Ltr,
        }
    }
    pub fn validate(&self, script: &ScriptDraft) -> Result<(), AppError> {
        script.validate()?;
        if self.family.trim().is_empty()
            || !text(&self.family, 63)
            || self.family.chars().any(char::is_control)
            || !text(&self.copyright, 2048)
            || !text(&self.license, 8192)
        {
            return Err(input_error(
                "Enter a font family (1–63 characters) and bounded copyright/license text.",
            ));
        }
        let m = &self.metrics;
        if !(16..=16384).contains(&m.units_per_em)
            || !(16..=16384).contains(&m.source_em)
            || m.ascender <= 0
            || m.descender > 0
            || m.line_gap < 0
            || i32::from(m.ascender) - i32::from(m.descender) + i32::from(m.line_gap) > 32767
        {
            return Err(input_error("Use positive em sizes (16–16384), a positive ascender, nonpositive descender and nonnegative line gap within 32767 units."));
        }
        if self.glyphs.is_empty()
            || self.glyphs.len() > MAX_FONT_GLYPHS
            || self.contexts.len() > MAX_FONT_RULES
            || self.ligatures.len() > MAX_FONT_RULES
            || self.sample.len() > MAX_FONT_SAMPLE
        {
            return Err(input_error("A font profile needs 1–512 glyphs, at most 128 rules of each kind and 256 sample characters."));
        }
        let mut ids = BTreeMap::new();
        let mut scalars = BTreeSet::new();
        let mut encoded = BTreeSet::new();
        for g in &self.glyphs {
            if !identifier(&g.character_id)
                || !identifier(&g.variant_id)
                || ids.insert(g.variant_id.as_str(), g).is_some()
                || !script.characters.iter().any(|c| {
                    c.id == g.character_id && c.glyphs.iter().any(|v| v.id == g.variant_id)
                })
            {
                return Err(input_error("Every font glyph must reference a distinct existing variant of its character. Remove font references before removing characters or variants."));
            }
            if g.advance > 32767 || (g.mark && (g.advance != 0 || g.anchor.is_none())) {
                return Err(input_error("Advances must be at most 32767; marks need zero advance and an attachment anchor."));
            }
            if let Some(cp) = g.codepoint {
                if !export_scalar(cp)
                    || !scalars.insert(cp)
                    || !encoded.insert(g.character_id.as_str())
                {
                    return Err(input_error("Use unique printable Unicode scalars, with at most one encoded variant per character. Controls, whitespace, selectors and noncharacters are reserved."));
                }
            }
        }
        if encoded.is_empty() {
            return Err(input_error(
                "At least one character needs a Unicode mapping.",
            ));
        }
        if self.glyphs.iter().any(|g| g.mark)
            && !self.glyphs.iter().any(|g| !g.mark && g.anchor.is_some())
        {
            return Err(input_error(
                "Mark positioning needs at least one base attachment anchor in this font.",
            ));
        }
        let base = |id: &str| ids.get(id).is_some_and(|g| !g.mark);
        let mut contexts = BTreeSet::new();
        for r in &self.contexts {
            if r.before.len() > 4
                || r.after.len() > 4
                || (r.before.is_empty() && r.after.is_empty())
                || !base(&r.input)
                || !base(&r.output)
                || r.input == r.output
                || r.before.iter().chain(&r.after).any(|id| !base(id))
                || !contexts.insert((&r.before, &r.input, &r.after))
            {
                return Err(input_error("Context rules need existing non-mark variants, one to eight neighbors (at most four on each side), a changed output and a unique context."));
            }
        }
        let mut ligatures = BTreeSet::new();
        let mut outputs = BTreeSet::new();
        for r in &self.ligatures {
            if !(2..=8).contains(&r.input.len())
                || r.input.iter().any(|id| !base(id))
                || !base(&r.output)
                || !ligatures.insert(&r.input)
                || !outputs.insert(&r.output)
            {
                return Err(input_error("Ligatures need 2–8 non-mark input variants and a distinct existing output per rule. Duplicate inputs are ambiguous."));
            }
            // Mark-to-ligature component attachment needs a separate model.
            if ids[r.output.as_str()].anchor.is_some() {
                return Err(input_error("Ligature outputs cannot have base anchors in this experiment; component attachment is not implemented."));
            }
        }
        if self.sample.iter().any(|id| !encoded.contains(id.as_str())) {
            return Err(input_error(
                "Every sample character needs a Unicode mapping in this font profile.",
            ));
        }
        Ok(())
    }
}
