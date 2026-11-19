# LingForge roadmap status

Updated 2026-11-19. All ten authorized parts have source implementations. Execution was authorized on 2026-11-17. The current work is validation and necessary fixes, not a new numbered feature part.

| Part | Scope                 | Current disposition                                                                                                               |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Desktop foundation    | Linux builds, browser checks and bounded native shell checks passed; Windows pending.                                             |
| 2    | Projects and recovery | Storage tests and basic native project/save/backup/close checks passed; full native recovery/transfer pending.                    |
| 3    | Lexicon               | Domain/storage/frontend and bounded native lexical workflows passed; complete transfer/UI acceptance pending.                     |
| 4    | Phonology             | Domain/storage and bounded native linked-pronunciation checks passed; full acceptance pending.                                    |
| 5    | Alphabet experiment   | Bounded Linux mappings/selection/clipboard/persistence passed; IME/framework and Windows gate open.                               |
| 6    | Documents and grammar | Experimental; automated checks passed, full native workflow acceptance pending.                                                   |
| 7    | Glyph authoring       | Experimental; automated checks and numeric native edit/persistence passed; pointer/drawing acceptance pending.                    |
| 8    | Fonts and shaping     | Experimental; automated checks and basic native font build/load/profile reload passed; broader shaping/export acceptance pending. |
| 9    | Linguistic automation | Experimental; automated checks passed; native generation/reversal acceptance pending.                                             |
| 10   | Release preparation   | Linux candidate built and 34 native checks passed; Windows/installers/distribution acceptance pending.                            |

No entire cross-platform milestone is declared accepted. Parts 5–9 remain experimental until the native gates pass. Linux and Windows are required; macOS is outside scope.

The [single guide](docs/GUIDE.md) owns feature descriptions, [results](docs/GUIDE.md#verified-results), [remaining acceptance](docs/GUIDE.md#remaining-acceptance) and [programs by part](docs/GUIDE.md#programs-by-part). Exact contracts and acceptance protocols are linked there.

Separate user-authorized work: a static download website in `website/`, prepared for GitHub Pages, and generated-file cleanup. This does not add an application roadmap part or waive release acceptance.
