# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
