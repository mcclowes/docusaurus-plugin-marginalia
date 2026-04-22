# Contributing to docusaurus-plugin-marginalia

Thanks for helping improve the plugin! This document explains how to work on
the project and what to expect from the contribution process.

## Code of Conduct

Be kind, inclusive, and constructive.

## Local development

```bash
git clone https://github.com/mcclowes/docusaurus-plugin-marginalia.git
cd docusaurus-plugin-marginalia
npm install
```

- `npm run build` – compile TypeScript and copy CSS into `dist/`
- `npm run watch` – rebuild on changes
- `npm test` – run unit tests (Vitest)
- `npm run typecheck` – TypeScript check
- `npm run lint` / `npm run format` – ESLint + Prettier

## Project layout

```text
src/
  index.ts                          # Package entry
  plugin.ts                         # Docusaurus plugin (Node side)
  types.ts                          # Public types
  theme/Marginalia/
    index.ts                        # Barrel export
    Marginalia.tsx                  # Container + provider
    Aside.tsx                       # Inline anchor + card registration
    Endpoint.tsx                    # Method + path chip
    MarginaliaContext.ts            # React context
    styles.module.css               # Scoped styles
    globalStyles.css                # Body-level layout overrides
    globalStylesLoader.ts           # Side-effect import for tsup copy emission
tests/
  setup.ts                          # Vitest setup (jest-dom matchers, cleanup)
  theme/Marginalia/                 # Vitest component tests
```

## Pull request process

1. Create a branch from `main`.
2. Keep changes focused; unrelated fixes should be separate PRs.
3. Update docs and tests when behaviour changes.
4. Run `npm run lint`, `npm run typecheck`, `npm test` before opening your PR.
5. Add a CHANGELOG entry under `[Unreleased]`.

## Shared docs site

User-facing changes should also be reflected in the shared documentation site
at `~/Development/docusaurus/docusaurus-plugins-docs/` (separate repo).

After any change that a consumer can observe — new option, changed default,
renamed export, new/removed hook, changed behavior — update both:

- `README.md` here (canonical API reference)
- `docs/marginalia/` in `docusaurus-plugins-docs`

Internal refactors, test-only changes, and build tweaks don't need docs-site
updates.

## License

By contributing, you agree that your contributions will be released under the
MIT License.
