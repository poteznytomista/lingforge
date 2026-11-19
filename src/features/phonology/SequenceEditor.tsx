import { useState } from 'react';
import type {
  PhonemeSummary,
  PronunciationSegment,
} from '../../bridge/phonology';
import { EditorField, OutlineButton } from '../../components/primitives';

export function SequenceEditor({
  label,
  segments,
  phonemes,
  disabled,
  onChange,
}: {
  label: string;
  segments: PronunciationSegment[];
  phonemes: PhonemeSummary[] | null;
  disabled: boolean;
  onChange: (segments: PronunciationSegment[]) => void;
}) {
  const [choice, setChoice] = useState('');
  const labels = new Map(
    phonemes?.map((phoneme) => [phoneme.id, phoneme.label]),
  );
  const move = (index: number, direction: number) => {
    const copy = [...segments];
    const item = copy.splice(index, 1)[0];
    if (item) copy.splice(index + direction, 0, item);
    onChange(copy);
  };
  const render = (segment: PronunciationSegment) =>
    segment.kind === 'text'
      ? segment.text
      : `${labels.get(segment.phonemeId) ?? (phonemes ? '[missing phoneme]' : '[loading]')}${segment.annotation}`;
  return (
    <section className="sequence-editor" aria-label={label}>
      <h4>{label}</h4>
      <p className="field-description">
        Ordered phoneme links and literal annotations. Linked labels update when
        the inventory changes; free-form pronunciation text stays independent.
      </p>
      <p
        className="sequence-preview language-text"
        aria-label={`${label} preview`}
      >
        {segments.length ? segments.map(render).join('') : 'No linked sequence'}
      </p>
      <ol>
        {segments.map((segment, index) => (
          <li key={index}>
            {segment.kind === 'phoneme' ? (
              <>
                <span className="segment-label language-text">
                  /
                  {labels.get(segment.phonemeId) ??
                    (phonemes ? 'Missing phoneme' : 'Loading…')}
                  /
                </span>
                <EditorField
                  label={`${label} segment ${index + 1} annotation`}
                  value={segment.annotation}
                  maxLength={256}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      segments.map((item, position) =>
                        position === index
                          ? { ...segment, annotation: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </>
            ) : (
              <EditorField
                label={`${label} segment ${index + 1} text`}
                value={segment.text}
                required
                maxLength={256}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    segments.map((item, position) =>
                      position === index
                        ? { ...segment, text: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            )}
            <div className="project-action-row">
              <OutlineButton
                disabled={disabled || index === 0}
                aria-label={`Move ${label} segment ${index + 1} earlier`}
                onClick={() => move(index, -1)}
              >
                Earlier
              </OutlineButton>
              <OutlineButton
                disabled={disabled || index === segments.length - 1}
                aria-label={`Move ${label} segment ${index + 1} later`}
                onClick={() => move(index, 1)}
              >
                Later
              </OutlineButton>
              <OutlineButton
                disabled={disabled}
                aria-label={`Remove ${label} segment ${index + 1}`}
                onClick={() =>
                  onChange(segments.filter((_, position) => position !== index))
                }
              >
                Remove
              </OutlineButton>
            </div>
          </li>
        ))}
      </ol>
      <label className="editor-field">
        {label} phoneme
        <select
          disabled={disabled || !phonemes?.length}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Choose a phoneme</option>
          {phonemes?.map((phoneme) => (
            <option key={phoneme.id} value={phoneme.id}>
              {phoneme.label} · {phoneme.kind} · {phoneme.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <div className="project-action-row">
        <OutlineButton
          disabled={disabled || segments.length >= 256 || !labels.has(choice)}
          onClick={() =>
            onChange([
              ...segments,
              { kind: 'phoneme', phonemeId: choice, annotation: '' },
            ])
          }
        >
          Add phoneme segment
        </OutlineButton>
        <OutlineButton
          disabled={disabled || segments.length >= 256}
          onClick={() => onChange([...segments, { kind: 'text', text: '' }])}
        >
          Add literal segment
        </OutlineButton>
      </div>
    </section>
  );
}
