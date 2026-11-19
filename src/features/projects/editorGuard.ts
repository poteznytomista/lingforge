export interface EditorGuard {
  dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}
