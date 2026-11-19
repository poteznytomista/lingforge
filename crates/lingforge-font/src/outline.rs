use kurbo::{BezPath, Point};
use lingforge_core::{
    font::FontMetrics,
    glyph::GlyphOutline,
    glyph_edit::{CommandKind, EditableOutline},
    lexicon::input_error,
    AppError,
};
use write_fonts::tables::glyf::SimpleGlyph;

const MAX_POINTS: usize = 16_000;
fn midpoint(a: Point, b: Point) -> Point {
    Point::new((a.x + b.x) / 2.0, (a.y + b.y) / 2.0)
}
fn cubic(path: &mut BezPath, p: [Point; 4], depth: usize) -> Result<(), AppError> {
    if path.elements().len() > MAX_POINTS / 3 {
        return Err(input_error(
            "This outline needs too many font points. Simplify the geometry.",
        ));
    }
    let q = Point::new(
        (-p[0].x + 3.0 * p[1].x + 3.0 * p[2].x - p[3].x) / 4.0,
        (-p[0].y + 3.0 * p[1].y + 3.0 * p[2].y - p[3].y) / 4.0,
    );
    let a = Point::new((p[0].x + 2.0 * q.x) / 3.0, (p[0].y + 2.0 * q.y) / 3.0);
    let b = Point::new((p[3].x + 2.0 * q.x) / 3.0, (p[3].y + 2.0 * q.y) / 3.0);
    // The difference curve lies inside its control hull: <= 0.5 font unit
    // before integer rounding, with the same parameter on both curves.
    if a.distance(p[1]).max(b.distance(p[2])) <= 0.5 {
        if q.x.abs() > 16000.0 || q.y.abs() > 16000.0 {
            return Err(input_error(
                "A converted font control point is outside ±16000 units.",
            ));
        }
        path.quad_to(q, p[3]);
        return Ok(());
    }
    if depth == 16 {
        return Err(input_error(
            "This cubic cannot be converted within the font precision limit.",
        ));
    }
    let a = midpoint(p[0], p[1]);
    let b = midpoint(p[1], p[2]);
    let c = midpoint(p[2], p[3]);
    let d = midpoint(a, b);
    let e = midpoint(b, c);
    let f = midpoint(d, e);
    cubic(path, [p[0], a, d, f], depth + 1)?;
    cubic(path, [f, e, c, p[3]], depth + 1)
}
pub(crate) fn glyph(
    outline: &GlyphOutline,
    metrics: &FontMetrics,
) -> Result<SimpleGlyph, AppError> {
    let model = EditableOutline::from_outline(outline)?;
    // Separate SVG path elements paint independently. Flattening them into one
    // nonzero glyf can cancel overlapping contours. Refuse that silent change.
    if model.paths.len() != 1 {
        return Err(input_error("Font export currently requires one SVG path per variant. Use multiple contours within that path; independent painted paths need a future boolean-union step."));
    }
    let scale = f64::from(metrics.units_per_em) / f64::from(metrics.source_em);
    let point = |p: [f64; 2]| -> Result<Point, AppError> {
        let p = Point::new(
            p[0] * scale,
            (f64::from(metrics.source_baseline) - p[1]) * scale,
        );
        if p.x.abs() > 16000.0 || p.y.abs() > 16000.0 {
            return Err(input_error("Font coordinates must fit within ±16000 units after scaling. Adjust the shared source em or outline."));
        }
        Ok(p)
    };
    let mut path = BezPath::new();
    let mut at = Point::ZERO;
    let mut start = at;
    let mut closed = false;
    for cmd in &model.paths[0] {
        if closed && !matches!(cmd.kind, CommandKind::Move | CommandKind::Close) {
            path.move_to(at);
            closed = false;
        }
        match cmd.kind {
            CommandKind::Move => {
                at = point(cmd.points[0])?;
                start = at;
                path.move_to(at);
                closed = false;
            }
            CommandKind::Line => {
                at = point(cmd.points[0])?;
                path.line_to(at);
            }
            CommandKind::Quadratic => {
                let control = point(cmd.points[0])?;
                at = point(cmd.points[1])?;
                path.quad_to(control, at);
            }
            CommandKind::Cubic => {
                let end = point(cmd.points[2])?;
                cubic(
                    &mut path,
                    [at, point(cmd.points[0])?, point(cmd.points[1])?, end],
                    0,
                )?;
                at = end;
            }
            CommandKind::Close => {
                if !closed {
                    path.close_path();
                }
                at = start;
                closed = true;
            }
        }
        if path.elements().len() > MAX_POINTS / 3 {
            return Err(input_error(
                "The font outline is too complex. Simplify it first.",
            ));
        }
    }
    let mut glyph = SimpleGlyph::from_bezpath(&path)
        .map_err(|_| input_error("This outline cannot be represented as a TrueType contour."))?;
    if glyph.contours.len() > 1024
        || glyph.contours.iter().map(|c| c.len()).sum::<usize>() > MAX_POINTS
    {
        return Err(input_error(
            "The font limit is 1024 contours and 16000 points per glyph.",
        ));
    }
    glyph.overlaps = true;
    glyph.recompute_bounding_box();
    Ok(glyph)
}
