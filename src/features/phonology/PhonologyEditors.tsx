import { useId } from 'react';
import { Plus } from 'lucide-react';
import type {
  Articulation,
  PhonemeDraft,
  PhonologyDraft,
} from '../../bridge/phonology';
import { EditorField, OutlineButton } from '../../components/primitives';

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
const articulatoryFields: { key: keyof Articulation; label: string }[] = [
  { key: 'place', label: 'Place' },
  { key: 'manner', label: 'Manner' },
  { key: 'voicing', label: 'Voicing' },
  { key: 'height', label: 'Height' },
  { key: 'backness', label: 'Backness' },
  { key: 'rounding', label: 'Rounding' },
];

export function PhonemeFields({
  draft,
  onChange,
}: {
  draft: PhonemeDraft;
  onChange: (draft: PhonemeDraft) => void;
}) {
  return (
    <>
      <div className="lexicon-field-pair">
        <EditorField
          label="IPA / phoneme label"
          value={draft.label}
          required
          maxLength={64}
          description="A display label; changing it preserves the phoneme's identity."
          onChange={(event) =>
            onChange({ ...draft, label: event.target.value })
          }
        />
        <label className="editor-field">
          Phoneme kind
          <select
            value={draft.kind}
            onChange={(event) =>
              onChange({
                ...draft,
                kind: event.target.value as PhonemeDraft['kind'],
              })
            }
          >
            <option value="consonant">Consonant</option>
            <option value="vowel">Vowel</option>
            <option value="other">Other / suprasegmental</option>
          </select>
        </label>
      </div>
      <section className="entry-section">
        <h3>Articulatory features</h3>
        <p className="field-description">
          Use your own descriptions. Fields are optional; LingForge does not
          infer features from a label.
        </p>
        <div className="lexicon-field-pair">
          {articulatoryFields.map(({ key, label }) => (
            <EditorField
              key={key}
              label={label}
              value={draft.articulation[key]}
              maxLength={80}
              onChange={(event) =>
                onChange({
                  ...draft,
                  articulation: {
                    ...draft.articulation,
                    [key]: event.target.value,
                  },
                })
              }
            />
          ))}
        </div>
      </section>
      <section className="entry-section">
        <h3>Custom features</h3>
        {draft.features.map((feature, index) => (
          <div className="entry-subrecord" key={index}>
            <div className="lexicon-field-pair">
              <EditorField
                label={`Feature ${index + 1} name`}
                required
                maxLength={80}
                value={feature.name}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    features: draft.features.map((item, position) =>
                      position === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <EditorField
                label={`Feature ${index + 1} value`}
                required
                maxLength={256}
                value={feature.value}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    features: draft.features.map((item, position) =>
                      position === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </div>
            <OutlineButton
              onClick={() =>
                onChange({
                  ...draft,
                  features: draft.features.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove feature {index + 1}
            </OutlineButton>
          </div>
        ))}
        <OutlineButton
          icon={Plus}
          disabled={draft.features.length >= 32}
          onClick={() =>
            onChange({
              ...draft,
              features: [...draft.features, { name: '', value: '' }],
            })
          }
        >
          Add custom feature
        </OutlineButton>
      </section>
      <section className="entry-section">
        <h3>Allophone descriptions</h3>
        <p className="field-description">
          Describe realizations and their environments. These descriptions do
          not transform pronunciations automatically.
        </p>
        {draft.allophones.map((allophone, index) => (
          <div className="entry-subrecord" key={allophone.id ?? index}>
            <EditorField
              label={`Allophone ${index + 1} label`}
              required
              maxLength={128}
              value={allophone.label}
              onChange={(event) =>
                onChange({
                  ...draft,
                  allophones: draft.allophones.map((item, position) =>
                    position === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
            />
            <TextArea
              label={`Allophone ${index + 1} environment`}
              value={allophone.environment}
              maxLength={2000}
              onChange={(environment) =>
                onChange({
                  ...draft,
                  allophones: draft.allophones.map((item, position) =>
                    position === index ? { ...item, environment } : item,
                  ),
                })
              }
            />
            <TextArea
              label={`Allophone ${index + 1} notes`}
              value={allophone.notes}
              maxLength={4000}
              onChange={(notes) =>
                onChange({
                  ...draft,
                  allophones: draft.allophones.map((item, position) =>
                    position === index ? { ...item, notes } : item,
                  ),
                })
              }
            />
            <OutlineButton
              onClick={() =>
                onChange({
                  ...draft,
                  allophones: draft.allophones.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove allophone {index + 1}
            </OutlineButton>
          </div>
        ))}
        <OutlineButton
          icon={Plus}
          disabled={draft.allophones.length >= 64}
          onClick={() =>
            onChange({
              ...draft,
              allophones: [
                ...draft.allophones,
                { id: null, label: '', environment: '', notes: '' },
              ],
            })
          }
        >
          Add allophone
        </OutlineButton>
      </section>
      <TextArea
        label="Phoneme notes"
        value={draft.notes}
        maxLength={10_000}
        onChange={(notes) => onChange({ ...draft, notes })}
      />
    </>
  );
}

export function ProfileFields({
  draft,
  onChange,
}: {
  draft: PhonologyDraft;
  onChange: (draft: PhonologyDraft) => void;
}) {
  return (
    <>
      <p className="field-description">
        Record the language's sound patterns in your own notation. Slots and
        descriptions are documentation; automatic generation and rule execution
        remain planned.
      </p>
      <TextArea
        label="Phonology notes"
        value={draft.notes}
        maxLength={20_000}
        onChange={(notes) => onChange({ ...draft, notes })}
      />
      <section className="entry-section">
        <h3>Syllable patterns</h3>
        {draft.patterns.map((pattern, index) => (
          <div className="entry-subrecord" key={pattern.id ?? index}>
            <EditorField
              label={`Pattern ${index + 1} label`}
              required
              maxLength={120}
              value={pattern.label}
              onChange={(event) =>
                onChange({
                  ...draft,
                  patterns: draft.patterns.map((item, position) =>
                    position === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
            />
            {(['onset', 'nucleus', 'coda'] as const).map((key) => (
              <EditorField
                key={key}
                label={`Pattern ${index + 1} ${key}`}
                maxLength={256}
                value={pattern[key]}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    patterns: draft.patterns.map((item, position) =>
                      position === index
                        ? { ...item, [key]: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            ))}
            <TextArea
              label={`Pattern ${index + 1} notes`}
              value={pattern.notes}
              maxLength={4000}
              onChange={(notes) =>
                onChange({
                  ...draft,
                  patterns: draft.patterns.map((item, position) =>
                    position === index ? { ...item, notes } : item,
                  ),
                })
              }
            />
            <OutlineButton
              onClick={() =>
                onChange({
                  ...draft,
                  patterns: draft.patterns.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove pattern {index + 1}
            </OutlineButton>
          </div>
        ))}
        <OutlineButton
          icon={Plus}
          disabled={draft.patterns.length >= 128}
          onClick={() =>
            onChange({
              ...draft,
              patterns: [
                ...draft.patterns,
                {
                  id: null,
                  label: '',
                  onset: '',
                  nucleus: '',
                  coda: '',
                  notes: '',
                },
              ],
            })
          }
        >
          Add syllable pattern
        </OutlineButton>
      </section>
      <section className="entry-section">
        <h3>Phonotactic descriptions</h3>
        {draft.rules.map((rule, index) => (
          <div className="entry-subrecord" key={rule.id ?? index}>
            <EditorField
              label={`Constraint ${index + 1} label`}
              required
              maxLength={120}
              value={rule.label}
              onChange={(event) =>
                onChange({
                  ...draft,
                  rules: draft.rules.map((item, position) =>
                    position === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
            />
            <TextArea
              label={`Constraint ${index + 1} description`}
              required
              value={rule.description}
              maxLength={4000}
              onChange={(description) =>
                onChange({
                  ...draft,
                  rules: draft.rules.map((item, position) =>
                    position === index ? { ...item, description } : item,
                  ),
                })
              }
            />
            <OutlineButton
              onClick={() =>
                onChange({
                  ...draft,
                  rules: draft.rules.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove constraint {index + 1}
            </OutlineButton>
          </div>
        ))}
        <OutlineButton
          icon={Plus}
          disabled={draft.rules.length >= 128}
          onClick={() =>
            onChange({
              ...draft,
              rules: [...draft.rules, { id: null, label: '', description: '' }],
            })
          }
        >
          Add phonotactic description
        </OutlineButton>
      </section>
    </>
  );
}
