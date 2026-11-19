//! Bounded, declarative linguistic rules. Never executes user code.
use crate::{
    lexicon::{input_error, text},
    writing::identifier,
    AppError,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use unicode_segmentation::UnicodeSegmentation;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceField {
    Lemma,
    Pronunciation,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellKind {
    Inflection,
    Derivation,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeatureValue {
    pub id: String,
    pub label: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Feature {
    pub id: String,
    pub name: String,
    pub values: Vec<FeatureValue>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphemeClass {
    pub id: String,
    pub name: String,
    pub members: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Piece {
    Literal { text: String },
    Stem,
    Slice { start: usize, end: usize },
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    Affix {
        prefix: String,
        suffix: String,
    },
    Infix {
        at: usize,
        text: String,
    },
    Template {
        pieces: Vec<Piece>,
    },
    Rewrite {
        from: String,
        to: String,
        before: Option<String>,
        after: Option<String>,
        #[serde(rename = "wordStart")]
        word_start: bool,
        #[serde(rename = "wordEnd")]
        word_end: bool,
    },
    Call {
        #[serde(rename = "ruleId")]
        rule_id: String,
    },
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub operation: Operation,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Assignment {
    pub feature_id: String,
    pub value_id: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cell {
    pub id: String,
    pub name: String,
    pub kind: CellKind,
    pub features: Vec<Assignment>,
    pub rules: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Irregular {
    pub entry_id: String,
    pub cell_id: String,
    pub output: String,
    pub reason: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClassSlot {
    pub class_id: String,
    pub min: usize,
    pub max: usize,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Phonotactic {
    pub id: String,
    pub name: String,
    pub slots: Vec<ClassSlot>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProgramDraft {
    pub version: u8,
    pub name: String,
    pub notes: String,
    pub input: SourceField,
    pub features: Vec<Feature>,
    pub classes: Vec<GraphemeClass>,
    pub rules: Vec<Rule>,
    pub cells: Vec<Cell>,
    pub overrides: Vec<Irregular>,
    pub phonotactics: Vec<Phonotactic>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Program {
    pub id: String,
    pub revision: i64,
    pub data: ProgramDraft,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Step {
    pub rule_id: String,
    pub name: String,
    pub before: String,
    pub after: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evaluation {
    pub output: String,
    pub steps: Vec<Step>,
    pub irregular_reason: Option<String>,
    pub phonotactics: Option<bool>,
    pub matching_patterns: Vec<String>,
}

fn word(value: &str, required: bool) -> Result<(), AppError> {
    text(value, 512, required, false)?;
    if value.graphemes(true).count() > 256 {
        return Err(input_error(
            "Words and rule literals are limited to 256 graphemes and 512 Unicode scalars.",
        ));
    }
    Ok(())
}
fn child(ids: &mut BTreeSet<String>, id: &str, name: &str) -> Result<(), AppError> {
    if !identifier(id) || !ids.insert(id.into()) {
        return Err(input_error(
            "Program child identities must be valid and distinct.",
        ));
    }
    text(name, 120, true, false)
}
impl ProgramDraft {
    pub fn validate(&self) -> Result<(), AppError> {
        text(&self.name, 120, true, false)?;
        text(&self.notes, 4000, false, true)?;
        if self.version != 1
            || self.features.len() > 16
            || self.classes.len() > 32
            || self.rules.len() > 64
            || self.cells.is_empty()
            || self.cells.len() > 32
            || self.overrides.len() > 128
            || self.phonotactics.len() > 16
        {
            return Err(input_error("Use automation version 1 with 1–32 cells, at most 16 features, 32 classes, 64 rules, 128 overrides and 16 phonotactic patterns."));
        }
        let mut ids = BTreeSet::new();
        for f in &self.features {
            child(&mut ids, &f.id, &f.name)?;
            if f.values.is_empty() || f.values.len() > 16 {
                return Err(input_error("Each feature needs 1–16 values."));
            }
            let mut labels = BTreeSet::new();
            for v in &f.values {
                child(&mut ids, &v.id, &v.label)?;
                if !labels.insert(&v.label) {
                    return Err(input_error(
                        "Feature value labels must be distinct within their feature.",
                    ));
                }
            }
        }
        for c in &self.classes {
            child(&mut ids, &c.id, &c.name)?;
            if c.members.is_empty()
                || c.members.len() > 64
                || c.members.iter().collect::<BTreeSet<_>>().len() != c.members.len()
            {
                return Err(input_error("Classes need 1–64 distinct graphemes."));
            }
            for m in &c.members {
                word(m, true)?;
                if m.graphemes(true).count() != 1 {
                    return Err(input_error(
                        "Each class member must be one complete Unicode grapheme.",
                    ));
                }
            }
        }
        let class_exists = |id: &str| self.classes.iter().any(|c| c.id == id);
        for r in &self.rules {
            child(&mut ids, &r.id, &r.name)?;
            match &r.operation {
                Operation::Affix { prefix, suffix } => {
                    word(prefix, false)?;
                    word(suffix, false)?;
                }
                Operation::Infix { at, text } => {
                    if *at > 256 {
                        return Err(input_error("Infix boundaries must be at most 256."));
                    }
                    word(text, true)?;
                }
                Operation::Template { pieces } => {
                    if pieces.is_empty() || pieces.len() > 16 {
                        return Err(input_error("Templates need 1–16 pieces."));
                    }
                    for p in pieces {
                        match p {
                            Piece::Literal { text } => word(text, false)?,
                            Piece::Slice { start, end } if start >= end || *end > 256 => {
                                return Err(input_error(
                                    "Template slices need ordered boundaries within 256 graphemes.",
                                ))
                            }
                            _ => {}
                        }
                    }
                }
                Operation::Rewrite {
                    from,
                    to,
                    before,
                    after,
                    ..
                } => {
                    word(from, true)?;
                    word(to, false)?;
                    if before.iter().chain(after).any(|id| !class_exists(id)) {
                        return Err(input_error(
                            "A sound-change context references a missing class.",
                        ));
                    }
                }
                Operation::Call { rule_id } => {
                    if !self.rules.iter().any(|r| r.id == *rule_id) {
                        return Err(input_error("A rule calls a missing rule."));
                    }
                }
            }
        }
        for r in &self.rules {
            self.expand(&r.id, &mut Vec::new(), &mut Vec::new())?;
        }
        let mut bundles = BTreeSet::new();
        let mut cell_names = BTreeSet::new();
        for c in &self.cells {
            child(&mut ids, &c.id, &c.name)?;
            if !cell_names.insert(&c.name) || c.features.len() > 16 || c.rules.len() > 16 {
                return Err(input_error("Cell names must be distinct; use at most 16 feature assignments and rule references per cell."));
            }
            let mut bundle = BTreeMap::new();
            for a in &c.features {
                if bundle.insert(&a.feature_id, &a.value_id).is_some()
                    || !self.features.iter().any(|f| {
                        f.id == a.feature_id && f.values.iter().any(|v| v.id == a.value_id)
                    })
                {
                    return Err(input_error(
                        "A cell has a missing feature/value or repeats a feature assignment.",
                    ));
                }
            }
            // Empty bundles are useful for named derivations; nonempty identical
            // bundles of the same kind would define an ambiguous paradigm cell.
            if !bundle.is_empty()
                && !bundles.insert((matches!(c.kind, CellKind::Derivation), bundle))
            {
                return Err(input_error(
                    "Two cells of the same kind have the same feature bundle.",
                ));
            }
            let mut expanded = Vec::new();
            for id in &c.rules {
                self.expand(id, &mut Vec::new(), &mut expanded)?;
            }
        }
        let mut irregulars = BTreeSet::new();
        for o in &self.overrides {
            if !identifier(&o.entry_id)
                || !self.cells.iter().any(|c| c.id == o.cell_id)
                || !irregulars.insert((&o.entry_id, &o.cell_id))
            {
                return Err(input_error(
                    "Overrides need one existing entry/cell pair each.",
                ));
            }
            word(&o.output, true)?;
            text(&o.reason, 1000, true, true)?;
        }
        for p in &self.phonotactics {
            child(&mut ids, &p.id, &p.name)?;
            if p.slots.is_empty()
                || p.slots.len() > 16
                || p.slots
                    .iter()
                    .any(|s| !class_exists(&s.class_id) || s.min > s.max || s.max == 0 || s.max > 8)
            {
                return Err(input_error("Phonotactic patterns need 1–16 existing class slots with repetition bounds from 0 to 8 and a positive maximum."));
            }
        }
        Ok(())
    }
    fn expand<'a>(
        &'a self,
        id: &str,
        stack: &mut Vec<String>,
        out: &mut Vec<&'a Rule>,
    ) -> Result<(), AppError> {
        if stack.iter().any(|s| s == id) {
            return Err(input_error(
                "The rule dependency graph contains a cycle. Remove the circular call.",
            ));
        }
        if stack.len() >= 16 || out.len() >= 64 {
            return Err(input_error(
                "Rule expansion exceeds 16 nested calls or 64 operations per cell.",
            ));
        }
        let r = self
            .rules
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| input_error("A cell or call references a missing rule."))?;
        if let Operation::Call { rule_id } = &r.operation {
            stack.push(id.into());
            self.expand(rule_id, stack, out)?;
            stack.pop();
        } else {
            out.push(r);
        }
        Ok(())
    }
    fn member(&self, id: &str, value: &str) -> bool {
        self.classes
            .iter()
            .find(|c| c.id == id)
            .is_some_and(|c| c.members.iter().any(|m| m == value))
    }
    pub fn evaluate(
        &self,
        entry_id: &str,
        cell_id: &str,
        input: &str,
    ) -> Result<Evaluation, AppError> {
        self.validate()?;
        word(input, true)?;
        if !identifier(entry_id) {
            return Err(input_error("Choose a source entry with a valid identity."));
        }
        let cell = self
            .cells
            .iter()
            .find(|c| c.id == cell_id)
            .ok_or_else(|| input_error("Choose an existing paradigm cell."))?;
        let mut output = input.to_owned();
        let mut steps = Vec::new();
        let mut irregular_reason = None;
        if let Some(o) = self
            .overrides
            .iter()
            .find(|o| o.entry_id == entry_id && o.cell_id == cell_id)
        {
            output = o.output.clone();
            irregular_reason = Some(o.reason.clone());
        } else {
            let mut rules = Vec::new();
            for id in &cell.rules {
                self.expand(id, &mut Vec::new(), &mut rules)?;
            }
            for r in rules {
                let before = output.clone();
                let units: Vec<&str> = before.graphemes(true).collect();
                output = match &r.operation {
                    Operation::Affix { prefix, suffix } => format!("{prefix}{before}{suffix}"),
                    Operation::Infix { at, text } => {
                        if *at > units.len() {
                            return Err(input_error(
                                "An infix boundary is outside this input word.",
                            ));
                        }
                        format!("{}{}{}", units[..*at].concat(), text, units[*at..].concat())
                    }
                    Operation::Template { pieces } => {
                        let mut result = String::new();
                        for p in pieces {
                            match p {
                                Piece::Literal { text } => result.push_str(text),
                                Piece::Stem => result.push_str(&before),
                                Piece::Slice { start, end } => {
                                    if *end > units.len() {
                                        return Err(input_error(
                                            "A template slice is outside this input word.",
                                        ));
                                    }
                                    result.push_str(&units[*start..*end].concat());
                                }
                            }
                        }
                        result
                    }
                    Operation::Rewrite {
                        from,
                        to,
                        before: left,
                        after: right,
                        word_start,
                        word_end,
                    } => {
                        let pattern: Vec<&str> = from.graphemes(true).collect();
                        let mut result = String::new();
                        let mut i = 0;
                        while i < units.len() {
                            let end = i + pattern.len();
                            if end <= units.len()
                                && units[i..end] == pattern[..]
                                && (!*word_start || i == 0)
                                && (!*word_end || end == units.len())
                                && left
                                    .as_ref()
                                    .is_none_or(|id| i > 0 && self.member(id, units[i - 1]))
                                && right.as_ref().is_none_or(|id| {
                                    end < units.len() && self.member(id, units[end])
                                })
                            {
                                result.push_str(to);
                                i = end;
                            } else {
                                result.push_str(units[i]);
                                i += 1;
                            }
                        }
                        result
                    }
                    Operation::Call { .. } => {
                        return Err(input_error("An unexpanded rule call cannot be evaluated."))
                    }
                };
                word(&output, false)?;
                steps.push(Step {
                    rule_id: r.id.clone(),
                    name: r.name.clone(),
                    before,
                    after: output.clone(),
                });
            }
        }
        word(&output, true)?;
        let units: Vec<&str> = output.graphemes(true).collect();
        let mut matching_patterns = Vec::new();
        for p in &self.phonotactics {
            let mut positions = BTreeSet::from([0usize]);
            for slot in &p.slots {
                let mut next = BTreeSet::new();
                for pos in positions {
                    if slot.min == 0 {
                        next.insert(pos);
                    }
                    for count in 1..=slot.max {
                        let index = pos + count - 1;
                        if index >= units.len() || !self.member(&slot.class_id, units[index]) {
                            break;
                        }
                        if count >= slot.min {
                            next.insert(pos + count);
                        }
                    }
                }
                positions = next;
            }
            if positions.contains(&units.len()) {
                matching_patterns.push(p.id.clone());
            }
        }
        Ok(Evaluation {
            output,
            steps,
            irregular_reason,
            phonotactics: (!self.phonotactics.is_empty()).then_some(!matching_patterns.is_empty()),
            matching_patterns,
        })
    }
}
