# ADR 0001: Desktop foundation

Historical design decision: authorization and execution statements below describe the decision date. Current requirements/results are maintained in the [guide](../GUIDE.md); execution has been authorized since 2026-11-17. The technical decisions remain applicable unless explicitly superseded.

Date: 2026-11-03. Status: accepted for implementation; runtime validation pending.

## Decision

Use Tauri 2, React, TypeScript, Rust, Vite, plain CSS design tokens, and a small domain crate. Preserve native window controls. Bundle fonts locally. Introduce no database, editor framework, global state library, or privileged plugin in part 1.

The source has a single read-only metadata command and explicit browser-preview behavior. Application preferences last only for the session. Navigation contains honest planned states until later parts provide working editors.

## Rationale

This matches the preferred stack and allows independent domain testing without embedding linguistic rules in components. Native controls reduce platform-specific window behavior. CSS is sufficient for the supplied design. A metadata command exercises the intended boundary without pretending that project persistence already exists.

Current official documentation confirms the platform prerequisite and webview differences. Package metadata was read to select exact direct dependencies. Successful dependency resolution, installation, and rendering remain unproven in this environment.

## Consequences

WebKitGTK and WebView2 require separate testing, especially when editing custom scripts. Browser Playwright checks supplement native checks. The mandatory text-editor experiment remains in part 5. A demonstrated fundamental limitation could justify reassessing Electron; no such evidence currently exists.

The local package-mirror failure means first-run formatting, lockfile generation, build verification, and native launch are deferred at the user's request. This is an explicit incomplete acceptance gate, not a technology decision to ship unverified software.

Sources: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Vite setup](https://vite.dev/guide/), [React versions](https://react.dev/versions), npm registry package metadata, and the official crates.io sparse index.
