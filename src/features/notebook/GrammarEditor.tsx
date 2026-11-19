import { useState } from 'react';
import type { GrammarDraft, MorphologyNote } from '../../bridge/notebook';
import { newIdentity } from '../../bridge/writing';
import { EditorField, OutlineButton } from '../../components/primitives';
import { ReferencePicker } from '../lexicon/ReferencePicker';
import { useInventory } from '../phonology/useInventory';
import type { WorkspaceController } from '../projects/useWorkspace';

export function GrammarEditor({
  draft,
  workspace,
  onChange,
}: {
  draft: GrammarDraft;
  workspace: WorkspaceController;
  onChange: (draft: GrammarDraft) => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const inventory = useInventory(sessionId, workspace.active?.summary.revision);
  const phonemes = inventory.data?.phonemes ?? [];
  const loading = !inventory.data && !inventory.error;
  const [entry, setEntry] = useState<string | null>(null);
  const disabled = workspace.busy;
  const add = (create: (id: string) => GrammarDraft) =>
    void workspace.run(
      () => newIdentity(sessionId),
      (id) => onChange(create(id)),
    );
  return (
    <>
      <p className="field-description">
        Each section describes your analysis. Features, glosses and morphology
        are authored records; they do not generate or alter lexical forms.
        References below apply to this section and its examples.
      </p>
      <section className="entry-section">
        <h3>Language-defined features</h3>
        {draft.features.map((f, index) => (
          <fieldset className="notebook-item" key={f.id}>
            <legend>Feature {index + 1}</legend>
            <EditorField
              label="Feature name"
              required
              maxLength={120}
              value={f.name}
              onChange={(e) =>
                onChange({
                  ...draft,
                  features: draft.features.map((x) =>
                    x.id === f.id ? { ...f, name: e.target.value } : x,
                  ),
                })
              }
            />
            <label className="editor-field">
              Values
              <textarea
                maxLength={2000}
                value={f.values}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    features: draft.features.map((x) =>
                      x.id === f.id ? { ...f, values: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label className="editor-field">
              Feature description
              <textarea
                maxLength={4000}
                value={f.description}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    features: draft.features.map((x) =>
                      x.id === f.id ? { ...f, description: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <OutlineButton
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...draft,
                  features: draft.features.filter((x) => x.id !== f.id),
                })
              }
            >
              Remove feature
            </OutlineButton>
          </fieldset>
        ))}
        <OutlineButton
          disabled={disabled || draft.features.length >= 64}
          onClick={() =>
            add((id) => ({
              ...draft,
              features: [
                ...draft.features,
                { id, name: '', values: '', description: '' },
              ],
            }))
          }
        >
          Add feature
        </OutlineButton>
      </section>
      <section className="entry-section">
        <h3>Examples</h3>
        {draft.examples.map((example, index) => (
          <fieldset className="notebook-item" key={example.id}>
            <legend>Example {index + 1}</legend>
            {(['text', 'gloss', 'translation'] as const).map((field) => (
              <label key={field} className="editor-field">
                {field === 'text'
                  ? 'Example text'
                  : field === 'gloss'
                    ? 'Gloss'
                    : 'Translation'}
                <textarea
                  required={field === 'text'}
                  maxLength={4000}
                  value={example[field]}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      examples: draft.examples.map((x) =>
                        x.id === example.id
                          ? { ...example, [field]: e.target.value }
                          : x,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <OutlineButton
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...draft,
                  examples: draft.examples.filter((x) => x.id !== example.id),
                })
              }
            >
              Remove example
            </OutlineButton>
          </fieldset>
        ))}
        <OutlineButton
          disabled={disabled || draft.examples.length >= 128}
          onClick={() =>
            add((id) => ({
              ...draft,
              examples: [
                ...draft.examples,
                { id, text: '', gloss: '', translation: '' },
              ],
            }))
          }
        >
          Add example
        </OutlineButton>
      </section>
      <section className="entry-section">
        <h3>Lexical references</h3>
        <ReferencePicker
          label="Section entry"
          sessionId={sessionId}
          value={entry}
          disabled={disabled}
          onChange={setEntry}
        />
        <OutlineButton
          disabled={
            disabled ||
            !entry ||
            draft.lexemeIds.includes(entry) ||
            draft.lexemeIds.length >= 256
          }
          onClick={() => {
            if (entry) {
              onChange({ ...draft, lexemeIds: [...draft.lexemeIds, entry] });
              setEntry(null);
            }
          }}
        >
          Add lexical reference
        </OutlineButton>
        {draft.lexemeIds.map((id) => (
          <ReferencePicker
            key={id}
            label="Referenced entry"
            sessionId={sessionId}
            value={id}
            disabled={disabled}
            onChange={(next) => {
              if (next && next !== id && draft.lexemeIds.includes(next)) {
                workspace.setError('This entry is already linked.');
                return;
              }
              onChange({
                ...draft,
                lexemeIds: next
                  ? draft.lexemeIds.map((x) => (x === id ? next : x))
                  : draft.lexemeIds.filter((x) => x !== id),
              });
            }}
          />
        ))}
      </section>
      <section className="entry-section">
        <h3>Phonological references</h3>
        {inventory.error && (
          <div role="alert">
            <p className="inline-error">{inventory.error}</p>
            <OutlineButton onClick={inventory.retry}>
              Retry phonemes
            </OutlineButton>
          </div>
        )}
        {loading && <p role="status">Loading phonemes…</p>}
        <label className="editor-field">
          Add phoneme reference
          <select
            value=""
            disabled={disabled || loading || draft.phonemeIds.length >= 256}
            onChange={(e) => {
              if (e.target.value)
                onChange({
                  ...draft,
                  phonemeIds: [...draft.phonemeIds, e.target.value],
                });
            }}
          >
            <option value="">Choose a phoneme</option>
            {phonemes
              .filter((p) => !draft.phonemeIds.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </label>
        <ul className="notebook-links">
          {draft.phonemeIds.map((id) => (
            <li key={id}>
              <span className="language-text">
                {phonemes.find((p) => p.id === id)?.label ?? id}
              </span>
              <OutlineButton
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...draft,
                    phonemeIds: draft.phonemeIds.filter((x) => x !== id),
                  })
                }
              >
                Remove phoneme reference
              </OutlineButton>
            </li>
          ))}
        </ul>
      </section>
      <section className="entry-section">
        <h3>Inflection, derivation and irregular forms</h3>
        {draft.morphology.map((m, index) => {
          const update = (patch: Partial<MorphologyNote>) =>
            onChange({
              ...draft,
              morphology: draft.morphology.map((x) =>
                x.id === m.id ? { ...m, ...patch } : x,
              ),
            });
          return (
            <fieldset className="notebook-item" key={m.id}>
              <legend>Morphology record {index + 1}</legend>
              <label className="editor-field">
                Record type
                <select
                  value={m.kind}
                  onChange={(e) =>
                    update({ kind: e.target.value as MorphologyNote['kind'] })
                  }
                >
                  <option value="inflection">Inflection description</option>
                  <option value="derivation">Derivation description</option>
                  <option value="irregular">Irregular form</option>
                </select>
              </label>
              <EditorField
                label="Morphology label"
                required
                maxLength={120}
                value={m.label}
                onChange={(e) => update({ label: e.target.value })}
              />
              <label className="editor-field">
                Morphology description
                <textarea
                  maxLength={4000}
                  value={m.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </label>
              <ReferencePicker
                label="Morphology entry"
                sessionId={sessionId}
                value={m.entryId}
                disabled={disabled}
                onChange={(entryId) => update({ entryId })}
              />
              <EditorField
                label="Authored form"
                required={m.kind === 'irregular'}
                maxLength={2000}
                value={m.form}
                onChange={(e) => update({ form: e.target.value })}
              />
              {m.kind === 'irregular' && (
                <p className="field-description">
                  Irregular records require a linked entry and an authored form.
                  This records an observation without modifying the dictionary.
                </p>
              )}
              <OutlineButton
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...draft,
                    morphology: draft.morphology.filter((x) => x.id !== m.id),
                  })
                }
              >
                Remove morphology record
              </OutlineButton>
            </fieldset>
          );
        })}
        <OutlineButton
          disabled={disabled || draft.morphology.length >= 128}
          onClick={() =>
            add((id) => ({
              ...draft,
              morphology: [
                ...draft.morphology,
                {
                  id,
                  kind: 'inflection',
                  label: '',
                  description: '',
                  entryId: null,
                  form: '',
                },
              ],
            }))
          }
        >
          Add morphology record
        </OutlineButton>
      </section>
    </>
  );
}
