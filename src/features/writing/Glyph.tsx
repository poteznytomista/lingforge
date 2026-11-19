import type { Character, GlyphOutline, TextUnit } from '../../bridge/writing';

export function Outline({ outline }: { outline: GlyphOutline }) {
  return (
    <svg
      className="character-outline"
      viewBox={outline.viewBox.join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      {outline.paths.map((d, index) => (
        <path key={index} d={d} fill="currentColor" fillRule="nonzero" />
      ))}
    </svg>
  );
}
export function CharacterGlyph({ character }: { character: Character }) {
  const glyph = character.glyphs.find((g) => g.id === character.defaultGlyphId);
  return glyph ? (
    <Outline outline={glyph.outline} />
  ) : (
    <span className="character-fallback">{character.name || 'Unnamed'}</span>
  );
}
export function UnitGlyph({
  unit,
  characters,
}: {
  unit: TextUnit;
  characters: Character[];
}) {
  if (unit.kind === 'text')
    return (
      <span className="language-text literal-unit">
        {/^[\r\n]+$/.test(unit.text) ? '↵' : unit.text}
      </span>
    );
  const character = characters.find((c) => c.id === unit.characterId);
  return character ? (
    <CharacterGlyph character={character} />
  ) : (
    <span>[missing character]</span>
  );
}
