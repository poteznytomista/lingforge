# Bundled font notices

The application bundles font assets locally through these exact npm packages:

| Font | Package | License notice |
| --- | --- | --- |
| Space Grotesk | `@fontsource/space-grotesk@5.3.0` | `space-grotesk-LICENSE` |
| IBM Plex Mono | `@fontsource/ibm-plex-mono@5.3.0` | `ibm-plex-mono-LICENSE` |
| Noto Sans | `@fontsource/noto-sans@5.3.0` | `noto-sans-LICENSE` |

These notices were copied verbatim from the packages' `LICENSE` files. All three packages declare SIL Open Font License 1.1. Retain the notices and original copyright statements when distributing font assets. Fonts are unmodified; LingForge uses selected CSS subsets and weights supplied by the packages.

This directory is copied with Vite's public assets into the production frontend bundle. Dependency-wide notices and any additional fonts must be reviewed before public distribution.


Part 8 also includes direct font-tool library notices in [font-tools/README.md](font-tools/README.md). Those libraries do not contribute glyph artwork to exported fonts. The eventual resolved dependency graph still needs a complete redistribution audit before public release.
