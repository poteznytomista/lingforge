import { useId, type RefObject } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { LexemeDetails, LexemeDraft } from '../../bridge/lexicon';
import { EditorField, OutlineButton } from '../../components/primitives';
import { ReferencePicker } from './ReferencePicker';
import { SequenceEditor } from '../phonology/SequenceEditor';
import { useInventory } from '../phonology/useInventory';

function TextArea({
  label,
  value,
  maxLength,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="editor-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function EntryEditor({
  draft,
  details,
  sessionId,
  projectRevision,
  busy,
  dirty,
  formRef,
  onChange,
  onSave,
  onDiscard,
  onDelete,
  onSelect,
}: {
  draft: LexemeDraft;
  details: LexemeDetails | null;
  sessionId: string;
  busy: boolean;
  dirty: boolean;
  projectRevision: number | undefined;
  formRef: RefObject<HTMLFormElement | null>;
  onChange: (draft: LexemeDraft) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  onSelect: (id: string) => void;
}) {
  const inventory = useInventory(sessionId, projectRevision);
  return (
    <section
      className="workspace-card lexicon-editor"
      aria-label="Entry editor"
    >
      <div className="lexicon-editor-heading">
        <div>
          <p className="overline">
            {details ? 'LEXICAL RECORD' : 'NEW RECORD'}
          </p>
          <h2 className="language-text">
            {details?.entry.data.lemma || 'New entry'}
          </h2>
        </div>
        <span className="technical-badge">{dirty ? 'UNSAVED' : 'SAVED'}</span>
      </div>
      {details && <p className="entry-id">ID {details.entry.id}</p>}
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={busy} className="project-fields">
          <div className="lexicon-field-pair">
            <EditorField
              label="Lemma / headword"
              value={draft.lemma}
              required
              maxLength={256}
              onChange={(event) =>
                onChange({ ...draft, lemma: event.target.value })
              }
            />
            <label className="editor-field">
              Entry kind
              <select
                value={draft.kind}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    kind: event.target.value as LexemeDraft['kind'],
                    rootId: null,
                  })
                }
              >
                <option value="lexeme">Lexical entry</option>
                <option value="root">Root</option>
              </select>
            </label>
            <EditorField
              label="Pronunciation"
              description="Free-form IPA or your own notation."
              value={draft.pronunciation}
              maxLength={512}
              onChange={(event) =>
                onChange({ ...draft, pronunciation: event.target.value })
              }
            />
            <EditorField
              label="Part of speech / category"
              description="Use categories that suit this language."
              value={draft.partOfSpeech}
              maxLength={120}
              onChange={(event) =>
                onChange({ ...draft, partOfSpeech: event.target.value })
              }
            />
          </div>
          {inventory.error && (
            <div role="alert" className="inline-error">
              <p>{inventory.error}</p>
              <OutlineButton onClick={inventory.retry}>
                Retry pronunciation inventory
              </OutlineButton>
            </div>
          )}
          <SequenceEditor
            label="Entry pronunciation"
            segments={draft.pronunciationSegments}
            phonemes={inventory.data?.phonemes ?? null}
            disabled={busy}
            onChange={(pronunciationSegments) =>
              onChange({ ...draft, pronunciationSegments })
            }
          />
          <section className="entry-section" aria-label="Senses">
            <h3>Senses</h3>
            {draft.senses.map((sense, index) => (
              <div className="entry-subrecord" key={sense.id ?? `new-${index}`}>
                <TextArea
                  label={`Definition ${index + 1}`}
                  value={sense.definition}
                  maxLength={4000}
                  required
                  onChange={(definition) =>
                    onChange({
                      ...draft,
                      senses: draft.senses.map((item, position) =>
                        position === index ? { ...item, definition } : item,
                      ),
                    })
                  }
                />
                <TextArea
                  label={`Sense ${index + 1} notes`}
                  value={sense.notes}
                  maxLength={4000}
                  onChange={(notes) =>
                    onChange({
                      ...draft,
                      senses: draft.senses.map((item, position) =>
                        position === index ? { ...item, notes } : item,
                      ),
                    })
                  }
                />
                <OutlineButton
                  disabled={draft.senses.length === 1}
                  onClick={() =>
                    onChange({
                      ...draft,
                      senses: draft.senses.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  Remove sense {index + 1}
                </OutlineButton>
              </div>
            ))}
            <OutlineButton
              icon={Plus}
              disabled={draft.senses.length >= 64}
              onClick={() =>
                onChange({
                  ...draft,
                  senses: [
                    ...draft.senses,
                    { id: null, definition: '', notes: '' },
                  ],
                })
              }
            >
              Add sense
            </OutlineButton>
          </section>
          <section className="entry-section" aria-label="Forms">
            <h3>Forms</h3>
            <p className="field-description">
              Inflected or alternate forms belong to this entry. Labels are
              yours to define.
            </p>
            {draft.forms.map((form, index) => (
              <div className="entry-subrecord" key={form.id ?? `new-${index}`}>
                <div className="lexicon-field-pair">
                  <EditorField
                    label={`Form ${index + 1}`}
                    value={form.text}
                    maxLength={256}
                    required
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        forms: draft.forms.map((item, position) =>
                          position === index
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <EditorField
                    label={`Form ${index + 1} label`}
                    value={form.label}
                    maxLength={120}
                    required
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        forms: draft.forms.map((item, position) =>
                          position === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </div>
                <EditorField
                  label={`Form ${index + 1} pronunciation`}
                  value={form.pronunciation}
                  maxLength={512}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      forms: draft.forms.map((item, position) =>
                        position === index
                          ? { ...item, pronunciation: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <SequenceEditor
                  label={`Form ${index + 1} pronunciation`}
                  segments={form.pronunciationSegments}
                  phonemes={inventory.data?.phonemes ?? null}
                  disabled={busy}
                  onChange={(pronunciationSegments) =>
                    onChange({
                      ...draft,
                      forms: draft.forms.map((item, position) =>
                        position === index
                          ? { ...item, pronunciationSegments }
                          : item,
                      ),
                    })
                  }
                />
                <OutlineButton
                  onClick={() =>
                    onChange({
                      ...draft,
                      forms: draft.forms.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  Remove form {index + 1}
                </OutlineButton>
              </div>
            ))}
            <OutlineButton
              icon={Plus}
              disabled={draft.forms.length >= 128}
              onClick={() =>
                onChange({
                  ...draft,
                  forms: [
                    ...draft.forms,
                    {
                      id: null,
                      text: '',
                      label: '',
                      pronunciation: '',
                      pronunciationSegments: [],
                    },
                  ],
                })
              }
            >
              Add form
            </OutlineButton>
          </section>
          <section
            className="entry-section"
            aria-label="Origins and relationships"
          >
            <h3>Origins & relationships</h3>
            {draft.kind === 'lexeme' && (
              <ReferencePicker
                label="Root"
                sessionId={sessionId}
                value={draft.rootId}
                exclude={details?.entry.id}
                kind="root"
                disabled={busy}
                onChange={(rootId) => onChange({ ...draft, rootId })}
              />
            )}
            <TextArea
              label="Etymology"
              value={draft.etymology}
              maxLength={10_000}
              onChange={(etymology) => onChange({ ...draft, etymology })}
            />
            {draft.relations.map((relation, index) => (
              <div className="entry-subrecord" key={index}>
                <EditorField
                  label={`Relationship ${index + 1} type`}
                  value={relation.relationType}
                  maxLength={120}
                  required
                  description="For example, derived from or related to; no fixed taxonomy."
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      relations: draft.relations.map((item, position) =>
                        position === index
                          ? { ...item, relationType: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <ReferencePicker
                  label={`Related entry ${index + 1}`}
                  sessionId={sessionId}
                  value={relation.targetId || null}
                  exclude={details?.entry.id}
                  disabled={busy}
                  onChange={(targetId) =>
                    onChange({
                      ...draft,
                      relations: draft.relations.map((item, position) =>
                        position === index
                          ? { ...item, targetId: targetId ?? '' }
                          : item,
                      ),
                    })
                  }
                />
                <OutlineButton
                  onClick={() =>
                    onChange({
                      ...draft,
                      relations: draft.relations.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  Remove relationship {index + 1}
                </OutlineButton>
              </div>
            ))}
            <OutlineButton
              icon={Plus}
              disabled={draft.relations.length >= 128}
              onClick={() =>
                onChange({
                  ...draft,
                  relations: [
                    ...draft.relations,
                    { targetId: '', relationType: '' },
                  ],
                })
              }
            >
              Add relationship
            </OutlineButton>
          </section>
          <TextArea
            label="Entry notes"
            value={draft.notes}
            maxLength={20_000}
            onChange={(notes) => onChange({ ...draft, notes })}
          />
        </fieldset>
        <div className="entry-save-bar">
          <OutlineButton
            type="submit"
            icon={Save}
            tone="accent"
            disabled={busy || !dirty}
          >
            Save entry
          </OutlineButton>
          <OutlineButton disabled={busy || !dirty} onClick={onDiscard}>
            Discard edits
          </OutlineButton>
          {details && (
            <OutlineButton
              icon={Trash2}
              disabled={busy || details.incomingCount > 0}
              onClick={onDelete}
            >
              Delete entry
            </OutlineButton>
          )}
        </div>
      </form>
      {details && (
        <section className="entry-section incoming-links">
          <h3>Referenced by entries · {details.incomingCount}</h3>
          <p className="field-description">
            {details.incomingCount
              ? 'Remove these incoming links before deleting this entry. Renaming preserves all links.'
              : 'No other entry references this record.'}
          </p>
          <ul>
            {details.incoming.map((reference, index) => (
              <li key={`${reference.id}:${index}`}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(reference.id)}
                >
                  <span className="language-text">{reference.lemma}</span>
                  <small>{reference.relationType}</small>
                </button>
              </li>
            ))}
          </ul>
          {details.incomingCount > details.incoming.length && (
            <p className="field-description">
              Showing the first 50 lexical references.
            </p>
          )}
          <p className="field-description">
            Saved document and grammar links also block deletion. A blocked
            deletion names a record to update in Documents or Grammar.
          </p>
        </section>
      )}
    </section>
  );
}
