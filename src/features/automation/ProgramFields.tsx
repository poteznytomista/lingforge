import type { ProgramDraft } from '../../bridge/automation';
import { EditorField, OutlineButton } from '../../components/primitives';
import { ReferencePicker } from '../lexicon/ReferencePicker';
import { Choice, RuleFields, RuleSequence } from './RuleFields';

export function ProgramFields({
  data,
  sessionId,
  busy,
  make,
  onChange,
}: {
  data: ProgramDraft;
  sessionId: string;
  busy: boolean;
  make: (use: (id: string) => void) => void;
  onChange: (data: ProgramDraft) => void;
}) {
  return (
    <>
      <EditorField
        label="Program name"
        required
        maxLength={120}
        value={data.name}
        onChange={(e) => onChange({ ...data, name: e.target.value })}
      />
      <label className="editor-field">
        <span>Input field</span>
        <select
          value={data.input}
          onChange={(e) =>
            onChange({
              ...data,
              input: e.target.value === 'lemma' ? 'lemma' : 'pronunciation',
            })
          }
        >
          <option value="lemma">Saved lemma</option>
          <option value="pronunciation">Saved free-form pronunciation</option>
        </select>
      </label>
      <p className="field-description">
        Rules use exact Unicode graphemes. Linked phoneme sequences and
        custom-script documents are unchanged. Select free-form pronunciation
        for sound sequences; no automatic conversion or normalization is
        performed.
      </p>
      <label className="editor-field">
        <span>Program notes</span>
        <textarea
          maxLength={4000}
          rows={3}
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </label>
      <details>
        <summary>Features and values ({data.features.length})</summary>
        <p className="field-description">
          Define this program’s grammatical categories. Cells refer to stable
          feature/value identities. Descriptive Grammar sections remain
          independent.
        </p>
        {data.features.map((f, i) => (
          <section
            className="automation-definition"
            key={f.id}
            aria-label={'Feature ' + (i + 1)}
          >
            <EditorField
              label="Feature name"
              required
              maxLength={120}
              value={f.name}
              onChange={(e) =>
                onChange({
                  ...data,
                  features: data.features.map((v, n) =>
                    n === i ? { ...f, name: e.target.value } : v,
                  ),
                })
              }
            />
            {f.values.map((v, j) => (
              <div className="automation-row" key={v.id}>
                <EditorField
                  label={'Value ' + (j + 1)}
                  required
                  maxLength={120}
                  value={v.label}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      features: data.features.map((x, n) =>
                        n === i
                          ? {
                              ...f,
                              values: f.values.map((y, k) =>
                                k === j ? { ...v, label: e.target.value } : y,
                              ),
                            }
                          : x,
                      ),
                    })
                  }
                />
                <OutlineButton
                  onClick={() =>
                    onChange({
                      ...data,
                      features: data.features.map((x, n) =>
                        n === i
                          ? { ...f, values: f.values.filter((_, k) => k !== j) }
                          : x,
                      ),
                    })
                  }
                >
                  Remove value {j + 1}
                </OutlineButton>
              </div>
            ))}
            <div className="dialog-actions">
              <OutlineButton
                disabled={f.values.length >= 16}
                onClick={() =>
                  make((id) =>
                    onChange({
                      ...data,
                      features: data.features.map((x, n) =>
                        n === i
                          ? { ...f, values: [...f.values, { id, label: '' }] }
                          : x,
                      ),
                    }),
                  )
                }
              >
                Add value
              </OutlineButton>
              <OutlineButton
                onClick={() =>
                  onChange({
                    ...data,
                    features: data.features.filter((_, n) => n !== i),
                  })
                }
              >
                Remove feature {i + 1}
              </OutlineButton>
            </div>
          </section>
        ))}
        <OutlineButton
          disabled={data.features.length >= 16}
          onClick={() =>
            make((id) =>
              onChange({
                ...data,
                features: [...data.features, { id, name: '', values: [] }],
              }),
            )
          }
        >
          Add feature
        </OutlineButton>
      </details>
      <details>
        <summary>Grapheme classes ({data.classes.length})</summary>
        <p className="field-description">
          Enter one complete grapheme per line. Classes support adjacent
          sound-change conditions and phonotactic patterns; they do not infer
          phoneme features.
        </p>
        {data.classes.map((c, i) => (
          <section className="automation-definition" key={c.id}>
            <EditorField
              label={'Class name ' + (i + 1)}
              required
              maxLength={120}
              value={c.name}
              onChange={(e) =>
                onChange({
                  ...data,
                  classes: data.classes.map((v, n) =>
                    n === i ? { ...c, name: e.target.value } : v,
                  ),
                })
              }
            />
            <label className="editor-field">
              <span>{'Class members ' + (i + 1)}</span>
              <textarea
                rows={4}
                maxLength={8192}
                value={c.members.join('\n')}
                onChange={(e) =>
                  onChange({
                    ...data,
                    classes: data.classes.map((v, n) =>
                      n === i
                        ? { ...c, members: e.target.value.split('\n') }
                        : v,
                    ),
                  })
                }
              />
            </label>
            <OutlineButton
              onClick={() =>
                onChange({
                  ...data,
                  classes: data.classes.filter((_, n) => n !== i),
                })
              }
            >
              Remove class {i + 1}
            </OutlineButton>
          </section>
        ))}
        <OutlineButton
          disabled={data.classes.length >= 32}
          onClick={() =>
            make((id) =>
              onChange({
                ...data,
                classes: [...data.classes, { id, name: '', members: [] }],
              }),
            )
          }
        >
          Add class
        </OutlineButton>
      </details>
      <details open>
        <summary>Reusable rules ({data.rules.length})</summary>
        <p className="field-description">
          Define operations here, then choose their order in each cell. Removing
          a rule retains references so you can resolve them explicitly before
          saving.
        </p>
        {data.rules.map((r, i) => (
          <section
            className="automation-definition"
            key={r.id}
            aria-label={'Rule ' + (i + 1)}
          >
            <RuleFields
              rule={r}
              rules={data.rules}
              classes={data.classes}
              onChange={(rule) =>
                onChange({
                  ...data,
                  rules: data.rules.map((v, n) => (n === i ? rule : v)),
                })
              }
            />
            <OutlineButton
              onClick={() =>
                onChange({
                  ...data,
                  rules: data.rules.filter((_, n) => n !== i),
                })
              }
            >
              Remove rule {i + 1}
            </OutlineButton>
          </section>
        ))}
        <OutlineButton
          disabled={data.rules.length >= 64}
          onClick={() =>
            make((id) =>
              onChange({
                ...data,
                rules: [
                  ...data.rules,
                  {
                    id,
                    name: '',
                    operation: { kind: 'affix', prefix: '', suffix: '' },
                  },
                ],
              }),
            )
          }
        >
          Add rule
        </OutlineButton>
      </details>
      <details open>
        <summary>Paradigm cells ({data.cells.length})</summary>
        {data.cells.map((c, i) => (
          <section
            className="automation-definition"
            key={c.id}
            aria-label={'Cell ' + (i + 1)}
          >
            <EditorField
              label="Cell name"
              required
              maxLength={120}
              value={c.name}
              onChange={(e) =>
                onChange({
                  ...data,
                  cells: data.cells.map((v, n) =>
                    n === i ? { ...c, name: e.target.value } : v,
                  ),
                })
              }
            />
            <label className="editor-field">
              <span>Cell kind</span>
              <select
                value={c.kind}
                onChange={(e) =>
                  onChange({
                    ...data,
                    cells: data.cells.map((v, n) =>
                      n === i
                        ? {
                            ...c,
                            kind:
                              e.target.value === 'derivation'
                                ? 'derivation'
                                : 'inflection',
                          }
                        : v,
                    ),
                  })
                }
              >
                <option value="inflection">Inflection</option>
                <option value="derivation">Derivation</option>
              </select>
            </label>
            {c.features.map((a, j) => {
              const f = data.features.find((f) => f.id === a.featureId);
              return (
                <div className="automation-row" key={j}>
                  <Choice
                    label={'Feature ' + (j + 1)}
                    value={a.featureId}
                    choices={data.features}
                    onChange={(featureId) =>
                      onChange({
                        ...data,
                        cells: data.cells.map((v, n) =>
                          n === i
                            ? {
                                ...c,
                                features: c.features.map((x, k) =>
                                  k === j
                                    ? {
                                        featureId,
                                        valueId:
                                          data.features.find(
                                            (f) => f.id === featureId,
                                          )?.values[0]?.id ?? '',
                                      }
                                    : x,
                                ),
                              }
                            : v,
                        ),
                      })
                    }
                  />
                  <Choice
                    label={'Feature value ' + (j + 1)}
                    value={a.valueId}
                    choices={
                      f?.values.map((v) => ({ id: v.id, name: v.label })) ?? []
                    }
                    onChange={(valueId) =>
                      onChange({
                        ...data,
                        cells: data.cells.map((v, n) =>
                          n === i
                            ? {
                                ...c,
                                features: c.features.map((x, k) =>
                                  k === j ? { ...a, valueId } : x,
                                ),
                              }
                            : v,
                        ),
                      })
                    }
                  />
                  <OutlineButton
                    onClick={() =>
                      onChange({
                        ...data,
                        cells: data.cells.map((v, n) =>
                          n === i
                            ? {
                                ...c,
                                features: c.features.filter((_, k) => k !== j),
                              }
                            : v,
                        ),
                      })
                    }
                  >
                    Remove assignment {j + 1}
                  </OutlineButton>
                </div>
              );
            })}
            <OutlineButton
              disabled={
                c.features.length >= 16 ||
                !data.features.some(
                  (f) =>
                    f.values.length &&
                    !c.features.some((a) => a.featureId === f.id),
                )
              }
              onClick={() => {
                const f = data.features.find(
                  (f) =>
                    f.values.length &&
                    !c.features.some((a) => a.featureId === f.id),
                );
                if (f?.values[0])
                  onChange({
                    ...data,
                    cells: data.cells.map((v, n) =>
                      n === i
                        ? {
                            ...c,
                            features: [
                              ...c.features,
                              { featureId: f.id, valueId: f.values[0]!.id },
                            ],
                          }
                        : v,
                    ),
                  });
              }}
            >
              Add feature assignment
            </OutlineButton>
            <RuleSequence
              value={c.rules}
              choices={data.rules}
              onChange={(rules) =>
                onChange({
                  ...data,
                  cells: data.cells.map((v, n) =>
                    n === i ? { ...c, rules } : v,
                  ),
                })
              }
            />
            <OutlineButton
              onClick={() =>
                onChange({
                  ...data,
                  cells: data.cells.filter((_, n) => n !== i),
                })
              }
            >
              Remove cell {i + 1}
            </OutlineButton>
          </section>
        ))}
        <OutlineButton
          disabled={data.cells.length >= 32}
          onClick={() =>
            make((id) =>
              onChange({
                ...data,
                cells: [
                  ...data.cells,
                  { id, name: '', kind: 'inflection', features: [], rules: [] },
                ],
              }),
            )
          }
        >
          Add paradigm cell
        </OutlineButton>
      </details>
      <details>
        <summary>Irregular overrides ({data.overrides.length})</summary>
        <p className="field-description">
          An entry/cell override replaces its whole regular derivation. A reason
          is required and retained with generated results.
        </p>
        {data.overrides.map((o, i) => (
          <section
            className="automation-definition"
            key={i}
            aria-label={'Override ' + (i + 1)}
          >
            <ReferencePicker
              label="Override entry"
              sessionId={sessionId}
              disabled={busy}
              value={o.entryId || null}
              onChange={(entryId) =>
                onChange({
                  ...data,
                  overrides: data.overrides.map((v, n) =>
                    n === i ? { ...o, entryId: entryId ?? '' } : v,
                  ),
                })
              }
            />
            <Choice
              label="Override cell"
              value={o.cellId}
              choices={data.cells}
              onChange={(cellId) =>
                onChange({
                  ...data,
                  overrides: data.overrides.map((v, n) =>
                    n === i ? { ...o, cellId } : v,
                  ),
                })
              }
            />
            <EditorField
              label="Irregular output"
              required
              maxLength={512}
              value={o.output}
              onChange={(e) =>
                onChange({
                  ...data,
                  overrides: data.overrides.map((v, n) =>
                    n === i ? { ...o, output: e.target.value } : v,
                  ),
                })
              }
            />
            <label className="editor-field">
              <span>Override reason</span>
              <textarea
                required
                rows={2}
                maxLength={1000}
                value={o.reason}
                onChange={(e) =>
                  onChange({
                    ...data,
                    overrides: data.overrides.map((v, n) =>
                      n === i ? { ...o, reason: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
            <OutlineButton
              onClick={() =>
                onChange({
                  ...data,
                  overrides: data.overrides.filter((_, n) => n !== i),
                })
              }
            >
              Remove override {i + 1}
            </OutlineButton>
          </section>
        ))}
        <OutlineButton
          disabled={data.overrides.length >= 128 || !data.cells.length}
          onClick={() =>
            onChange({
              ...data,
              overrides: [
                ...data.overrides,
                {
                  entryId: '',
                  cellId: data.cells[0]!.id,
                  output: '',
                  reason: '',
                },
              ],
            })
          }
        >
          Add irregular override
        </OutlineButton>
      </details>
      <details>
        <summary>Phonotactic patterns ({data.phonotactics.length})</summary>
        <p className="field-description">
          Alternatives match the entire generated word. Each class slot repeats
          within its bounds. With no patterns, results are labeled Not checked.
        </p>
        {data.phonotactics.map((p, i) => (
          <section className="automation-definition" key={p.id}>
            <EditorField
              label={'Pattern name ' + (i + 1)}
              required
              maxLength={120}
              value={p.name}
              onChange={(e) =>
                onChange({
                  ...data,
                  phonotactics: data.phonotactics.map((v, n) =>
                    n === i ? { ...p, name: e.target.value } : v,
                  ),
                })
              }
            />
            {p.slots.map((s, j) => (
              <div className="automation-piece" key={j}>
                <Choice
                  label={'Pattern class ' + (j + 1)}
                  value={s.classId}
                  choices={data.classes}
                  onChange={(classId) =>
                    onChange({
                      ...data,
                      phonotactics: data.phonotactics.map((v, n) =>
                        n === i
                          ? {
                              ...p,
                              slots: p.slots.map((x, k) =>
                                k === j ? { ...s, classId } : x,
                              ),
                            }
                          : v,
                      ),
                    })
                  }
                />
                <div className="automation-grid">
                  {(['min', 'max'] as const).map((key) => (
                    <EditorField
                      key={key}
                      label={key + ' repetitions ' + (j + 1)}
                      required
                      type="number"
                      min={0}
                      max={8}
                      step={1}
                      value={Number.isFinite(s[key]) ? s[key] : ''}
                      onChange={(e) =>
                        onChange({
                          ...data,
                          phonotactics: data.phonotactics.map((v, n) =>
                            n === i
                              ? {
                                  ...p,
                                  slots: p.slots.map((x, k) =>
                                    k === j
                                      ? { ...s, [key]: e.target.valueAsNumber }
                                      : x,
                                  ),
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
                <div className="dialog-actions">
                  <OutlineButton
                    disabled={j === 0}
                    onClick={() => {
                      const slots = [...p.slots];
                      [slots[j - 1], slots[j]] = [slots[j]!, slots[j - 1]!];
                      onChange({
                        ...data,
                        phonotactics: data.phonotactics.map((v, n) =>
                          n === i ? { ...p, slots } : v,
                        ),
                      });
                    }}
                  >
                    Move slot {j + 1} earlier
                  </OutlineButton>
                  <OutlineButton
                    onClick={() =>
                      onChange({
                        ...data,
                        phonotactics: data.phonotactics.map((v, n) =>
                          n === i
                            ? { ...p, slots: p.slots.filter((_, k) => k !== j) }
                            : v,
                        ),
                      })
                    }
                  >
                    Remove slot {j + 1}
                  </OutlineButton>
                </div>
              </div>
            ))}
            <div className="dialog-actions">
              <OutlineButton
                disabled={p.slots.length >= 16 || !data.classes.length}
                onClick={() =>
                  onChange({
                    ...data,
                    phonotactics: data.phonotactics.map((v, n) =>
                      n === i
                        ? {
                            ...p,
                            slots: [
                              ...p.slots,
                              { classId: data.classes[0]!.id, min: 1, max: 1 },
                            ],
                          }
                        : v,
                    ),
                  })
                }
              >
                Add class slot
              </OutlineButton>
              <OutlineButton
                onClick={() =>
                  onChange({
                    ...data,
                    phonotactics: data.phonotactics.filter((_, n) => n !== i),
                  })
                }
              >
                Remove pattern {i + 1}
              </OutlineButton>
            </div>
          </section>
        ))}
        <OutlineButton
          disabled={data.phonotactics.length >= 16}
          onClick={() =>
            make((id) =>
              onChange({
                ...data,
                phonotactics: [
                  ...data.phonotactics,
                  { id, name: '', slots: [] },
                ],
              }),
            )
          }
        >
          Add phonotactic pattern
        </OutlineButton>
      </details>
      <details>
        <summary>Inspect dependencies</summary>
        <ul>
          {data.rules.map((r) => (
            <li key={r.id}>
              {r.name || 'Unnamed rule'}
              {r.operation.kind === 'call'
                ? ' → ' +
                  (data.rules.find(
                    (v) =>
                      r.operation.kind === 'call' &&
                      v.id === r.operation.ruleId,
                  )?.name || 'Missing rule')
                : ' · ' + r.operation.kind}
            </li>
          ))}
        </ul>
        <ul>
          {data.cells.map((c) => (
            <li key={c.id}>
              {c.name || 'Unnamed cell'}:{' '}
              {c.rules
                .map(
                  (id) =>
                    data.rules.find((r) => r.id === id)?.name || 'Missing rule',
                )
                .join(' → ') || 'Unchanged input'}
            </li>
          ))}
        </ul>
        <p className="field-description">
          Save validates all references and rejects cycles, including unused
          rules. Generated batches retain their original program revision when
          these definitions change.
        </p>
      </details>
    </>
  );
}
