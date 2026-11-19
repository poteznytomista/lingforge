use fea_rs::{
    compile::{Compilation, Compiler, NopFeatureProvider, NopVariationInfo},
    parse::SourceLoadError,
    GlyphMap,
};
use lingforge_core::{font::FontDraft, lexicon::input_error, AppError};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
    sync::Arc,
};

/// Only generated names and validated integers enter FEA; authored text never
/// becomes executable feature syntax and includes never access the filesystem.
pub(crate) fn compile(data: &FontDraft) -> Result<(Compilation, GlyphMap), AppError> {
    let names: Vec<String> = std::iter::once(".notdef".into())
        .chain((1..=data.glyphs.len()).map(|i| format!("g{i}")))
        .collect();
    let map = GlyphMap::new(names.iter().map(String::as_str))
        .map_err(|_| input_error("Cannot create the font glyph order."))?;
    let ids: BTreeMap<_, _> = data
        .glyphs
        .iter()
        .enumerate()
        .map(|(i, g)| (g.variant_id.as_str(), names[i + 1].as_str()))
        .collect();
    let name = |id: &str| ids[id];
    let seq = |v: &[String]| v.iter().map(|id| name(id)).collect::<Vec<_>>().join(" ");
    let ligs: BTreeSet<_> = data.ligatures.iter().map(|r| r.output.as_str()).collect();
    let class = |kind: u8| {
        data.glyphs
            .iter()
            .filter(|g| match kind {
                1 => g.mark,
                2 => ligs.contains(g.variant_id.as_str()),
                _ => !g.mark && !ligs.contains(g.variant_id.as_str()),
            })
            .map(|g| name(&g.variant_id))
            .collect::<Vec<_>>()
            .join(" ")
    };
    let mut source = String::from("languagesystem DFLT dflt;\n");
    let literal = |s: String| if s.is_empty() { s } else { format!("[{s}]") };
    source.push_str(&format!(
        "table GDEF {{ GlyphClassDef {}, {}, {}, ; }} GDEF;\n",
        literal(class(0)),
        literal(class(2)),
        literal(class(1))
    ));
    // One ordered lookup per context: later rules may observe earlier output.
    if !data.contexts.is_empty() {
        source.push_str("feature calt {\n");
        for (i, r) in data.contexts.iter().enumerate() {
            source.push_str(&format!(
                "lookup C{i} {{ sub {} {}' {} by {}; }} C{i};\n",
                seq(&r.before),
                name(&r.input),
                seq(&r.after),
                name(&r.output)
            ));
        }
        source.push_str("} calt;\n");
    }
    if !data.ligatures.is_empty() {
        source.push_str("feature liga {\n");
        // Longest inputs first; order of equal lengths remains authored order.
        let mut rules: Vec<_> = data.ligatures.iter().collect();
        rules.sort_by_key(|r| std::cmp::Reverse(r.input.len()));
        for r in rules {
            source.push_str(&format!("sub {} by {};\n", seq(&r.input), name(&r.output)));
        }
        source.push_str("} liga;\n");
    }
    let marks: Vec<_> = data.glyphs.iter().filter(|g| g.mark).collect();
    if !marks.is_empty() {
        for g in marks {
            let [x, y] = g
                .anchor
                .ok_or_else(|| input_error("A mark anchor is missing."))?;
            source.push_str(&format!(
                "markClass {} <anchor {x} {y}> @Marks;\n",
                name(&g.variant_id)
            ));
        }
        source.push_str("feature mark {\n");
        for g in data.glyphs.iter().filter(|g| !g.mark) {
            if let Some([x, y]) = g.anchor {
                source.push_str(&format!(
                    "pos base {} <anchor {x} {y}> mark @Marks;\n",
                    name(&g.variant_id)
                ));
            }
        }
        source.push_str("} mark;\n");
    }
    let source: Arc<str> = source.into();
    let compilation = Compiler::<'_,NopFeatureProvider,NopVariationInfo>::new("lingforge.fea", &map)
        .with_resolver(move |path: &Path| -> Result<Arc<str>,SourceLoadError> {
            if path == Path::new("lingforge.fea") { Ok(source.clone()) } else { Err(SourceLoadError::new(path.into(), "External feature files are disabled.")) }
        }).compile().map_err(|_| input_error("The font layout rules could not be compiled. Check contextual, ligature and anchor definitions."))?;
    Ok((compilation, map))
}
