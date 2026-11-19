import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Plus, Save, Trash2 } from 'lucide-react';
import * as api from '../../bridge/phonology';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  EditorField,
  EmptyStateCard,
  OutlineButton,
  SectionHeader,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import type { EditorGuard } from '../projects/editorGuard';
import { PhonemeFields, ProfileFields } from './PhonologyEditors';
import { useInventory } from './useInventory';

type Editor =
  | {
      kind: 'phoneme';
      saved: api.PhonemeDetails | null;
      draft: api.PhonemeDraft;
    }
  | { kind: 'profile'; saved: api.PhonologyProfile; draft: api.PhonologyDraft };
const kinds = [
  { value: 'consonant', label: 'Consonants' },
  { value: 'vowel', label: 'Vowels' },
  { value: 'other', label: 'Other sounds' },
] as const;

export function PhonologyPage({
  workspace,
  onHome,
  onGuard,
  requestTransition,
  onOpenLexeme,
}: {
  workspace: WorkspaceController;
  onHome: () => void;
  onGuard: (guard: EditorGuard | null) => void;
  requestTransition: (action: () => Promise<unknown>) => void;
  onOpenLexeme: (id: string) => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const { run, apply, setNotice, setError } = workspace;
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<api.PhonemeKind>('consonant');
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<api.Phoneme | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inventory = useInventory(
    sessionId,
    workspace.active?.summary.revision,
    search,
  );
  const original =
    editor?.kind === 'phoneme'
      ? editor.saved?.phoneme.data
      : editor?.saved.data;
  const dirty =
    editor !== null &&
    JSON.stringify(editor.draft) !== JSON.stringify(original);
  const save = useCallback(async () => {
    if (!editor || !sessionId || !formRef.current) return false;
    if (!formRef.current.checkValidity()) {
      setError(
        'Complete the required phonology fields. Choose Keep editing to return to the editor.',
      );
      if (!document.querySelector('dialog[open]'))
        formRef.current.reportValidity();
      return false;
    }
    if (editor.kind === 'phoneme')
      return run(
        () =>
          api.savePhoneme(
            sessionId,
            editor.saved?.phoneme ?? null,
            editor.draft,
          ),
        (next) => {
          apply(next.workspace);
          setEditor({
            kind: 'phoneme',
            saved: next.details,
            draft: next.details.phoneme.data,
          });
          setNotice('Phoneme saved.');
        },
      );
    return run(
      () => api.saveProfile(sessionId, editor.saved.revision, editor.draft),
      (next) => {
        apply(next.workspace);
        setEditor({
          kind: 'profile',
          saved: next.profile,
          draft: next.profile.data,
        });
        setNotice('Phonology descriptions saved.');
      },
    );
  }, [editor, sessionId, run, apply, setNotice, setError]);
  const discard = useCallback(() => {
    setEditor((current) => {
      if (!current) return null;
      if (current.kind === 'profile')
        return { ...current, draft: current.saved.data };
      return current.saved
        ? { ...current, draft: current.saved.phoneme.data }
        : null;
    });
  }, []);
  useEffect(() => {
    onGuard({ dirty, save, discard });
  }, [onGuard, dirty, save, discard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  const select = (id: string) =>
    requestTransition(() =>
      run(
        () => api.loadPhoneme(sessionId, id),
        (saved) => {
          setEditor({ kind: 'phoneme', saved, draft: saved.phoneme.data });
        },
      ),
    );
  const visible =
    inventory.data?.phonemes.filter((phoneme) => phoneme.kind === kind) ?? [];
  const pageOffset = Math.min(
    offset,
    Math.max(0, Math.floor((visible.length - 1) / 50) * 50),
  );
  const columns: (keyof api.Articulation)[] =
    kind === 'consonant'
      ? ['place', 'manner', 'voicing']
      : kind === 'vowel'
        ? ['height', 'backness', 'rounding']
        : ['place', 'manner', 'voicing'];
  const selected = editor?.kind === 'phoneme' ? editor.saved : null;

  return (
    <div className="phonology-page">
      <SectionHeader
        eyebrow="THE SOUND OF A LANGUAGE"
        title="Phonology"
        description="Define sounds, describe their patterns, and connect them to words."
      >
        {sessionId && (
          <div className="project-action-row">
            <OutlineButton
              disabled={
                workspace.busy || !inventory.data || editor?.kind === 'profile'
              }
              onClick={() =>
                requestTransition(async () => {
                  const profile = inventory.data?.profile;
                  if (profile) {
                    workspace.clearMessages();
                    setEditor({
                      kind: 'profile',
                      saved: profile,
                      draft: profile.data,
                    });
                  }
                })
              }
            >
              Syllables & phonotactics
            </OutlineButton>
            <OutlineButton
              icon={Plus}
              tone="accent"
              disabled={workspace.busy}
              onClick={() =>
                requestTransition(async () => {
                  workspace.clearMessages();
                  setEditor({
                    kind: 'phoneme',
                    saved: null,
                    draft: { ...api.blankPhoneme(), kind },
                  });
                })
              }
            >
              New phoneme
            </OutlineButton>
          </div>
        )}
      </SectionHeader>
      {!sessionId ? (
        <EmptyStateCard icon={AudioLines} title="Open a language project">
          <p>
            Your sound inventory belongs to a project. Create or open one from
            the overview.
          </p>
          <OutlineButton onClick={onHome}>Back to overview</OutlineButton>
        </EmptyStateCard>
      ) : (
        <>
          <section
            className="workspace-card inventory-panel"
            aria-label="Sound inventory"
          >
            <div className="inventory-heading">
              <h2>Sound inventory</h2>
              <span className="mono-label" role="status">
                {inventory.data
                  ? `${inventory.data.total} PHONEMES`
                  : inventory.error
                    ? 'UNAVAILABLE'
                    : 'LOADING…'}
              </span>
            </div>
            <EditorField
              label="Search phonemes"
              value={search}
              maxLength={256}
              placeholder="Labels, articulatory features, notes…"
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
            <div className="project-action-row inventory-kinds">
              {kinds.map((item) => (
                <OutlineButton
                  key={item.value}
                  aria-pressed={kind === item.value}
                  tone={kind === item.value ? 'accent' : 'neutral'}
                  onClick={() => {
                    setKind(item.value);
                    setOffset(0);
                  }}
                >
                  {item.label}
                  {inventory.data
                    ? ` · ${inventory.data.phonemes.filter((phoneme) => phoneme.kind === item.value).length}`
                    : ''}
                </OutlineButton>
              ))}
            </div>
            {inventory.error && (
              <div role="alert" className="inline-error">
                <p>{inventory.error}</p>
                <OutlineButton onClick={inventory.retry}>
                  Retry inventory
                </OutlineButton>
              </div>
            )}
            {inventory.data &&
              (visible.length ? (
                <div className="inventory-scroll">
                  <table className="inventory-table">
                    <caption>
                      {kinds.find((item) => item.value === kind)?.label} — your
                      authored classifications
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Phoneme</th>
                        {columns.map((column) => (
                          <th key={column} scope="col">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible
                        .slice(pageOffset, pageOffset + 50)
                        .map((phoneme) => (
                          <tr
                            key={phoneme.id}
                            data-selected={selected?.phoneme.id === phoneme.id}
                          >
                            <th scope="row">
                              <button
                                type="button"
                                className="phoneme-link language-text"
                                disabled={workspace.busy}
                                onClick={() => select(phoneme.id)}
                                aria-label={`Inspect phoneme ${phoneme.label}`}
                              >
                                /{phoneme.label}/
                              </button>
                            </th>
                            {columns.map((column) => (
                              <td key={column}>
                                {phoneme.articulation[column] || 'Unspecified'}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="lexicon-empty">
                  {search
                    ? 'No sounds in this group match the search.'
                    : 'No sounds in this group yet. Add a phoneme to begin.'}
                </p>
              ))}
            <div className="lexicon-pagination">
              <OutlineButton
                disabled={!inventory.data || pageOffset === 0}
                onClick={() => setOffset(Math.max(0, pageOffset - 50))}
              >
                Previous sounds
              </OutlineButton>
              <span>
                {visible.length ? pageOffset + 1 : 0}–
                {Math.min(pageOffset + 50, visible.length)} / {visible.length}
              </span>
              <OutlineButton
                disabled={!inventory.data || pageOffset + 50 >= visible.length}
                onClick={() => setOffset(pageOffset + 50)}
              >
                Next sounds
              </OutlineButton>
            </div>
          </section>
          {editor ? (
            <section
              className="workspace-card phonology-editor"
              aria-label="Phonology editor"
            >
              <div className="lexicon-editor-heading">
                <div>
                  <p className="overline">
                    {editor.kind === 'phoneme'
                      ? 'SOUND IDENTITY'
                      : 'LANGUAGE PATTERNS'}
                  </p>
                  <h2 className="language-text">
                    {editor.kind === 'phoneme'
                      ? editor.saved?.phoneme.data.label || 'New phoneme'
                      : 'Syllables & phonotactics'}
                  </h2>
                </div>
                <span className="technical-badge">
                  {dirty ? 'UNSAVED' : 'SAVED'}
                </span>
              </div>
              {selected && <p className="entry-id">ID {selected.phoneme.id}</p>}
              <form
                ref={formRef}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <fieldset disabled={workspace.busy} className="project-fields">
                  {editor.kind === 'phoneme' ? (
                    <PhonemeFields
                      draft={editor.draft}
                      onChange={(draft) =>
                        setEditor((current) =>
                          current?.kind === 'phoneme'
                            ? { ...current, draft }
                            : current,
                        )
                      }
                    />
                  ) : (
                    <ProfileFields
                      draft={editor.draft}
                      onChange={(draft) =>
                        setEditor((current) =>
                          current?.kind === 'profile'
                            ? { ...current, draft }
                            : current,
                        )
                      }
                    />
                  )}
                </fieldset>
                <div className="entry-save-bar">
                  <OutlineButton
                    type="submit"
                    icon={Save}
                    tone="accent"
                    disabled={workspace.busy || !dirty}
                  >
                    {editor.kind === 'phoneme'
                      ? 'Save phoneme'
                      : 'Save descriptions'}
                  </OutlineButton>
                  <OutlineButton
                    disabled={workspace.busy || !dirty}
                    onClick={() =>
                      requestTransition(async () => setEditor(null))
                    }
                  >
                    Discard edits
                  </OutlineButton>
                  {selected && (
                    <OutlineButton
                      icon={Trash2}
                      disabled={
                        workspace.busy ||
                        selected.incomingCount > 0 ||
                        selected.scriptIncomingCount > 0
                      }
                      onClick={() => setDeleting(selected.phoneme)}
                    >
                      Delete phoneme
                    </OutlineButton>
                  )}
                </div>
              </form>
              {selected && (
                <section className="entry-section incoming-links">
                  <h3>Used in pronunciations · {selected.incomingCount}</h3>
                  <p className="field-description">
                    {selected.incomingCount
                      ? 'These entry or form pronunciations prevent deletion. Open a record to remove or replace its linked segments.'
                      : 'No lexical pronunciation references this phoneme.'}{' '}
                    Changing the label preserves its links.
                  </p>
                  <ul>
                    {selected.incoming.map((reference) => (
                      <li
                        key={`${reference.entryId}:${reference.formId ?? ''}`}
                      >
                        <button
                          type="button"
                          disabled={workspace.busy}
                          onClick={() => onOpenLexeme(reference.entryId)}
                        >
                          <span className="language-text">
                            {reference.lemma}
                            {reference.formId ? ` → ${reference.formText}` : ''}
                          </span>
                          <small>
                            {reference.formId ? 'Form' : 'Entry'} pronunciation
                            · {reference.occurrences} segment
                            {reference.occurrences === 1 ? '' : 's'}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {selected.incomingCount > 50 && (
                    <p className="field-description">
                      Showing the first 50 pronunciation references.
                    </p>
                  )}
                </section>
              )}
              {selected && selected.scriptIncomingCount > 0 && (
                <section className="entry-section">
                  <h3>
                    Writing-system characters · {selected.scriptIncomingCount}
                  </h3>
                  <p className="field-description">
                    These saved character associations also prevent deletion.
                    Open Writing systems to remove their phoneme links.
                  </p>
                  <ul>
                    {selected.scriptIncoming.map((reference) => (
                      <li
                        key={`${reference.scriptId}:${reference.characterId}`}
                      >
                        {reference.name} → {reference.characterName}
                      </li>
                    ))}
                  </ul>
                  {selected.scriptIncomingCount > 50 && (
                    <p>Showing the first 50 character references.</p>
                  )}
                </section>
              )}
            </section>
          ) : (
            <section className="workspace-card lexicon-detail-empty">
              <AudioLines size={30} aria-hidden="true" />
              <h2>Build the sound of your language</h2>
              <p>
                Select a phoneme to inspect its features and references. Add
                ordered phoneme segments from the lexicon editor.
              </p>
              <p className="field-description">
                Syllable patterns and allophone environments are descriptions.
                Rule execution and sound-change automation remain planned.
              </p>
            </section>
          )}
        </>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this phoneme?"
          busy={workspace.busy}
          onCancel={() => setDeleting(null)}
        >
          <p className="field-description">
            Delete /{deleting.data.label}/ and its owned allophone descriptions?
            Unsaved edits will be discarded. Linked pronunciations, script
            characters and grammar sections block deletion. A blocked deletion
            names a section to update in Grammar. A backup is created first.
          </p>
          {workspace.error && (
            <p className="inline-error" role="alert">
              {workspace.error}
            </p>
          )}
          <div className="dialog-actions">
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => setDeleting(null)}
            >
              Keep phoneme
            </OutlineButton>
            <OutlineButton
              tone="accent"
              disabled={workspace.busy}
              onClick={() =>
                void run(
                  () => api.deletePhoneme(sessionId, deleting),
                  (next) => {
                    apply(next);
                    setDeleting(null);
                    setEditor(null);
                    setNotice('Phoneme deleted.');
                  },
                )
              }
            >
              Delete phoneme
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
