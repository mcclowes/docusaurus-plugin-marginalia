# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Plugin option validation and a clear build-artifact error at plugin load time.
- `aria-label` prop on `<Aside>` for authors whose anchor content isn't plain text.
- `aria-describedby` wiring between the anchor `<button>` and its paired card (`role="note"`).
- `prefers-reduced-motion` support across CSS transitions, imperative animations, and scroll behaviour.
- Dark-mode aware endpoint method chip colors via `--marginalia-method-*` CSS variables.
- Print stylesheet that unfurls cards inline when printing.
- `MutationObserver`-based heading collection (picks up headings revealed by `<Tabs>` and collapsibles). Now includes H3.
- Integration tests for `<Marginalia>` (mount, body-class ref-counting, aria wiring, unregister) and `plugin.ts` path resolvers.

### Changed

- `<Aside>` anchor now renders as a real `<button>` instead of `<span role="button">` for native keyboard and assistive-tech behaviour.
- Published package now includes `src/` so `swizzle --typescript` works for consumers.
- Scroll handler is now rAF-throttled and bails out of progress-bar state updates on sub-0.5% changes.
- Card compaction heuristic picks the tallest overflow contributor (not the preceding card) and is bounded by a per-aside iteration cap.
- Body class (`marginalia-active`) is reference-counted, so multiple `<Marginalia>` instances on one page don't fight over it.

### Fixed

- `getTypeScriptThemePath` returning an invalid path for npm-installed consumers (`src/theme` was stripped by `.npmignore`).
- Release workflow no longer silently skips tag pushes (the `paths` filter previously blocked them).
- Removed dead defensive `try/catch` around `typeof __dirname` checks in plugin resolvers.
- Removed dead Babel config referencing a missing file and ESLint ignores for non-existent directories.

## [0.1.0]

### Added

- Initial release.
- `<Marginalia>` container providing two-column reading layout with sticky
  table of contents and scroll progress indicator.
- `<Aside>` inline anchor paired with a margin card; supports `anchor`,
  `title`, `kind`, `kindLabel`, `meta`, `cta`, `ctaHref` props.
- `<Endpoint>` inline method + path chip for API docs (GET / POST / PUT /
  PATCH / DELETE).
- Keyboard navigation (Enter / Space) and focus management on anchors.
- Responsive collapse below 1200px with native `title` tooltip fallback.
- Infima-variable-based theming with `--marginalia-*` override hooks.
