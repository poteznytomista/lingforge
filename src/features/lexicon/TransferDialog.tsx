import { useState } from 'react';
import * as api from '../../bridge/lexicon';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { OutlineButton } from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';

const csvFields = [
  ['lemma', 'Lemma (required)'],
  ['definition', 'Definition (required)'],
  ['pronunciation', 'Pronunciation'],
  ['partOfSpeech', 'Part of speech'],
  ['notes', 'Notes'],
] as const;
function initialMapping(headers: string[]): api.CsvMapping {
  const index = (name: string) => {
    const found = headers.findIndex(
      (header) => header.trim().toLowerCase() === name,
    );
    return found < 0 ? null : found;
  };
  return {
    lemma: index('lemma') ?? -1,
    definition: index('definition') ?? -1,
    pronunciation: index('pronunciation'),
    partOfSpeech: index('part_of_speech'),
    notes: index('notes'),
  };
}

export function TransferDialog({
  mode,
  sessionId,
  workspace,
  onClose,
  onImported,
}: {
  mode: 'import' | 'export';
  sessionId: string;
  workspace: WorkspaceController;
  onClose: () => void;
  onImported: () => void;
}) {
  const [format, setFormat] = useState<api.TransferFormat>('json');
  const [source, setSource] = useState<api.SourceInfo | null>(null);
  const [mapping, setMapping] = useState<api.CsvMapping>({
    lemma: -1,
    definition: -1,
    pronunciation: null,
    partOfSpeech: null,
    notes: null,
  });
  const [policy, setPolicy] = useState<api.DuplicatePolicy>('reject');
  const [preview, setPreview] = useState<api.ImportPreview | null>(null);
  const { run, busy } = workspace;
  return (
    <ConfirmDialog
      title={mode === 'import' ? 'Import lexicon' : 'Export lexicon'}
      busy={busy}
      onCancel={onClose}
    >
      <fieldset className="project-fields" disabled={busy}>
        <label className="editor-field">
          Format
          <select
            value={format}
            onChange={(event) => {
              setFormat(event.target.value as api.TransferFormat);
              setSource(null);
              setPreview(null);
            }}
          >
            <option value="json">LingForge JSON — complete lexicon</option>
            <option value="csv">CSV — five text columns</option>
          </select>
        </label>
        <p className="field-description">
          JSON preserves entry identities, roots, individual senses, forms,
          notes, relationships, and linked pronunciations with the phonemes they
          reference. Files are limited to 16 MiB and projects to 20,000 entries.
        </p>
        {format === 'csv' && (
          <p className="transfer-warning">
            CSV includes lemma, pronunciation, part of speech, definitions, and
            notes only. Export joins definitions into one cell and omits roots,
            forms, links, etymology, sense notes, identifiers, pronunciation
            segments, and phoneme definitions. Reimport creates lexical entries
            with one sense. Use JSON for complete transfer. Spreadsheet programs
            may interpret text beginning with formula characters.
          </p>
        )}
        {mode === 'import' && (
          <>
            <OutlineButton
              onClick={() =>
                void run(
                  () => api.chooseImport(sessionId, format),
                  (next) => {
                    if (next) {
                      setSource(next);
                      setMapping(initialMapping(next.headers));
                      setPreview(null);
                    }
                  },
                )
              }
            >
              {source ? 'Choose another file' : 'Choose file'}
            </OutlineButton>
            {source && (
              <>
                <p className="field-description">
                  {source.name} · {source.count.toLocaleString()} entries
                </p>
                {format === 'csv' && (
                  <>
                    {csvFields.map(([key, label]) => (
                      <label key={key} className="editor-field">
                        {label}
                        <select
                          value={mapping[key] ?? -1}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setMapping({
                              ...mapping,
                              [key]:
                                value < 0 &&
                                key !== 'lemma' &&
                                key !== 'definition'
                                  ? null
                                  : value,
                            });
                            setPreview(null);
                          }}
                        >
                          <option value={-1}>
                            {key === 'lemma' || key === 'definition'
                              ? 'Choose a column'
                              : 'Not mapped'}
                          </option>
                          {source.headers.map((header, index) => (
                            <option value={index} key={index}>
                              {index + 1}. {header || '(empty header)'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <div className="transfer-table-scroll">
                      <table className="transfer-table">
                        <caption>
                          Source sample (first 5 rows; long cells shortened)
                        </caption>
                        <thead>
                          <tr>
                            {source.headers.map((header, index) => (
                              <th key={index} scope="col">
                                {header || `Column ${index + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {source.sampleRows.map((row, index) => (
                            <tr key={index}>
                              {row.map((cell, column) => (
                                <td key={column}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <label className="editor-field">
                  Duplicate handling
                  <select
                    value={policy}
                    onChange={(event) => {
                      setPolicy(event.target.value as api.DuplicatePolicy);
                      setPreview(null);
                    }}
                  >
                    <option value="reject">Reject duplicates</option>
                    <option value="keep_both">
                      Keep both as separate entries
                    </option>
                  </select>
                </label>
                <p className="field-description">
                  Duplicates match an ID, or the normalized lemma, category, and
                  kind. Existing entries are never overwritten. Unknown JSON
                  fields are rejected; unmapped CSV columns are reported in the
                  preview.
                </p>
                <OutlineButton
                  disabled={
                    format === 'csv' &&
                    (mapping.lemma < 0 || mapping.definition < 0)
                  }
                  onClick={() => {
                    setPreview(null);
                    void run(
                      () =>
                        api.previewImport(
                          sessionId,
                          source.token,
                          format === 'csv' ? mapping : null,
                          policy,
                        ),
                      setPreview,
                    );
                  }}
                >
                  Validate & preview
                </OutlineButton>
              </>
            )}
            {preview && (
              <section className="import-preview" aria-label="Import preview">
                <h3>{preview.count.toLocaleString()} entries ready to add</h3>
                {preview.warnings.map((warning) => (
                  <p className="transfer-warning" key={warning}>
                    {warning}
                  </p>
                ))}
                <ul>
                  {preview.sample.map((entry) => (
                    <li key={entry.id}>
                      <strong className="language-text">{entry.lemma}</strong>
                      <span>
                        {entry.kind} · {entry.partOfSpeech || 'Uncategorized'}
                      </span>
                      <p>{entry.definition}</p>
                    </li>
                  ))}
                </ul>
                <p className="field-description">
                  Showing up to 10 entries. All rows were validated. Apply adds
                  the complete import in one transaction after creating a
                  backup.
                </p>
              </section>
            )}
          </>
        )}
      </fieldset>
      {workspace.error && (
        <p role="alert" className="inline-error">
          {workspace.error}
        </p>
      )}
      <div className="dialog-actions">
        <OutlineButton disabled={busy} onClick={onClose}>
          Cancel
        </OutlineButton>
        {mode === 'import' ? (
          <OutlineButton
            tone="accent"
            disabled={busy || !preview}
            onClick={() => {
              if (preview)
                void run(
                  () => api.commitImport(sessionId, preview.token),
                  (next) => {
                    workspace.apply(next);
                    workspace.setNotice(
                      `${preview.count.toLocaleString()} entries imported.`,
                    );
                    onImported();
                    onClose();
                  },
                );
            }}
          >
            Apply import
          </OutlineButton>
        ) : (
          <OutlineButton
            tone="accent"
            disabled={busy}
            onClick={() =>
              void run(
                () => api.exportLexicon(sessionId, format),
                (path) => {
                  if (path) {
                    workspace.setNotice(`Lexicon exported to ${path}`);
                    onClose();
                  }
                },
              )
            }
          >
            Choose destination & export
          </OutlineButton>
        )}
      </div>
    </ConfirmDialog>
  );
}
