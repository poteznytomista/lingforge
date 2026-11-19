import { useEffect, useState } from 'react';
import { decodeGlyph, type EditableOutline } from '../../bridge/glyph';
import { GlyphEditor } from './GlyphEditor';
import type {
  GlyphOutline,
  ScriptDraft,
  Character,
} from '../../bridge/writing';
import * as api from '../../bridge/writing';
import { EditorField, OutlineButton } from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { useInventory } from '../phonology/useInventory';
import { Outline } from './Glyph';

export function ScriptFields({
  draft,
  onChange,
  workspace,
  onGlyphEditing,
}: {
  draft: ScriptDraft;
  onChange: (draft: ScriptDraft) => void;
  workspace: WorkspaceController;
  onGlyphEditing: (value: boolean) => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const [editing, setEditing] = useState<{
    characterId: string;
    glyphId: string;
    title: string;
    original: GlyphOutline | null;
    model: EditableOutline;
  } | null>(null);
  useEffect(() => {
    onGlyphEditing(editing !== null);
  }, [editing, onGlyphEditing]);
  useEffect(() => () => onGlyphEditing(false), [onGlyphEditing]);
  const openEditor = (character: Character, glyphId?: string) => {
    const glyph = character.glyphs.find((g) => g.id === glyphId);
    void workspace.run(
      async () => ({
        glyphId: glyph?.id ?? (await api.newIdentity(sessionId)),
        model: await decodeGlyph(sessionId, glyph?.outline ?? null),
      }),
      (result) =>
        setEditing({
          ...result,
          characterId: character.id,
          title: `${character.name || 'Unnamed character'} / ${glyph?.name ?? 'New variant'}`,
          original: glyph?.outline ?? null,
        }),
    );
  };
  const inventory = useInventory(sessionId, workspace.active?.summary.revision);
  const update = (id: string, change: Partial<Character>) =>
    onChange({
      ...draft,
      characters: draft.characters.map((c) =>
        c.id === id ? { ...c, ...change } : c,
      ),
    });
  const importGlyph = (character: Character, variantId?: string) => {
    void workspace.run(
      async () => {
        const outline = await api.importOutline(sessionId);
        return outline
          ? { outline, id: variantId ?? (await api.newIdentity(sessionId)) }
          : null;
      },
      (result) => {
        if (!result) return;
        const { outline, id } = result;
        update(character.id, {
          glyphs: variantId
            ? character.glyphs.map((g) => (g.id === id ? { ...g, outline } : g))
            : [
                ...character.glyphs,
                { id, name: `Variant ${character.glyphs.length + 1}`, outline },
              ],
          defaultGlyphId: character.defaultGlyphId ?? id,
        });
      },
    );
  };
  return (
    <>
      <EditorField
        label="Writing-system name"
        value={draft.name}
        required
        maxLength={120}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      <label className="editor-field">
        Writing-system notes
        <textarea
          value={draft.notes}
          maxLength={10_000}
          onChange={(event) =>
            onChange({ ...draft, notes: event.target.value })
          }
        />
      </label>
      <section className="entry-section">
        <h3>Characters & glyphs</h3>
        <p className="field-description">
          A character keeps its identity when its name, transliteration, or
          glyph changes. Missing glyphs display the character name. Glyph
          variants use filled outline SVGs with a viewBox and direct paths;
          convert shapes and transforms to absolute M/L/Q/C/Z paths before
          importing.
        </p>
        {inventory.error && (
          <div className="inline-error" role="alert">
            <p>{inventory.error}</p>
            <OutlineButton onClick={inventory.retry}>
              Retry sound inventory
            </OutlineButton>
          </div>
        )}
        {draft.characters.map((character, index) => {
          const used =
            draft.sample.some(
              (unit) =>
                unit.kind === 'symbol' && unit.characterId === character.id,
            ) ||
            draft.mappings.some((m) => m.characterIds.includes(character.id));
          return (
            <section
              className="entry-subrecord character-editor"
              key={character.id}
              aria-label={`Character ${index + 1}`}
            >
              <p className="entry-id">ID {character.id}</p>
              <div className="lexicon-field-pair">
                <EditorField
                  label={`Character ${index + 1} name`}
                  value={character.name}
                  required
                  maxLength={120}
                  onChange={(event) =>
                    update(character.id, { name: event.target.value })
                  }
                />
                <EditorField
                  label={`Character ${index + 1} transliteration`}
                  value={character.transliteration}
                  maxLength={128}
                  description="Optional. Missing values are reported during conversion."
                  onChange={(event) =>
                    update(character.id, {
                      transliteration: event.target.value,
                    })
                  }
                />
              </div>
              <label className="editor-field">
                Link a phoneme to character {index + 1}
                <select
                  value=""
                  disabled={
                    !inventory.data || character.phonemeIds.length >= 32
                  }
                  onChange={(event) => {
                    if (event.target.value)
                      update(character.id, {
                        phonemeIds: [
                          ...character.phonemeIds,
                          event.target.value,
                        ],
                      });
                  }}
                >
                  <option value="">Choose a phoneme</option>
                  {inventory.data?.phonemes
                    .filter((p) => !character.phonemeIds.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · {p.id}
                      </option>
                    ))}
                </select>
              </label>
              <ul className="character-links">
                {character.phonemeIds.map((id) => (
                  <li key={id}>
                    <span className="language-text">
                      {inventory.data?.phonemes.find((p) => p.id === id)
                        ?.label ?? id}
                    </span>
                    <OutlineButton
                      aria-label={`Unlink phoneme ${id} from character ${index + 1}`}
                      onClick={() =>
                        update(character.id, {
                          phonemeIds: character.phonemeIds.filter(
                            (value) => value !== id,
                          ),
                        })
                      }
                    >
                      Unlink
                    </OutlineButton>
                  </li>
                ))}
              </ul>
              <div className="glyph-variants">
                {character.glyphs.map((glyph, glyphIndex) => (
                  <div className="glyph-variant" key={glyph.id}>
                    <Outline outline={glyph.outline} />
                    <EditorField
                      label={`Character ${index + 1} glyph ${glyphIndex + 1} name`}
                      required
                      maxLength={120}
                      value={glyph.name}
                      onChange={(event) =>
                        update(character.id, {
                          glyphs: character.glyphs.map((g) =>
                            g.id === glyph.id
                              ? { ...g, name: event.target.value }
                              : g,
                          ),
                        })
                      }
                    />
                    <OutlineButton
                      aria-pressed={character.defaultGlyphId === glyph.id}
                      onClick={() =>
                        update(character.id, { defaultGlyphId: glyph.id })
                      }
                    >
                      {character.defaultGlyphId === glyph.id
                        ? 'Default glyph'
                        : 'Use this glyph'}
                    </OutlineButton>
                    <OutlineButton
                      onClick={() => openEditor(character, glyph.id)}
                    >
                      Edit geometry
                    </OutlineButton>
                    <OutlineButton
                      disabled={character.glyphs.length >= 8}
                      onClick={() =>
                        void workspace.run(
                          () => api.newIdentity(sessionId),
                          (id) =>
                            update(character.id, {
                              glyphs: [
                                ...character.glyphs,
                                {
                                  ...glyph,
                                  id,
                                  name: `Variant ${character.glyphs.length + 1}`,
                                },
                              ],
                            }),
                        )
                      }
                    >
                      Duplicate variant
                    </OutlineButton>
                    <OutlineButton
                      onClick={() => importGlyph(character, glyph.id)}
                    >
                      Replace outline
                    </OutlineButton>
                    <OutlineButton
                      onClick={() =>
                        update(character.id, {
                          glyphs: character.glyphs.filter(
                            (g) => g.id !== glyph.id,
                          ),
                          defaultGlyphId:
                            character.defaultGlyphId === glyph.id
                              ? null
                              : character.defaultGlyphId,
                        })
                      }
                    >
                      Remove glyph
                    </OutlineButton>
                  </div>
                ))}
              </div>
              <div className="project-action-row">
                <OutlineButton
                  disabled={character.glyphs.length >= 8}
                  onClick={() => openEditor(character)}
                >
                  Draw glyph variant
                </OutlineButton>
                <OutlineButton
                  disabled={character.glyphs.length >= 8}
                  onClick={() => importGlyph(character)}
                >
                  Import glyph variant
                </OutlineButton>
                <OutlineButton
                  disabled={used}
                  onClick={() =>
                    onChange({
                      ...draft,
                      characters: draft.characters.filter(
                        (c) => c.id !== character.id,
                      ),
                    })
                  }
                >
                  Remove character {index + 1}
                </OutlineButton>
              </div>
              {used && (
                <p className="field-description">
                  Remove this character's input mappings and text occurrences
                  before deleting it.
                </p>
              )}
            </section>
          );
        })}
        <OutlineButton
          disabled={draft.characters.length >= 256}
          onClick={() =>
            void workspace.run(
              () => api.newIdentity(sessionId),
              (id) =>
                onChange({
                  ...draft,
                  characters: [...draft.characters, api.newCharacter(id)],
                }),
            )
          }
        >
          Add character
        </OutlineButton>
      </section>
      <section className="entry-section">
        <h3>Input mappings</h3>
        <p className="field-description">
          Map a key sequence to one or more characters in order. Multiple input
          sequences may target the same character. Repeated inputs with
          different outputs are reported as ambiguous.
        </p>
        {draft.mappings.map((mapping, index) => (
          <div className="entry-subrecord" key={mapping.id}>
            <EditorField
              label={`Mapping ${index + 1} input`}
              required
              maxLength={32}
              value={mapping.input}
              onChange={(event) =>
                onChange({
                  ...draft,
                  mappings: draft.mappings.map((m) =>
                    m.id === mapping.id
                      ? { ...m, input: event.target.value }
                      : m,
                  ),
                })
              }
            />
            <ol className="mapping-output">
              {mapping.characterIds.map((id, position) => (
                <li key={position}>
                  <span>
                    {draft.characters.find((c) => c.id === id)?.name ??
                      'Missing character'}
                  </span>
                  <OutlineButton
                    aria-label={`Remove output ${position + 1} from mapping ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...draft,
                        mappings: draft.mappings.map((m) =>
                          m.id === mapping.id
                            ? {
                                ...m,
                                characterIds: m.characterIds.filter(
                                  (_, i) => i !== position,
                                ),
                              }
                            : m,
                        ),
                      })
                    }
                  >
                    Remove output
                  </OutlineButton>
                </li>
              ))}
            </ol>
            <label className="editor-field">
              Append output to mapping {index + 1}
              <select
                value=""
                disabled={mapping.characterIds.length >= 16}
                onChange={(event) => {
                  if (event.target.value)
                    onChange({
                      ...draft,
                      mappings: draft.mappings.map((m) =>
                        m.id === mapping.id
                          ? {
                              ...m,
                              characterIds: [
                                ...m.characterIds,
                                event.target.value,
                              ],
                            }
                          : m,
                      ),
                    });
                }}
              >
                <option value="">Choose a character</option>
                {draft.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Unnamed'} · {c.id}
                  </option>
                ))}
              </select>
            </label>
            <OutlineButton
              onClick={() =>
                onChange({
                  ...draft,
                  mappings: draft.mappings.filter((m) => m.id !== mapping.id),
                })
              }
            >
              Remove mapping {index + 1}
            </OutlineButton>
          </div>
        ))}
        <OutlineButton
          disabled={draft.mappings.length >= 512 || !draft.characters.length}
          onClick={() =>
            void workspace.run(
              () => api.newIdentity(sessionId),
              (id) =>
                onChange({
                  ...draft,
                  mappings: [
                    ...draft.mappings,
                    { id, input: '', characterIds: [] },
                  ],
                }),
            )
          }
        >
          Add input mapping
        </OutlineButton>
      </section>
      {editing && (
        <GlyphEditor
          initial={editing.model}
          original={editing.original}
          title={editing.title}
          components={draft.characters.flatMap((c) =>
            c.glyphs.map((g) => ({
              id: g.id,
              label: `${c.name || 'Unnamed character'} / ${g.name}`,
              outline: g.outline,
            })),
          )}
          workspace={workspace}
          onClose={() => setEditing(null)}
          onApply={(outline) => {
            const character = draft.characters.find(
              (c) => c.id === editing.characterId,
            );
            if (!character) {
              workspace.setError('The character is no longer in this draft.');
              return;
            }
            const exists = character.glyphs.some(
              (g) => g.id === editing.glyphId,
            );
            if (!exists && character.glyphs.length >= 8) {
              workspace.setError(
                'This character already has eight glyph variants.',
              );
              return;
            }
            update(character.id, {
              glyphs: exists
                ? character.glyphs.map((g) =>
                    g.id === editing.glyphId ? { ...g, outline } : g,
                  )
                : [
                    ...character.glyphs,
                    {
                      id: editing.glyphId,
                      name: `Variant ${character.glyphs.length + 1}`,
                      outline,
                    },
                  ],
              defaultGlyphId: character.defaultGlyphId ?? editing.glyphId,
            });
            setEditing(null);
            workspace.setNotice(
              'Glyph applied to the draft. Save the writing system to persist it.',
            );
          }}
        />
      )}
    </>
  );
}
