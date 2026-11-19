//! Bounded experimental TrueType generation and single-run shaping.
//! No font import, filesystem access, bidi algorithm, or custom shaper.
use lingforge_core::{
    font::{FontDraft, RunDirection},
    lexicon::input_error,
    writing::{identifier, ScriptDraft},
    AppError,
};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use write_fonts::{
    tables::{
        cmap::Cmap,
        glyf::{Bbox, GlyfLocaBuilder, SimpleGlyph},
        head::Head,
        hhea::Hhea,
        hmtx::{Hmtx, LongMetric},
        maxp::Maxp,
        name::{Name, NameRecord},
        os2::{Os2, SelectionFlags},
    },
    types::{FWord, Fixed, GlyphId, NameId, Tag, UfWord},
    FontBuilder,
};
mod features;
mod outline;

pub const MAX_FONT_BYTES: usize = 4 * 1024 * 1024;
fn build_error<E>(_: E) -> AppError {
    input_error("This font could not be encoded within the supported OpenType limits.")
}
fn i16_metric(n: i32) -> Result<i16, AppError> {
    i16::try_from(n)
        .map_err(|_| input_error("A font side bearing exceeds the signed 16-bit metric limit."))
}

/// Always rebuilds from checked draft settings and the saved script supplied by
/// the host. Encoding and shaping never change stored source outlines or text.
pub fn compile(
    script_id: &str,
    script: &ScriptDraft,
    data: &FontDraft,
) -> Result<Vec<u8>, AppError> {
    if !identifier(script_id) {
        return Err(input_error("Invalid writing-system identity."));
    }
    data.validate(script)?;
    let m = &data.metrics;
    let (layout, glyph_map) = features::compile(data)?;
    let mut builder = FontBuilder::new();
    let mut glyf = GlyfLocaBuilder::new();
    let mut metrics = Vec::new();
    let mut bounds: Option<Bbox> = None;
    let mut max_points = 0;
    let mut max_contours = 0;
    let mut total_points = 0;
    let mut min_lsb = i16::MAX;
    let mut min_rsb = i16::MAX;
    let mut max_extent = i16::MIN;
    let mut max_advance = 0;
    // A visible missing-glyph box; never conflated with a linguistic character.
    let mut missing = kurbo::BezPath::new();
    let em = f64::from(m.units_per_em);
    missing.move_to((em * 0.05, 0.0));
    missing.line_to((em * 0.05, em * 0.7));
    missing.line_to((em * 0.55, em * 0.7));
    missing.line_to((em * 0.55, 0.0));
    missing.close_path();
    missing.move_to((em * 0.1, em * 0.05));
    missing.line_to((em * 0.5, em * 0.05));
    missing.line_to((em * 0.5, em * 0.65));
    missing.line_to((em * 0.1, em * 0.65));
    missing.close_path();
    let notdef = SimpleGlyph::from_bezpath(&missing).map_err(build_error)?;
    let mut add = |glyph: SimpleGlyph, advance: u16| -> Result<(), AppError> {
        let points = glyph.contours.iter().map(|c| c.len()).sum::<usize>();
        total_points += points;
        if total_points > 262_144 {
            return Err(input_error(
                "The experimental font limit is 262144 total outline points.",
            ));
        }
        max_points = max_points.max(points);
        max_contours = max_contours.max(glyph.contours.len());
        bounds = Some(bounds.map_or(glyph.bbox, |b| b.union(glyph.bbox)));
        max_advance = max_advance.max(advance);
        min_lsb = min_lsb.min(glyph.bbox.x_min);
        min_rsb = min_rsb.min(i16_metric(
            i32::from(advance) - i32::from(glyph.bbox.x_max),
        )?);
        max_extent = max_extent.max(glyph.bbox.x_max);
        metrics.push(LongMetric::new(advance, glyph.bbox.x_min));
        glyf.add_glyph(&glyph).map_err(build_error)?;
        Ok(())
    };
    add(notdef, (em * 0.6).round() as u16)?;
    let mut mark_bounds = Vec::new();
    for g in &data.glyphs {
        let variant = script
            .characters
            .iter()
            .find(|c| c.id == g.character_id)
            .and_then(|c| c.glyphs.iter().find(|v| v.id == g.variant_id))
            .ok_or_else(|| input_error("A font variant is missing."))?;
        let glyph = outline::glyph(&variant.outline, m)?;
        if g.mark {
            if let Some(anchor) = g.anchor {
                mark_bounds.push((glyph.bbox, anchor));
            }
        }
        add(glyph, g.advance)?;
    }
    let bounds = bounds.unwrap_or_default();
    let mut top = i32::from(m.ascender.max(bounds.y_max));
    let mut bottom = i32::from(m.descender.min(bounds.y_min));
    for base in data.glyphs.iter().filter(|g| !g.mark) {
        if let Some([_, y]) = base.anchor {
            for (bbox, anchor) in &mark_bounds {
                let offset = i32::from(y) - i32::from(anchor[1]);
                top = top.max(i32::from(bbox.y_max) + offset);
                bottom = bottom.min(i32::from(bbox.y_min) + offset);
            }
        }
    }
    let win_ascent = u16::try_from(top)
        .map_err(|_| input_error("Positioned marks exceed the Windows ascent limit."))?;
    let win_descent = u16::try_from(bottom.unsigned_abs())
        .map_err(|_| input_error("Positioned marks exceed the Windows descent limit."))?;
    let (glyf, loca, format) = glyf.build();
    let count = (data.glyphs.len() + 1) as u16;
    let head = Head {
        font_revision: Fixed::from_f64(1.0),
        units_per_em: m.units_per_em,
        lowest_rec_ppem: 8,
        x_min: bounds.x_min,
        y_min: bounds.y_min,
        x_max: bounds.x_max,
        y_max: bounds.y_max,
        index_to_loc_format: format as i16,
        ..Default::default()
    };
    let hhea = Hhea {
        ascender: FWord::new(m.ascender),
        descender: FWord::new(m.descender),
        line_gap: FWord::new(m.line_gap),
        advance_width_max: UfWord::new(max_advance),
        min_left_side_bearing: FWord::new(min_lsb),
        min_right_side_bearing: FWord::new(min_rsb),
        x_max_extent: FWord::new(max_extent),
        caret_slope_rise: 1,
        number_of_h_metrics: count,
        ..Default::default()
    };
    let maxp = Maxp {
        num_glyphs: count,
        max_points: Some(max_points as u16),
        max_contours: Some(max_contours as u16),
        max_composite_points: Some(0),
        max_composite_contours: Some(0),
        max_zones: Some(1),
        max_twilight_points: Some(0),
        max_storage: Some(0),
        max_function_defs: Some(0),
        max_instruction_defs: Some(0),
        max_stack_elements: Some(0),
        max_size_of_instructions: Some(0),
        max_component_elements: Some(0),
        max_component_depth: Some(0),
    };
    let mappings: Vec<_> = data
        .glyphs
        .iter()
        .enumerate()
        .filter_map(|(i, g)| {
            g.codepoint
                .and_then(char::from_u32)
                .map(|c| (c, GlyphId::new((i + 1) as u32)))
        })
        .collect();
    let cmap = Cmap::from_mappings(mappings.clone()).map_err(build_error)?;
    let mut os2 = Os2 {
        x_avg_char_width: (metrics.iter().map(|m| u32::from(m.advance)).sum::<u32>()
            / u32::from(count)) as i16,
        us_weight_class: 400,
        us_width_class: 5,
        fs_type: data.embedding.bits(),
        ach_vend_id: Tag::new(b"NONE"),
        fs_selection: SelectionFlags::from_bits_truncate(0x00c0),
        us_first_char_index: mappings
            .iter()
            .map(|(c, _)| (*c as u32).min(0xffff) as u16)
            .min()
            .unwrap_or(0),
        us_last_char_index: mappings
            .iter()
            .map(|(c, _)| (*c as u32).min(0xffff) as u16)
            .max()
            .unwrap_or(0),
        s_typo_ascender: m.ascender,
        s_typo_descender: m.descender,
        s_typo_line_gap: m.line_gap,
        us_win_ascent: win_ascent,
        us_win_descent: win_descent,
        ul_code_page_range_1: Some(0),
        ul_code_page_range_2: Some(0),
        sx_height: Some(0),
        s_cap_height: Some(0),
        us_default_char: Some(0),
        us_break_char: Some(0),
        us_max_context: Some(9),
        ..Default::default()
    };
    // Advertise only known ranges; do not infer language coverage from shapes.
    if mappings
        .iter()
        .any(|(c, _)| (0xe000..=0xf8ff).contains(&(*c as u32)))
    {
        os2.ul_unicode_range_2 |= 1 << 28;
    }
    if mappings.iter().any(|(c, _)| (*c as u32) > 0xffff) {
        os2.ul_unicode_range_2 |= 1 << 25;
    }
    let ps_name = format!("LingForge-{}", script_id.replace('-', ""));
    let strings = [
        (0, data.copyright.clone()),
        (1, data.family.clone()),
        (2, "Regular".into()),
        (3, format!("LingForge;{script_id};1.000")),
        (4, format!("{} Regular", data.family)),
        (5, "Version 1.000; LingForge experimental".into()),
        (6, ps_name),
        (13, data.license.clone()),
    ];
    let mut name = Name::default();
    for (id, s) in strings {
        name.name_record
            .push(NameRecord::new(3, 1, 0x0409, NameId::new(id), s.into()));
    }
    name.name_record.sort();
    builder.add_table(&head).map_err(build_error)?;
    builder.add_table(&hhea).map_err(build_error)?;
    builder
        .add_table(&Hmtx::new(metrics, vec![]))
        .map_err(build_error)?;
    builder.add_table(&maxp).map_err(build_error)?;
    builder.add_table(&glyf).map_err(build_error)?;
    builder.add_table(&loca).map_err(build_error)?;
    builder.add_table(&cmap).map_err(build_error)?;
    builder.add_table(&os2).map_err(build_error)?;
    builder.add_table(&name).map_err(build_error)?;
    builder
        .add_table(&glyph_map.make_post_table())
        .map_err(build_error)?;
    if let Some(t) = layout.gsub {
        builder.add_table(&t).map_err(build_error)?;
    }
    if let Some(t) = layout.gpos {
        builder.add_table(&t).map_err(build_error)?;
    }
    if let Some(t) = layout.gdef {
        builder.add_table(&t).map_err(build_error)?;
    }
    let bytes = builder.build();
    if bytes.len() > MAX_FONT_BYTES {
        return Err(input_error("Generated fonts must fit within 4 MiB."));
    }
    if rustybuzz::Face::from_slice(&bytes, 0).is_none() {
        return Err(input_error(
            "The generated font could not be reopened for shaping.",
        ));
    }
    Ok(bytes)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapedGlyph {
    pub glyph_id: u32,
    pub variant_id: Option<String>,
    pub start: usize,
    pub end: usize,
    pub x_advance: i32,
    pub y_advance: i32,
    pub x_offset: i32,
    pub y_offset: i32,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontPreview {
    pub bytes: Vec<u8>,
    pub text: String,
    pub glyphs: Vec<ShapedGlyph>,
    pub warnings: Vec<String>,
}

pub fn preview(
    script_id: &str,
    script: &ScriptDraft,
    data: &FontDraft,
) -> Result<FontPreview, AppError> {
    let bytes = compile(script_id, script, data)?;
    let face = rustybuzz::Face::from_slice(&bytes, 0)
        .ok_or_else(|| input_error("Cannot open the generated font."))?;
    let encoded: BTreeMap<_, _> = data
        .glyphs
        .iter()
        .filter_map(|g| g.codepoint.map(|c| (g.character_id.as_str(), c)))
        .collect();
    let mut text = String::new();
    let mut buffer = rustybuzz::UnicodeBuffer::new();
    for (i, id) in data.sample.iter().enumerate() {
        let c = encoded
            .get(id.as_str())
            .and_then(|cp| char::from_u32(*cp))
            .ok_or_else(|| input_error("A sample character has no font mapping."))?;
        text.push(c);
        buffer.add(c, i as u32);
    }
    buffer.set_direction(match data.direction {
        RunDirection::Ltr => rustybuzz::Direction::LeftToRight,
        RunDirection::Rtl => rustybuzz::Direction::RightToLeft,
    });
    // DFLT is a controlled generic experiment, not automatic Arabic/Indic shaping.
    buffer.set_script(rustybuzz::script::UNKNOWN);
    buffer.set_cluster_level(rustybuzz::BufferClusterLevel::MonotoneCharacters);
    let shaped = rustybuzz::shape(&face, &[], buffer);
    let boundaries: BTreeSet<usize> = shaped
        .glyph_infos()
        .iter()
        .map(|g| g.cluster as usize)
        .chain(std::iter::once(data.sample.len()))
        .collect();
    let mut glyphs = Vec::new();
    for (g, p) in shaped.glyph_infos().iter().zip(shaped.glyph_positions()) {
        let start = g.cluster as usize;
        let end = boundaries
            .range((std::ops::Bound::Excluded(start), std::ops::Bound::Unbounded))
            .next()
            .copied()
            .unwrap_or(data.sample.len());
        if start >= data.sample.len()
            || end > data.sample.len()
            || g.glyph_id as usize > data.glyphs.len()
        {
            return Err(input_error(
                "The shaping result has unsupported cluster boundaries.",
            ));
        }
        glyphs.push(ShapedGlyph {
            glyph_id: g.glyph_id,
            variant_id: g
                .glyph_id
                .checked_sub(1)
                .and_then(|i| data.glyphs.get(i as usize))
                .map(|g| g.variant_id.clone()),
            start,
            end,
            x_advance: p.x_advance,
            y_advance: p.y_advance,
            x_offset: p.x_offset,
            y_offset: p.y_offset,
        });
    }
    if glyphs.len() > 2048 {
        return Err(input_error("The shaped sample exceeds the preview limit."));
    }
    let mut warnings = vec!["Experimental, unhinted TrueType. Cubics are approximated to quadratics within 0.5 font unit before integer rounding; source outlines remain unchanged.".into(),
        "The reference shaper uses one explicit direction and the generic DFLT script. Platform shaping and native selection may differ. Mixed bidirectional text, mark stacking and mark-to-ligature attachment are not supported.".into()];
    if data.glyphs.iter().any(|g| {
        g.mark
            && g.codepoint
                .is_some_and(|c| (0xe000..=0xf8ff).contains(&c) || c >= 0xf0000)
    }) {
        warnings.push("PUA marks have no Unicode combining properties. Font anchors do not establish grapheme, caret or bidi behavior in other applications.".into());
    }
    if glyphs.iter().any(|g| g.glyph_id == 0) {
        warnings.push("The shaped sample contains a missing-glyph result.".into());
    }
    Ok(FontPreview {
        bytes,
        text,
        glyphs,
        warnings,
    })
}
