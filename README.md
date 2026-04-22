# docusaurus-plugin-marginalia

> Editorial sidenotes for Docusaurus. Inline anchors in prose pair with cards
> in the right margin that pack top-down, highlight as the reader scrolls, and
> collapse gracefully on narrow viewports.

## Install

```bash
npm install docusaurus-plugin-marginalia
```

Register the plugin in `docusaurus.config.js`:

```js
export default {
  plugins: ['docusaurus-plugin-marginalia'],
};
```

Or with options:

```js
export default {
  plugins: [['docusaurus-plugin-marginalia', { enabled: true }]],
};
```

### Plugin options

| Option    | Type      | Default | Notes                                                                                                           |
| --------- | --------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `enabled` | `boolean` | `true`  | When `false`, the theme path is still registered so `@theme/Marginalia` resolves, but global styles are skipped |

## Usage

Import the components from `@theme/Marginalia` in any MDX file and wrap prose
in `<Marginalia>` to enable the margin column:

```mdx
import { Marginalia, Aside, Endpoint } from '@theme/Marginalia';

<Marginalia>

The concept of <Aside anchor="pattern languages" kind="concept" title="Christopher Alexander" meta={["1977", "253 patterns"]}>_A Pattern Language_ catalogued 253 design patterns for towns and buildings.</Aside> has shaped software thinking.

Request a session with <Endpoint method="POST" path="/sessions" />.

</Marginalia>
```

## Components

### `<Marginalia>`

Container establishing the two-column reading layout. When mounted it toggles
`body.marginalia-active`, which hides Docusaurus's native TOC column so the
in-margin TOC and cards have room to breathe.

| Prop      | Type      | Default | Notes                                                      |
| --------- | --------- | ------- | ---------------------------------------------------------- |
| `showToc` | `boolean` | `true`  | Sticky "On this page" list + scroll progress bar in gutter |

### `<Aside>`

Inline anchor paired with a margin card.

| Prop        | Type        | Default             | Notes                                                                                                      |
| ----------- | ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `anchor`    | `ReactNode` | `children`          | Inline text in prose (if omitted, children is used)                                                        |
| `title`     | `string`    | —                   | Card heading                                                                                               |
| `kind`      | `AsideKind` | `'note'`            | One of `note`, `concept`, `warning`, `info`, `link`, `value`, `code`, `endpoint` — drives the swatch color |
| `kindLabel` | `string`    | derived from `kind` | Override the uppercase label                                                                               |
| `meta`      | `string[]`  | —                   | Pill tags shown below body                                                                                 |
| `cta`       | `string`    | —                   | Call-to-action text at bottom of card                                                                      |
| `ctaHref`   | `string`    | —                   | CTA href. If omitted, renders as `<span>`                                                                  |
| `children`  | `ReactNode` | —                   | Card body (when `anchor` is set) or inline anchor (when not)                                               |

### `<Endpoint>`

Inline method + path chip. Colors:

- `GET` — green
- `POST` — amber
- `PUT` / `PATCH` — accent
- `DELETE` — red

```mdx
<Endpoint method="POST" path="/users/{id}" />
```

| Prop       | Type         | Default | Notes                                      |
| ---------- | ------------ | ------- | ------------------------------------------ |
| `method`   | `HttpMethod` | `'GET'` | Uppercased automatically                   |
| `path`     | `string`     | —       | The URL path                               |
| `children` | `ReactNode`  | —       | Falls back when no `path` prop is provided |

## Behaviour

- Cards are absolutely positioned and packed top-down with a 10px gap.
- Scroll selects the anchor nearest 32% of viewport height and marks both sides `hot`.
- Hovering either side syncs the other. Clicking an anchor scrolls its card into view with a brief pulse.
- Keyboard accessible: anchors have `role="button"`, `tabindex="0"`, respond to Enter/Space.
- Below 1200px viewport width the margin column is hidden; anchors keep their native `title` tooltip.

## Theming

The plugin ships with defaults derived from Infima (Docusaurus's CSS variable
system). To customize, override any of the `--marginalia-*` variables on your
own CSS:

```css
:root {
  --marginalia-accent: #4f46e5;
  --marginalia-accent-soft: #eef2ff;
  --marginalia-accent-strong: #3730a3;
  --marginalia-danger: #dc2626;
  --marginalia-surface: #ffffff;
  --marginalia-border: #e5e7eb;
  --marginalia-text: #1f2937;
  --marginalia-heading: #111827;
  --marginalia-muted: #6b7280;
  --marginalia-font-mono: ui-monospace, monospace;
  --marginalia-font-serif: 'Iowan Old Style', Georgia, serif;
  --marginalia-navbar-offset: 60px;
}
```

Wrap overrides in `[data-theme='dark']` for dark-mode variants.

## Swizzling

The components are exposed under `@theme/Marginalia`, so any can be swizzled:

```bash
npm run swizzle docusaurus-plugin-marginalia Marginalia/Aside -- --eject
```

## License

MIT
