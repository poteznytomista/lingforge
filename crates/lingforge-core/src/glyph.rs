//! Deliberately small SVG import language. Original markup never reaches a webview.
use crate::{
    glyph_edit::{CommandKind, PathCommand},
    lexicon::input_error,
    AppError,
};
use serde::{Deserialize, Serialize};

pub const MAX_SVG_BYTES: usize = 64 * 1024;
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GlyphOutline {
    pub view_box: [f64; 4],
    pub paths: Vec<String>,
}

impl GlyphOutline {
    pub fn validate(&self) -> Result<(), AppError> {
        if self
            .view_box
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 100_000.0)
            || self.view_box[2] <= 0.0
            || self.view_box[3] <= 0.0
            || self.paths.is_empty()
            || self.paths.len() > 32
            || self.paths.iter().map(String::len).sum::<usize>() > MAX_SVG_BYTES
        {
            return Err(input_error(
                "Use a finite, positive viewBox and 1–32 outline paths within 64 KiB.",
            ));
        }
        for path in &self.paths {
            parse_path(path)?;
        }
        Ok(())
    }
}

pub(crate) fn parse_path(path: &str) -> Result<Vec<PathCommand>, AppError> {
    let fail = || {
        input_error("Outline paths support explicit absolute M, L, Q, C and Z commands with space/comma-separated finite numbers. Convert shapes, relative commands and transforms before import.")
    };
    if path.is_empty() || !path.is_ascii() {
        return Err(fail());
    }
    let mut spaced = String::with_capacity(path.len());
    for c in path.chars() {
        if matches!(c, 'M' | 'L' | 'Q' | 'C' | 'Z') {
            spaced.push(' ');
            spaced.push(c);
            spaced.push(' ');
        } else if c.is_ascii_digit() || matches!(c, '+' | '-' | '.' | 'e' | 'E') {
            spaced.push(c);
        } else if c.is_ascii_whitespace() || c == ',' {
            spaced.push(' ');
        } else {
            return Err(fail());
        }
    }
    let mut tokens = spaced.split_whitespace();
    let mut commands = Vec::new();
    let mut first = true;
    let mut count = 0;
    while let Some(command) = tokens.next() {
        if first && command != "M" {
            return Err(fail());
        }
        first = false;
        count += 1;
        if count > 2048 {
            return Err(fail());
        }
        let kind = match command {
            "M" => CommandKind::Move,
            "L" => CommandKind::Line,
            "Q" => CommandKind::Quadratic,
            "C" => CommandKind::Cubic,
            "Z" => CommandKind::Close,
            _ => return Err(fail()),
        };
        let mut points = Vec::new();
        for _ in 0..kind.arity() {
            let mut point = [0.0; 2];
            for coordinate in &mut point {
                *coordinate = tokens
                    .next()
                    .ok_or_else(fail)?
                    .parse::<f64>()
                    .map_err(|_| fail())?;
                if !coordinate.is_finite() || coordinate.abs() > 100_000.0 {
                    return Err(fail());
                }
            }
            points.push(point);
        }
        commands.push(PathCommand { kind, points });
    }
    if first {
        return Err(fail());
    }
    Ok(commands)
}

pub fn import_svg(source: &str) -> Result<GlyphOutline, AppError> {
    if source.len() > MAX_SVG_BYTES || source.contains("<!DOCTYPE") {
        return Err(input_error(
            "SVG imports must be at most 64 KiB and cannot contain a DTD.",
        ));
    }
    let document = roxmltree::Document::parse_with_options(
        source,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: 256,
            ..Default::default()
        },
    )
    .map_err(|_| input_error("Invalid or unsupported SVG XML."))?;
    let root = document.root_element();
    let svg = "http://www.w3.org/2000/svg";
    let fail = || {
        input_error("Use only an SVG viewBox and direct, filled path children. Scripts, links, styles, transforms, strokes, images and other elements are unsupported.")
    };
    if root.tag_name().name() != "svg" || root.tag_name().namespace() != Some(svg) {
        return Err(fail());
    }
    for attr in root.attributes() {
        if attr.namespace().is_some() || !matches!(attr.name(), "viewBox" | "width" | "height") {
            return Err(fail());
        }
    }
    let values: Vec<f64> = root
        .attribute("viewBox")
        .ok_or_else(fail)?
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|v| !v.is_empty())
        .map(str::parse)
        .collect::<Result<_, _>>()
        .map_err(|_| fail())?;
    let view_box: [f64; 4] = values.try_into().map_err(|_| fail())?;
    let mut paths = Vec::new();
    for node in document.descendants() {
        if node.is_pi() {
            return Err(fail());
        }
        if node.is_text() && !node.text().unwrap_or("").trim().is_empty() {
            return Err(fail());
        }
        if !node.is_element() || node == root {
            continue;
        }
        if node.parent() != Some(root)
            || node.tag_name().name() != "path"
            || node.tag_name().namespace() != Some(svg)
        {
            return Err(fail());
        }
        for attr in node.attributes() {
            if attr.namespace().is_some() || !matches!(attr.name(), "d" | "fill") {
                return Err(fail());
            }
            if attr.name() == "fill"
                && !matches!(attr.value(), "black" | "#000" | "#000000" | "currentColor")
            {
                return Err(fail());
            }
        }
        paths.push(node.attribute("d").ok_or_else(fail)?.to_owned());
    }
    let outline = GlyphOutline { view_box, paths };
    outline.validate()?;
    Ok(outline)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imports_only_bounded_inert_outline_data() {
        let valid = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 10 10 L 80 10 Q 90 20 80 80 C 60 90 40 90 10 10 Z"/></svg>"#;
        let outline = import_svg(valid).unwrap();
        assert_eq!(outline.paths.len(), 1);
        for bad in [
            valid.replace("<path", "<script"),
            valid.replace("<path", "<path onclick=\"alert(1)\""),
            valid.replace("<path", "<path transform=\"scale(2)\""),
            valid.replace("<path", "<path fill=\"url(https://example.invalid)\""),
            valid.replace("<path", "<path stroke=\"black\""),
            valid.replace("M 10 10", "m 10 10"),
            valid.replace("M 10 10", "M 1e999 10"),
            valid.replace("100 100", "0 100"),
            valid.replace("<path", "<image"),
            format!("<!DOCTYPE svg>{valid}"),
            valid.replace("<path", "<path xmlns=\"https://example.invalid\""),
        ] {
            assert!(import_svg(&bad).is_err(), "Accepted unsupported SVG: {bad}");
        }
        assert!(import_svg(&" ".repeat(MAX_SVG_BYTES + 1)).is_err());
        assert!(GlyphOutline {
            view_box: [0.0, 0.0, 1.0, 1.0],
            paths: vec!["M 0 0 1 1".into()]
        }
        .validate()
        .is_err());
    }
}
