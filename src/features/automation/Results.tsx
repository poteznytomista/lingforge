import type { ProgramDraft, ResultRow } from '../../bridge/automation';

export function Results({
  rows,
  program,
  selected,
  disabled = false,
  onSelect,
}: {
  rows: ResultRow[];
  program: ProgramDraft;
  selected?: number[];
  disabled?: boolean;
  onSelect?: (indices: number[]) => void;
}) {
  return (
    <div className="automation-results">
      {rows.map((row, i) => {
        const cell = program.cells.find((c) => c.id === row.cellId);
        const result = row.evaluation;
        const eligible =
          result !== null && row.error === null && row.conflicts.length === 0;
        return (
          <section
            className="automation-result"
            key={row.source.entryId + row.cellId}
            aria-label={'Result ' + (i + 1)}
          >
            <h3>
              {row.source.lemma} · {cell?.name ?? 'Missing cell'}
            </h3>
            <span className="technical-badge">
              {cell?.kind ?? 'Unknown kind'} ·{' '}
              {result?.irregularReason ? 'IRREGULAR' : 'GENERATED'}
            </span>
            {selected && onSelect && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  aria-label={'Select result ' + (i + 1)}
                  disabled={disabled || !eligible}
                  checked={selected.includes(i)}
                  onChange={(e) =>
                    onSelect(
                      e.target.checked
                        ? [...selected, i]
                        : selected.filter((n) => n !== i),
                    )
                  }
                />
                Apply this result
              </label>
            )}
            <p className="language-text">
              <span>{row.source.input || '(empty input)'}</span> →{' '}
              <strong>{result?.output ?? 'No output'}</strong>
            </p>
            <p className="field-description">
              {cell?.features
                .map((a) => {
                  const f = program.features.find((f) => f.id === a.featureId);
                  return (
                    (f?.name ?? 'Missing feature') +
                    ': ' +
                    (f?.values.find((v) => v.id === a.valueId)?.label ??
                      'Missing value')
                  );
                })
                .join(' · ') || 'No feature assignments'}
            </p>
            {row.error && <p className="inline-error">{row.error}</p>}
            {row.conflicts.map((c) => (
              <p className="inline-error" key={c}>
                {c}
              </p>
            ))}
            {result && (
              <>
                <p className="field-description">
                  Phonotactics:{' '}
                  {result.phonotactics === null
                    ? 'Not checked'
                    : result.phonotactics
                      ? 'Accepted by ' +
                        result.matchingPatterns
                          .map(
                            (id) =>
                              program.phonotactics.find((p) => p.id === id)
                                ?.name ?? 'Missing pattern',
                          )
                          .join(', ')
                      : 'Rejected by every configured pattern'}
                </p>
                <details>
                  <summary>Derivation and source</summary>
                  <p className="field-description">
                    Source entry revision {row.source.revision}. Input field:{' '}
                    {program.input === 'lemma'
                      ? 'lemma'
                      : 'free-form pronunciation'}
                    . Original source identity:{' '}
                    <code>{row.source.entryId}</code>.
                  </p>
                  {result.irregularReason ? (
                    <p>Irregular override: {result.irregularReason}</p>
                  ) : result.steps.length ? (
                    <ol>
                      {result.steps.map((s, n) => (
                        <li key={n}>
                          <strong>{s.name}</strong>
                          <p className="language-text">
                            {s.before || '(empty)'} → {s.after || '(empty)'}
                          </p>
                          <small className="field-description">
                            Rule <code>{s.ruleId}</code>
                          </small>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No operations; the source input is retained.</p>
                  )}
                </details>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
