//! Typed editing adapter over the existing persisted outline format.
use crate::{
    glyph::{parse_path, GlyphOutline, MAX_SVG_BYTES},
    lexicon::input_error,
    AppError,
};
use serde::{Deserialize, Serialize};

pub type Point = [f64; 2];
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandKind {
    Move,
    Line,
    Quadratic,
    Cubic,
    Close,
}
impl CommandKind {
    pub fn arity(self) -> usize {
        match self {
            Self::Move | Self::Line => 1,
            Self::Quadratic => 2,
            Self::Cubic => 3,
            Self::Close => 0,
        }
    }
    pub fn letter(self) -> &'static str {
        match self {
            Self::Move => "M",
            Self::Line => "L",
            Self::Quadratic => "Q",
            Self::Cubic => "C",
            Self::Close => "Z",
        }
    }
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PathCommand {
    pub kind: CommandKind,
    pub points: Vec<Point>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditableOutline {
    pub view_box: [f64; 4],
    pub paths: Vec<Vec<PathCommand>>,
}
impl Default for EditableOutline {
    fn default() -> Self {
        Self {
            view_box: [0.0, 0.0, 1000.0, 1000.0],
            paths: Vec::new(),
        }
    }
}
fn finite(value: f64) -> bool {
    value.is_finite() && value.abs() <= 100_000.0
}
fn valid_point(p: Point) -> bool {
    p.into_iter().all(finite)
}
impl EditableOutline {
    /// Empty geometry is permitted while editing, never when applying/exporting.
    pub fn validate(&self) -> Result<(), AppError> {
        if !self.view_box.into_iter().all(finite)
            || self.view_box[2] <= 0.0
            || self.view_box[3] <= 0.0
            || self.paths.len() > 32
        {
            return Err(input_error(
                "Use a positive finite viewBox and at most 32 paths.",
            ));
        }
        for path in &self.paths {
            if path.is_empty() || path.len() > 2048 || path[0].kind != CommandKind::Move {
                return Err(input_error(
                    "Each path starts with Move and contains 1–2,048 commands.",
                ));
            }
            if path.iter().any(|c| {
                c.points.len() != c.kind.arity() || c.points.iter().any(|p| !valid_point(*p))
            }) {
                return Err(input_error("A path command has invalid points. Coordinates must be finite and within ±100,000."));
            }
        }
        Ok(())
    }
    pub fn from_outline(outline: &GlyphOutline) -> Result<Self, AppError> {
        outline.validate()?;
        let result = Self {
            view_box: outline.view_box,
            paths: outline
                .paths
                .iter()
                .map(|p| parse_path(p))
                .collect::<Result<_, _>>()?,
        };
        result.validate()?;
        Ok(result)
    }
    pub fn to_outline(&self) -> Result<GlyphOutline, AppError> {
        self.validate()?;
        let result = GlyphOutline {
            view_box: self.view_box,
            paths: self
                .paths
                .iter()
                .map(|path| {
                    path.iter()
                        .map(|c| {
                            let mut parts = vec![c.kind.letter().to_owned()];
                            parts.extend(c.points.iter().flatten().map(|n| number(*n)));
                            parts.join(" ")
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .collect(),
        };
        result.validate()?;
        Ok(result)
    }
}
fn number(value: f64) -> String {
    if value == 0.0 {
        "0".into()
    } else {
        value.to_string()
    }
}
fn lerp(a: Point, b: Point, t: f64) -> Point {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}
fn snap(position: Point, grid: f64) -> Result<Point, AppError> {
    if !valid_point(position) || !grid.is_finite() || !(0.0..=10_000.0).contains(&grid) {
        return Err(input_error(
            "Use finite coordinates and a grid between 0 and 10,000; zero disables snapping.",
        ));
    }
    let p = if grid == 0.0 {
        position
    } else {
        position.map(|n| (n / grid).round() * grid)
    };
    if !valid_point(p) {
        return Err(input_error(
            "Snapping moved a point beyond the supported coordinate bounds.",
        ));
    }
    Ok(p)
}
fn path_mut(model: &mut EditableOutline, path: usize) -> Result<&mut Vec<PathCommand>, AppError> {
    model
        .paths
        .get_mut(path)
        .ok_or_else(|| input_error("Select an existing path."))
}
fn endpoint_before(path: &[PathCommand], index: usize) -> Point {
    let mut point = [0.0, 0.0];
    let mut start = point;
    for c in path.iter().take(index) {
        if c.kind == CommandKind::Close {
            point = start;
        } else if let Some(last) = c.points.last() {
            point = *last;
            if c.kind == CommandKind::Move {
                start = point;
            }
        }
    }
    point
}
fn segment(kind: CommandKind, from: Point, to: Point) -> PathCommand {
    let points = match kind {
        CommandKind::Move | CommandKind::Line => vec![to],
        CommandKind::Quadratic => vec![lerp(from, to, 0.5), to],
        CommandKind::Cubic => vec![lerp(from, to, 1.0 / 3.0), lerp(from, to, 2.0 / 3.0), to],
        CommandKind::Close => vec![],
    };
    PathCommand { kind, points }
}
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum GlyphOperation {
    NewPath {
        position: Point,
        grid: f64,
    },
    Append {
        path: usize,
        segment: CommandKind,
        position: Point,
        grid: f64,
    },
    MovePoint {
        path: usize,
        command: usize,
        point: usize,
        position: Point,
        grid: f64,
    },
    DeleteCommand {
        path: usize,
        command: usize,
    },
    DeletePath {
        path: usize,
    },
    ReorderPath {
        path: usize,
        to: usize,
    },
    TranslatePath {
        path: usize,
        offset: Point,
    },
    ChangeSegment {
        path: usize,
        command: usize,
        segment: CommandKind,
    },
    SplitSegment {
        path: usize,
        command: usize,
        t: f64,
    },
    ViewBox {
        #[serde(rename = "viewBox")]
        view_box: [f64; 4],
    },
    Component {
        outline: GlyphOutline,
        offset: Point,
        scale: f64,
    },
}
pub fn edit(
    model: &EditableOutline,
    operation: GlyphOperation,
) -> Result<EditableOutline, AppError> {
    model.validate()?;
    let mut result = model.clone();
    match operation {
        GlyphOperation::NewPath { position, grid } => result.paths.push(vec![segment(
            CommandKind::Move,
            [0.0, 0.0],
            snap(position, grid)?,
        )]),
        GlyphOperation::Append {
            path,
            segment: kind,
            position,
            grid,
        } => {
            let p = path_mut(&mut result, path)?;
            let from = endpoint_before(p, p.len());
            p.push(segment(kind, from, snap(position, grid)?));
        }
        GlyphOperation::MovePoint {
            path,
            command,
            point,
            position,
            grid,
        } => {
            let target = path_mut(&mut result, path)?
                .get_mut(command)
                .and_then(|c| c.points.get_mut(point))
                .ok_or_else(|| input_error("Select an existing anchor or control point."))?;
            *target = snap(position, grid)?;
        }
        GlyphOperation::DeleteCommand { path, command } => {
            let p = path_mut(&mut result, path)?;
            if command >= p.len() {
                return Err(input_error("Select an existing command."));
            }
            p.remove(command);
            if p.is_empty() {
                result.paths.remove(path);
            }
        }
        GlyphOperation::DeletePath { path } => {
            path_mut(&mut result, path)?;
            result.paths.remove(path);
        }
        GlyphOperation::ReorderPath { path, to } => {
            if path >= result.paths.len() || to >= result.paths.len() {
                return Err(input_error("Select existing paths to reorder."));
            }
            let p = result.paths.remove(path);
            result.paths.insert(to, p);
        }
        GlyphOperation::TranslatePath { path, offset } => {
            if !valid_point(offset) {
                return Err(input_error("Use a finite translation within ±100,000."));
            }
            for point in path_mut(&mut result, path)?
                .iter_mut()
                .flat_map(|c| &mut c.points)
            {
                point[0] += offset[0];
                point[1] += offset[1];
            }
        }
        GlyphOperation::ChangeSegment {
            path,
            command,
            segment: kind,
        } => {
            let p = path_mut(&mut result, path)?;
            let c = p
                .get(command)
                .ok_or_else(|| input_error("Select an existing segment."))?;
            if matches!(c.kind, CommandKind::Move | CommandKind::Close)
                || matches!(kind, CommandKind::Move | CommandKind::Close)
            {
                return Err(input_error(
                    "Only line, quadratic and cubic segments can change type.",
                ));
            }
            let end = *c
                .points
                .last()
                .ok_or_else(|| input_error("This segment has no endpoint."))?;
            p[command] = segment(kind, endpoint_before(p, command), end);
        }
        GlyphOperation::SplitSegment { path, command, t } => {
            if !t.is_finite() || t <= 0.0 || t >= 1.0 {
                return Err(input_error(
                    "Split position must lie strictly between 0 and 1.",
                ));
            }
            let p = path_mut(&mut result, path)?;
            let c = p
                .get(command)
                .ok_or_else(|| input_error("Select a segment to split."))?
                .clone();
            let from = endpoint_before(p, command);
            let (first, second) = match c.kind {
                CommandKind::Line => {
                    let mid = lerp(from, c.points[0], t);
                    (vec![mid], vec![c.points[0]])
                }
                CommandKind::Quadratic => {
                    let a = lerp(from, c.points[0], t);
                    let b = lerp(c.points[0], c.points[1], t);
                    let mid = lerp(a, b, t);
                    (vec![a, mid], vec![b, c.points[1]])
                }
                CommandKind::Cubic => {
                    let a = lerp(from, c.points[0], t);
                    let b = lerp(c.points[0], c.points[1], t);
                    let c1 = lerp(c.points[1], c.points[2], t);
                    let d = lerp(a, b, t);
                    let e = lerp(b, c1, t);
                    let mid = lerp(d, e, t);
                    (vec![a, d, mid], vec![e, c1, c.points[2]])
                }
                _ => {
                    return Err(input_error(
                        "Select a line, quadratic or cubic segment to split.",
                    ))
                }
            };
            p.splice(
                command..=command,
                [
                    PathCommand {
                        kind: c.kind,
                        points: first,
                    },
                    PathCommand {
                        kind: c.kind,
                        points: second,
                    },
                ],
            );
        }
        GlyphOperation::ViewBox { view_box } => result.view_box = view_box,
        GlyphOperation::Component {
            outline,
            offset,
            scale,
        } => {
            if !valid_point(offset) || !scale.is_finite() || scale <= 0.0 || scale > 1000.0 {
                return Err(input_error(
                    "Use a positive component scale up to 1,000 and a finite offset.",
                ));
            }
            let mut component = EditableOutline::from_outline(&outline)?;
            for point in component
                .paths
                .iter_mut()
                .flatten()
                .flat_map(|c| &mut c.points)
            {
                point[0] = point[0] * scale + offset[0];
                point[1] = point[1] * scale + offset[1];
            }
            result.paths.extend(component.paths);
        }
    }
    result.validate()?;
    Ok(result)
}

/// Numeric tokens only; no original XML, labels, links or styles are interpolated.
pub fn svg(model: &EditableOutline) -> Result<String, AppError> {
    let outline = model.to_outline()?;
    let mut result = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{}\">\n",
        outline
            .view_box
            .into_iter()
            .map(number)
            .collect::<Vec<_>>()
            .join(" ")
    );
    for path in outline.paths {
        result.push_str(&format!("  <path d=\"{path}\" fill=\"black\"/>\n"));
    }
    result.push_str("</svg>\n");
    if result.len() > MAX_SVG_BYTES {
        return Err(input_error("The complete SVG exceeds the 64 KiB import/export bound. Simplify paths before exporting."));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::glyph::import_svg;
    fn fixture(path: &str) -> EditableOutline {
        EditableOutline::from_outline(&GlyphOutline {
            view_box: [-10.0, -20.0, 200.0, 250.0],
            paths: vec![path.into()],
        })
        .unwrap()
    }
    fn evaluate(start: Point, command: &PathCommand, t: f64) -> Point {
        let mut polygon = vec![start];
        polygon.extend(&command.points);
        while polygon.len() > 1 {
            polygon = polygon.windows(2).map(|p| lerp(p[0], p[1], t)).collect();
        }
        polygon[0]
    }
    #[test]
    fn legacy_paths_preserve_contours_and_coordinates_through_canonical_svg() {
        let original = fixture(
            "M-0,2e1 L 100 20 Q 150 60 100 100 C 80 150 20 150 0 100 Z M 10 30 L 10 40 Z L 20 30",
        );
        let first = svg(&original).unwrap();
        assert!(first.contains("M 0 20"));
        assert!(first.contains("Z M 10 30"));
        assert!(first.contains("Z L 20 30"));
        let reimported = EditableOutline::from_outline(&import_svg(&first).unwrap()).unwrap();
        assert_eq!(reimported, original);
        assert_eq!(svg(&reimported).unwrap(), first);
        let appended = edit(
            &original,
            GlyphOperation::Append {
                path: 0,
                segment: CommandKind::Quadratic,
                position: [40.0, 30.0],
                grid: 0.0,
            },
        )
        .unwrap();
        assert_eq!(
            appended.paths[0].last().unwrap().points,
            vec![[30.0, 30.0], [40.0, 30.0]]
        );
    }
    #[test]
    fn splitting_preserves_line_quadratic_and_cubic_geometry() {
        for source in [
            "M 0 0 L 100 80",
            "M 0 0 Q 20 100 100 80",
            "M 0 0 C 20 100 70 -30 100 80",
        ] {
            let before = fixture(source);
            let after = edit(
                &before,
                GlyphOperation::SplitSegment {
                    path: 0,
                    command: 1,
                    t: 0.25,
                },
            )
            .unwrap();
            assert_eq!(after.paths[0].len(), 3);
            for t in [0.0, 0.1, 0.25, 0.4, 0.8, 1.0] {
                let expected = evaluate([0.0, 0.0], &before.paths[0][1], t);
                let actual = if t <= 0.25 {
                    evaluate([0.0, 0.0], &after.paths[0][1], t / 0.25)
                } else {
                    evaluate(
                        *after.paths[0][1].points.last().unwrap(),
                        &after.paths[0][2],
                        (t - 0.25) / 0.75,
                    )
                };
                for axis in 0..2 {
                    assert!((expected[axis] - actual[axis]).abs() < 1e-10);
                }
            }
        }
    }
    #[test]
    fn edits_snap_points_translate_controls_and_copy_components_independently() {
        let source = fixture("M 0 0 C 10 20 30 40 50 60 Z");
        let moved = edit(
            &source,
            GlyphOperation::MovePoint {
                path: 0,
                command: 1,
                point: 0,
                position: [13.0, -13.0],
                grid: 5.0,
            },
        )
        .unwrap();
        assert_eq!(moved.paths[0][1].points[0], [15.0, -15.0]);
        assert_eq!(source.paths[0][1].points[0], [10.0, 20.0]);
        let translated = edit(
            &moved,
            GlyphOperation::TranslatePath {
                path: 0,
                offset: [100.0, 200.0],
            },
        )
        .unwrap();
        assert_eq!(translated.paths[0][0].points[0], [100.0, 200.0]);
        assert_eq!(translated.paths[0][1].points[0], [115.0, 185.0]);
        let combined = edit(
            &source,
            GlyphOperation::Component {
                outline: translated.to_outline().unwrap(),
                offset: [-50.0, 0.0],
                scale: 0.5,
            },
        )
        .unwrap();
        assert_eq!(combined.paths.len(), 2);
        assert_eq!(combined.paths[0], source.paths[0]);
        assert_eq!(combined.paths[1][0].points[0], [0.0, 100.0]);
        let later = edit(&translated, GlyphOperation::DeletePath { path: 0 }).unwrap();
        assert!(later.paths.is_empty());
        assert_eq!(combined.paths.len(), 2);
    }
    #[test]
    fn empty_drafts_invalid_edits_bounds_and_unknown_fields_are_checked() {
        let empty = EditableOutline::default();
        assert!(empty.validate().is_ok());
        assert!(svg(&empty).is_err());
        assert!(empty.to_outline().is_err());
        let model = fixture("M 0 0 L 100 100");
        for operation in [
            GlyphOperation::DeleteCommand {
                path: 0,
                command: 0,
            },
            GlyphOperation::DeletePath { path: 99 },
            GlyphOperation::MovePoint {
                path: 0,
                command: 0,
                point: 8,
                position: [0.0, 0.0],
                grid: 0.0,
            },
            GlyphOperation::MovePoint {
                path: 0,
                command: 0,
                point: 0,
                position: [f64::NAN, 0.0],
                grid: 0.0,
            },
            GlyphOperation::TranslatePath {
                path: 0,
                offset: [100000.0, 0.0],
            },
            GlyphOperation::SplitSegment {
                path: 0,
                command: 1,
                t: 0.0,
            },
            GlyphOperation::ViewBox {
                view_box: [0.0, 0.0, 0.0, 100.0],
            },
        ] {
            assert!(edit(&model, operation).is_err());
        }
        let mut malformed = model.clone();
        malformed.paths[0][1].points.clear();
        assert!(malformed.validate().is_err());
        let mut huge = model.clone();
        huge.paths = vec![model.paths[0].clone(); 33];
        assert!(huge.validate().is_err());
        huge.paths = vec![vec![model.paths[0][0].clone(); 2049]];
        assert!(huge.validate().is_err());
        assert!(serde_json::from_str::<GlyphOperation>(
            r#"{"kind":"delete_path","path":0,"scriptId":"injected"}"#
        )
        .is_err());
        assert!(serde_json::from_str::<EditableOutline>(
            r#"{"viewBox":[0,0,100,100],"paths":[],"html":"unsafe"}"#
        )
        .is_err());
    }
    #[test]
    fn serialized_and_complete_svg_limits_are_enforced() {
        let command = PathCommand {
            kind: CommandKind::Cubic,
            points: vec![[1.123456789012345, 2.123456789012345]; 3],
        };
        let mut model = fixture("M 0 0");
        model.paths[0].extend(vec![command; 2047]);
        assert!(model.validate().is_ok());
        assert!(model.to_outline().is_err());
        assert!(svg(&model).is_err());
    }
    #[test]
    fn a_new_design_can_be_authored_changed_and_exported_without_an_import() {
        let mut model = edit(
            &EditableOutline::default(),
            GlyphOperation::NewPath {
                position: [100.0, 800.0],
                grid: 25.0,
            },
        )
        .unwrap();
        for position in [[500.0, 200.0], [900.0, 800.0]] {
            model = edit(
                &model,
                GlyphOperation::Append {
                    path: 0,
                    segment: CommandKind::Line,
                    position,
                    grid: 25.0,
                },
            )
            .unwrap();
        }
        model = edit(
            &model,
            GlyphOperation::ChangeSegment {
                path: 0,
                command: 2,
                segment: CommandKind::Quadratic,
            },
        )
        .unwrap();
        model = edit(
            &model,
            GlyphOperation::MovePoint {
                path: 0,
                command: 2,
                point: 0,
                position: [850.0, 400.0],
                grid: 25.0,
            },
        )
        .unwrap();
        model = edit(
            &model,
            GlyphOperation::Append {
                path: 0,
                segment: CommandKind::Close,
                position: [0.0, 0.0],
                grid: 0.0,
            },
        )
        .unwrap();
        let encoded = svg(&model).unwrap();
        assert!(encoded.contains("M 100 800 L 500 200 Q 850 400 900 800 Z"));
        assert_eq!(
            EditableOutline::from_outline(&import_svg(&encoded).unwrap()).unwrap(),
            model
        );
    }
}
