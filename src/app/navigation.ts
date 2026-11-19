import {
  AudioLines,
  BookOpen,
  FileText,
  FolderOpen,
  GitBranch,
  House,
  PenTool,
  Settings2,
  Type,
  type LucideIcon,
} from 'lucide-react';

export type ModuleId =
  | 'phonology'
  | 'lexicon'
  | 'grammar'
  | 'scripts'
  | 'documents'
  | 'resources'
  | 'fonts'
  | 'automation';

export type PageId = 'home' | ModuleId | 'settings';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  description: string;
  part: number;
  capabilities: readonly string[];
}

// Product navigation, not linguistic data. No demo languages or invented counts.
export const modules: readonly ModuleDefinition[] = [
  {
    id: 'phonology',
    label: 'Phonology',
    icon: AudioLines,
    eyebrow: 'THE SOUND OF A LANGUAGE',
    description:
      'Give your language a sound of its own. Define its phonemes, arrange its inventory, and describe how sounds belong together.',
    part: 4,
    capabilities: [
      'Phoneme inventories',
      'IPA and articulatory features',
      'Links to lexical pronunciations',
    ],
  },
  {
    id: 'lexicon',
    label: 'Lexicon',
    icon: BookOpen,
    eyebrow: 'WORDS AND THEIR CONNECTIONS',
    description:
      'Build a vocabulary with depth. Keep meanings, pronunciations, roots, and the relationships between words in one place.',
    part: 3,
    capabilities: [
      'Searchable lexical entries',
      'Definitions and language-specific categories',
      'Roots and related words',
    ],
  },
  {
    id: 'grammar',
    label: 'Grammar',
    icon: GitBranch,
    eyebrow: 'STRUCTURE AND EXPRESSION',
    description:
      'Describe how your language works, on its own terms. Organize grammatical features, examples, and the rules that connect them.',
    part: 6,
    capabilities: [
      'Structured grammar sections',
      'Language-defined features',
      'Examples linked to the lexicon',
    ],
  },
  {
    id: 'scripts',
    label: 'Writing systems',
    icon: PenTool,
    eyebrow: 'MAKE LANGUAGE VISIBLE',
    description:
      'Create a written identity for your language. Connect characters, glyphs, and sounds without tying a character to a single shape.',
    part: 5,
    capabilities: [
      'Characters with stable identities',
      'Glyph assets and transliterations',
      'In-app keyboard mappings',
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    eyebrow: 'PUT YOUR LANGUAGE TO WORK',
    description:
      'Move from individual words to living texts. Write in your own alphabet and keep documents connected to your language.',
    part: 6,
    capabilities: [
      'Project documents',
      'Custom-script writing',
      'Transliteration and lexical references',
    ],
  },
  {
    id: 'fonts',
    label: 'Fonts & shaping',
    icon: Type,
    eyebrow: 'TYPE AND SHAPING LAB',
    description:
      'Build experimental fonts from saved outlines and inspect contextual forms, ligatures and mark positioning.',
    part: 8,
    capabilities: [
      'Explicit font metrics and mappings',
      'Experimental OpenType shaping',
      'TrueType export',
    ],
  },
  {
    id: 'automation',
    label: 'Rules & analysis',
    icon: GitBranch,
    eyebrow: 'MORPHOLOGY AND SOUND CHANGE',
    description:
      'Define bounded derivations, inspect sound changes and preserve the provenance of generated forms.',
    part: 9,
    capabilities: [
      'Feature bundles and paradigm cells',
      'Ordered rules and phonotactic checks',
      'Previewed generation and reversible batches',
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    icon: FolderOpen,
    eyebrow: 'EVERYTHING IN ITS PLACE',
    description:
      'Project storage keeps managed assets together. A dedicated browser for those resources remains planned.',
    part: 5,
    capabilities: [
      'Browse script resources',
      'Inspect glyph and font assets',
      'Find linked writing-system resources',
    ],
  },
];

export const navigation: readonly {
  id: PageId;
  label: string;
  icon: LucideIcon;
}[] = [{ id: 'home', label: 'Overview', icon: House }, ...modules];

export function pageLabel(page: PageId): string {
  return page === 'settings'
    ? 'Preferences'
    : (navigation.find((item) => item.id === page)?.label ?? 'Overview');
}

export const settingsNavigation = {
  id: 'settings',
  label: 'Preferences',
  icon: Settings2,
} as const;
