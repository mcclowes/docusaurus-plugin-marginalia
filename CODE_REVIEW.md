# Code review — `docusaurus-plugin-marginalia`

Reviewer: Principal engineer, onboarding.
Scope: full source tree at HEAD (`f8852c7`), ~1,360 LOC incl. tests.
Verdict: **promising idea, rough execution.** Core rendering logic has correctness, performance, and accessibility problems; packaging has latent breakage that only surfaces for published consumers; tests cover the easy components and skip the hard one.

This review is long on purpose — the ask was to educate juniors, so most findings include the _why_ and a suggested direction rather than a one-line complaint.

---

## 1. Architectural concerns

### 1.1 `Marginalia.tsx` is a 460-line god component

One file owns: context provider, aside registry, heading collector, scroll-spy, TOC renderer, scroll-progress bar, card positioning, compaction heuristic, connecting-line geometry, body-class side effect, and two child components. That is at least six distinct responsibilities. The blast radius of any change is the whole feature.

Split along the natural seams:

- `useAsideRegistry` — register/unregister, ref maps.
- `useHeadingSpy` — heading collection + active-id tracking.
- `useScrollProgress` — percentage bar.
- `useCardLayout` — `positionCards`, compaction heuristic, the layout effect loop.
- `useConnectingLine` — `computeLine`, geometry.
- `<MarginaliaTOC>`, `<Card>` — presentation.

Tested in isolation, each is ~40–80 lines and individually reasonable. Today they are entangled by shared refs and setters that would need to be passed as arguments after extraction — that's fine, and the exercise of writing those argument lists is exactly what reveals which state is actually shared and which isn't.

**For juniors:** when a component crosses ~200 lines, pause and ask "what are the nouns and verbs here?" A component that mounts effects for scroll, resize, body classes, heading DOM queries, and card geometry is really six components in a trenchcoat. Custom hooks are the cheapest refactor you'll ever do — no runtime change, big readability win.

### 1.2 Single source of truth is violated for responsive breakpoint

The breakpoint "below 1200px, collapse" lives in two places:

- `styles.module.css:431` — `@media (max-width: 1200px)` hides `.margin`.
- `Marginalia.tsx:94` — `if (marginRect.width < 100) return;` silently bails out of positioning.

These are two independent guards that have to agree. The `< 100` check is a defensive bandaid because at the breakpoint the margin column is `display: none` (width: 0) and `getBoundingClientRect()` returns zeros. Pick one: either read the breakpoint from a single source (CSS custom property, `window.matchMedia`) or gate the JS effects on a `useMediaQuery` hook that mirrors the CSS.

### 1.3 Imperative DOM mutation fighting React

`positionCards` writes directly to `cardEl.style.top` and `cardEl.style.visibility`. Meanwhile `<Card>` JSX always renders `style={{ visibility: 'hidden' }}`. Every React re-render overwrites the imperatively-set visibility back to `hidden`, then the next `positionCards` flip restores it. The result is a visible flash on any parent re-render — and because `Aside`'s effect re-registers on every render (see §2.3), that's a lot of re-renders.

The typical React answer: store `{ top, visible }` in state and render it through JSX. You pay the reconciliation cost once per layout pass and the DOM is the one you declared. If you must stay imperative for perf reasons, at minimum remove the `visibility: 'hidden'` style prop from JSX and manage visibility entirely through the imperative path.

---

## 2. React / hooks correctness

### 2.1 Effect-driven infinite-render risk in `positionCards`

`positionCards` is called from a layout effect that depends on `compactIds`. Inside, it may call `setCompactIds(new Set(current).add(toCompact))`, which triggers re-render → layout effect → `positionCards` again → possibly another `setCompactIds`. Convergence depends on each pass producing fewer overflow/cascade violations than the last — there is no loop guard, no iteration cap, and no early-exit when the ID being added is already present (there is an `if (!current.has(toCompact))` check, good, but a different id can be picked each pass).

Realistic failure path: card A pushes B, B pushes C → iteration 1 compacts the _first_ cascade culprit (A's successor `items[i-1]` at the wrong index, see §2.2). Iteration 2 may pick a different culprit because heights have shifted. With five asides and a tall first card, you can see 3–4 extra render passes per resize event. Not infinite, but needlessly expensive.

**Fix options:** iteration cap (break after N passes), or rewrite the heuristic to compute the full compaction set in one function and apply it once.

### 2.2 Cascade-culprit blame is off-by-one

```ts
if (i > 0 && desired - naturalCentered > CASCADE_TOLERANCE) {
  cascadeCulprits.push(items[i - 1].id);
}
```

This blames the _immediately previous_ card. The actual culprit is the cumulative tallness of everything above — you can have card 0 being a monster and cards 1..N all get pushed, but only card 0's successor (card 1) gets compacted. That doesn't free up space from card 0. Users will see the heuristic compact the wrong card and still have overflow.

Either track the tallest card in the cascade, or compact the one whose height yields the most vertical savings. As written the heuristic picks the first hit found, which has no correlation with the card that caused the problem.

### 2.3 `Aside.useEffect` re-registers on every parent render

```ts
useEffect(() => {
  register(id, { kind, kindLabel, title, body, meta, cta, ctaHref });
  return () => unregister?.(id);
}, [register, unregister, id, kind, resolvedKindLabel, title, body, meta, cta, ctaHref]);
```

`body` is a `ReactNode` (computed each render from `anchor ? children : null`), and `meta` is an `string[]` the MDX author will write inline: `meta={["1977", "253 patterns"]}`. Both are new references every render. That means:

- On every render of the page that contains the `<Marginalia>` wrapper, every `Aside` runs its effect.
- Each run calls `unregister` (from the previous render's cleanup) and `register` again.
- `register` does a linear `findIndex` over all asides.
- Every call to `register` / `unregister` triggers `setAsides`, which re-renders `Marginalia`, which re-renders every `Card`, which runs layout effects, which recomputes `positionCards`.

On a page with ~20 asides this is a measurable perf regression (observable in React DevTools Profiler). Symptom: typing in a search box, opening a mobile menu, or any parent state change causes the whole margin column to thrash.

**Fix:** either hash the content payload and only re-register when it changes, or split registration (happens on mount/unmount only) from content updates (happens when content deps change and writes just that aside's row). Asking MDX authors to memoize `meta` isn't viable.

### 2.4 Ref assignment during render

```ts
const asidesRef = useRef(asides);
asidesRef.current = asides; // Marginalia.tsx:47
```

Assigning to a ref during render is not illegal, but it's a smell: Strict Mode renders twice, concurrent rendering discards and re-renders. If the render that wrote `asidesRef.current` is thrown away, you now have a ref pointing at state that never committed. Idiomatic React: write refs in `useEffect(() => { asidesRef.current = asides; })` or use `useSyncExternalStore` when you actually need a stable subscription. Same note applies to `compactIdsRef`.

### 2.5 Body class leaks with multiple instances

```ts
useEffect(() => {
  document.body.classList.add('marginalia-active');
  return () => document.body.classList.remove('marginalia-active');
}, []);
```

Render two `<Marginalia>` on one page (a gallery page, or nested tab content) and unmounting the first removes the class while the second is still live. The side effect needs ref-counting — either a module-level counter that only removes on last unmount, or move to a provider pattern where only one top-level instance drives the body class.

### 2.6 `setHotId(null)` flicker on anchor → card hover

Anchor `onMouseLeave` sets null, card `onMouseEnter` sets the id. Mouse movement between the two fires both in sequence with at least one paint frame in between → a visible border/line-dashing flicker. The fix pattern is a small timeout-coalesced hover state, or a single shared "hover area" that spans both.

### 2.7 `onBlur → setHotId(null)` races with `onClick`

On click, browsers blur the focused element. Blur fires, `setHotId(null)` runs, then `onClick` calls `scrollCardIntoView(id)`. That still works because `scrollCardIntoView` uses the id captured from the render closure, not `hotId`. But the card briefly de-highlights mid-click — UX cost, not correctness.

### 2.8 Heading collector misses dynamically-added headings

```ts
const els = mainRef.current.querySelectorAll<HTMLElement>('h1[id], h2[id]');
```

Collection runs on mount + on ResizeObserver + on a 400ms timeout. None of those fire when a `<Tabs>` component reveals new headings, or when an MDX collapsible expands. A `MutationObserver` watching `childList` and `subtree` would be the correct primitive. This is a bug today for anyone nesting Marginalia with Docusaurus's Tabs component.

### 2.9 Only H1/H2 are collected — but the CSS styles H3–H6

`tocLevel3`, `tocLevel4`, `tocLevel5`, `tocLevel6` classes exist in `styles.module.css:107–119` and are referenced via `styles[\`tocLevel${h.level}\`]`in the TSX. Since the query selector is`h1[id], h2[id]`, levels 3–6 are dead code. Either pick up H3 (common in Docusaurus docs for subsections) or delete the unused CSS — the discrepancy is a trap for the next maintainer.

### 2.10 `scrollCardIntoView` uses `{ block: 'center' }`

This scrolls the _card_ to viewport center. The user's mental model is "I clicked the anchor in the prose — bring the card next to it." Centering the card drags the prose away from the reading line the user was on. A correct implementation computes the desired scroll delta as `cardTop - anchorTop` (or uses `scroll-margin-top` + the anchor's existing position, holding the prose stationary).

### 2.11 Unused `useIsomorphicLayoutEffect` alias

```ts
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
```

This is module-level and evaluated once at import. In a Docusaurus SSR pass it evaluates to `useEffect` and is baked into the client bundle — so on the client it remains `useEffect` even though `useLayoutEffect` would be correct. The usual spelling is a ternary inside the component, or the `use-isomorphic-layout-effect` npm package which does this right. As written it actively defeats its own purpose on SSR builds.

---

## 3. Performance

### 3.1 Scroll handler does synchronous layout reads per event

```ts
asidesRef.current.forEach(a => {
  const el = anchorRefs.current.get(a.id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  // ...
});
```

`getBoundingClientRect` triggers layout. Called once per aside, per scroll event, on the main thread, on a `passive: true` listener (passive prevents preventDefault — it doesn't defer work). On a long doc with 30 asides, that's 30 forced layouts per scroll tick.

Replace with `IntersectionObserver` (fires at thresholds, no layout thrash) for in-view detection and a single `getBoundingClientRect` only on the anchor closest to the reading line. Or use a sentinel element at `READING_LINE` and observe anchor intersections against it.

### 3.2 `setProgress(pct)` is called every scroll frame

Progress state update triggers a render of the whole `Marginalia` tree. Memoizing the progress bar as a separate component helps, but the real fix is to use a CSS `transform: scaleX(...)` driven by rAF and a ref — one DOM write, no React render. The current `transition: width 0.2s ease-out` on the progress bar actually _double-animates_ against React's per-scroll updates, producing laggy progress on fast scrolls.

### 3.3 ResizeObserver on `mainRef` re-runs full heading collection

Each RO fire does `querySelectorAll` + `Array.from` + building a full heading list. Bailout-via-identity-compare at the end is good, but the allocation happens first. For long docs, this is several KB of transient allocations per image load. Collect once, subscribe to meaningful mutations, not to "main got taller."

### 3.4 `GAP`, `READING_LINE`, `TOC_RESERVE`, `CASCADE_TOLERANCE` are hardcoded

Four magic numbers, zero props, zero CSS custom properties to override them. A consumer who wants denser packing has to fork the file. At minimum expose them as props on `<Marginalia>` with the current values as defaults.

### 3.5 `setAsides` uses `findIndex` on every register

Array-based registry with O(n) find per register/unregister. With the re-registration churn from §2.3 this scales poorly. Use a `Map` (or keep the array and a `Map<string, index>` index) if you keep the effect-on-every-render pattern.

---

## 4. Accessibility

This is the area I'd push back hardest on in review.

### 4.1 `<span role="button">` is not a button

A real `<button type="button">` gets keyboard activation, focusability, and assistive-tech announcements for free. `<span role="button" tabindex="0">` requires you to reimplement:

- Enter/Space activation — **done**, but Space on a span scrolls the page by default; `e.preventDefault()` is present so ok.
- Disabled state — not implemented.
- Type="button" inside forms — moot here but worth noting for juniors.
- Full focus-visible styles — partially covered by `.anchor:focus-visible`.

There is no reason to use a span here. The anchor wraps inline prose, and a `<button>` can be styled inline. The one caveat is that Safari's `<button>` has non-inline baseline alignment quirks; `display: inline`, `padding: 0`, `border: 0`, `background: transparent`, `vertical-align: baseline`, `font: inherit` solves that. Do it.

### 4.2 No ARIA relationship between anchor and card

Anchors are buttons with no `aria-controls`, no `aria-describedby`, no `aria-expanded`. Cards are `<div>`s with `onClick`, no role, no accessible name. A screen-reader user has no way to know the two elements are related or how to get from one to the other.

Minimum viable fix:

- Anchor: `aria-describedby={cardId}` (card content is supplementary prose).
- Card: `id={cardId}` and a `role="note"` (or `complementary`, pick one and justify).
- Card container `<aside>` keeps its `aria-label="Marginalia"` — that's fine.

### 4.3 DOM order is wrong for screen readers

```tsx
<div className={styles.main}>{children}</div>
<aside>
  {asides.map(a => <Card key={a.id} aside={a} ... />)}
</aside>
```

All cards render after all prose. A screen reader encounters every anchor in document order, then — much later — every card, with no positional relationship. Readers with cognitive load issues will find this incomprehensible.

Options:

- Move card content inline as a visually-hidden detail after each anchor, positioned absolutely via CSS for sighted users. This keeps DOM order = reading order.
- Or keep current structure but use `aria-describedby` aggressively so each anchor's description is announced at encounter time.

### 4.4 No `prefers-reduced-motion` support

- `.card { transition: transform 0.35s ... }`
- `.line { animation: marginalia-line-fade 0.2s ... }`
- `animate?.([...])` imperative calls in `scrollCardIntoView` and `activate`.
- `scrollIntoView({ behavior: 'smooth' })` — smooth scroll even when user opted out.

Anyone with vestibular-motion sensitivity has opted out system-wide and we ignore them. Add a `@media (prefers-reduced-motion: reduce)` block that nulls transitions/animations, and pass `behavior: 'auto'` when the user prefers reduced motion.

### 4.5 Anchors lack a textual description when anchor content is JSX

`<Aside anchor={<strong>foo</strong>}>` renders a button whose accessible name is "foo" — ok in this case, but a more complex ReactNode can produce a name the screen reader can't flatten well (icons, pseudo content, fragments). Expose an explicit `aria-label` prop on `<Aside>` for authors who need it.

### 4.6 Endpoint chip is decorative-looking but has no semantics

`<Endpoint method="POST" path="/sessions" />` renders as nested spans. A screen reader hears "POST /sessions" which is fine, but there's no semantic marker that this is an endpoint reference. `<code>` wrapping the path would add mono-spaced semantics and help assistive tech. Currently the mono font is applied via CSS only.

### 4.7 Mobile: anchors are buttons that do nothing

Below 1200px the margin column is `display: none`. `scrollCardIntoView` on a card in a display-none container scrolls to nothing and silently does nothing. Anchors remain `role="button"` but have no consequence. The README describes this as "anchors keep their native `title` tooltip" — on touch devices, title tooltips are essentially unreachable.

Either render the card inline as a collapsible below the anchor on narrow viewports, or remove the button role entirely on mobile (and leave only the underline-as-footnote affordance, like academic papers do). Present behavior is misleading: UI suggests interactivity that's absent.

---

## 5. Layout & CSS

### 5.1 `globalStyles.css` depends on Docusaurus internal class names

```css
body.marginalia-active [class*='tableOfContents'] { display: none !important; }
body.marginalia-active main.col.col--7 { ... }
body.marginalia-active .container.margin-vert--lg > .row > [class*='col--2'] { display: none !important; }
```

- `col--7`, `col--2` are Infima grid internals — they're not documented stable contracts.
- `[class*='tableOfContents']` is a partial match on a hashed CSS-Modules class name. When Docusaurus bumps the hash seed (or the module loader changes between 3.x minors), this silently stops working.
- `!important` everywhere means consumers can't override from user CSS without also using `!important` — hostile to consumer customisation.

Safer approach: wrap the native TOC in a portal that Marginalia controls (Docusaurus exposes `@theme/DocItem/TOC/Desktop` — swizzle it and suppress from there), or use the documented Docusaurus layout hooks.

### 5.2 Endpoint color tokens are hardcoded and dark-mode-hostile

```css
.endpoint[data-method='GET'] .endpointMethod {
  color: #1e8a5a;
  background: #e2f3ea;
}
.endpoint[data-method='POST'] .endpointMethod {
  color: #c97b1f;
  background: #faf0dd;
}
.endpoint[data-method='DELETE'] .endpointMethod {
  color: #c0423e;
  background: #fbe7e6;
}
```

The rest of the stylesheet thoughtfully uses `var(--marginalia-*)` tokens that fall back to Infima variables. These three do not. Consequence: on dark mode, endpoint chips show bright pastel pills on a dark surface — visually jarring and unreadable on some monitors.

Introduce `--marginalia-method-get-*`, `--marginalia-method-post-*`, etc. tokens with sensible defaults and a `[data-theme='dark']` override block.

### 5.3 `color-mix(in oklab, ...)` is bleeding-edge

Support matrix as of 2026-04: Safari 16.2+ (released Dec 2022), Chrome 111+, Firefox 113+. Docusaurus docs often have a long tail of readers on older Safari. Fallback chains are easy (`background: rgba(...); background: color-mix(...)`) but not present. Silent visual degradation on older browsers.

### 5.4 Grid uses `minmax(0, 1fr) 320px` + 48px gap

At 1201px viewport (one px above the collapse breakpoint), content column is ~833px and margin column is 320px. That's OK but tight — long code blocks, images, or tables will clip awkwardly. A second breakpoint at ~1400px that widens the margin column to 360–400px would give more breathing room.

### 5.5 Cards with `position: absolute` never restore if JS is disabled

With JS off, `<Marginalia>` renders `<Card>` with `style={{ visibility: 'hidden' }}` and no `top` is ever set. All cards stack at the top of the margin column, invisibly. Graceful degradation would keep cards visible in source order (drop the absolute positioning in a `.no-js` fallback). This is a classic progressive-enhancement miss.

### 5.6 `.card` uses `will-change: transform, opacity, top`

`will-change` promotes the element to its own compositing layer permanently. With N cards that's N layers held in GPU memory for the life of the page. It's a foot-gun optimisation that is usually worse than omitting it. Remove unless you've measured a paint-cost regression.

### 5.7 No print stylesheet

A `@media print` block should unfurl cards inline (or suppress them) so printed docs aren't mutilated. Zero cost, high polish.

---

## 6. SSR / hydration

### 6.1 `typeof window !== 'undefined'` at module scope

See §2.11 — module-scope evaluation for SSR-vs-client is evaluated on the server pass and stays wrong. This is the kind of bug that only manifests as "the first scroll event doesn't do anything" in production because effects are silently running synchronously via `useEffect` instead of `useLayoutEffect`.

### 6.2 `useId()` + SSR: verify stability

React 18's `useId` is deterministic across SSR and hydration as long as the component tree is identical. The `Aside` tree relies on this for registration matching. This is fine today but will break if someone adds a conditional hook (e.g., `if (ctx) useEffect(...)`) — the `Aside` is already suspiciously close to this pattern with its early `return` before the interactive branch. Adding any hook below that early return would be a hooks-rule violation waiting to happen.

### 6.3 No SSR test

`tests/` has no coverage for the server render → hydrate path. A `renderToString` snapshot test would guard against future regressions in useId, body classList, document access, etc. Docusaurus sites _are_ SSR'd; not testing that path is leaving a loaded gun on the table.

---

## 7. Docusaurus plugin integration (`plugin.ts`)

### 7.1 `try/catch` around `typeof __dirname` is dead code

```ts
try {
  if (typeof __dirname === 'string') {
    return join(__dirname, '...');
  }
} catch {
  /* fall through */
}
```

`typeof someUndeclaredIdentifier` is the one expression in JS specifically designed _not_ to throw `ReferenceError`. The catch block is unreachable. Either remove it or replace with the actual ESM test: `typeof import.meta !== 'undefined'`.

### 7.2 `resolveTypeScriptThemePath` is broken for published consumers

```ts
candidates.push(join(__dirname, '../src/theme'));
candidates.push(fileURLToPath(new URL('../src/theme', import.meta.url)));
```

In development from a cloned repo, `dist/../src/theme` resolves to `src/theme` — works. In a published package, `.npmignore` strips `src/`, so both candidates miss. `existsSync` returns false, function returns `undefined`, caller falls back to `themePath` (the compiled `.js`/`.d.ts`) which Docusaurus can't use as "TypeScript theme path."

Net: `getTypeScriptThemePath` is a no-op for every consumer who `npm install`s the package. Either:

- Ship the `.tsx` files in `dist/src/theme/` via a build copy step (tsup can do this), or
- Remove `getTypeScriptThemePath` and document that TypeScript swizzles aren't supported, or
- Include `src/` in the publish (reverse the `.npmignore` entry) — trivially cheap, solves it.

This bug is particularly nasty because it passes every automated check: unit tests don't exercise the plugin at all, local dev works, CI builds pass. Only a consumer who actually tries to swizzle with `--typescript` hits it.

### 7.3 `getClientModules` returns a path without verifying it exists

```ts
getClientModules() {
  if (!enabled) return [];
  return [globalStylesPath];
}
```

If the build artifact is missing (partial install, corrupted tarball), Docusaurus fails with a confusing webpack resolve error deep in the stack. At plugin load time, doing `if (!existsSync(globalStylesPath)) { console.warn(...); return []; }` converts a 20-line stack trace into a one-line "missing build artifact — run `npm run build`." This is the kind of small check that saves hours of debugging for the next poor soul.

### 7.4 Plugin owns _no_ Docusaurus lifecycle for cache/config validation

The plugin accepts options but never validates them. Passing `{ enabled: "yes" }` (a string) gets coerced to truthy and works by accident. Docusaurus provides `validateOptions` / `validateThemeConfig`; using them would catch typos at config time rather than at runtime. For juniors: explicit boundary validation pays for itself every time — the bug you catch in config-parse is never filed.

---

## 8. Testing

### 8.1 The largest file has zero tests

`Marginalia.tsx` is 460 lines, hosts every interesting behavior in the project, and has no direct test file. `Aside.test.tsx` tests the anchor in isolation, and `Endpoint.test.tsx` tests the chip. That's it.

Untested behaviors I count:

- Hot-id nearest-anchor selection at various scroll positions.
- Compaction heuristic under overflow.
- TOC active-id tracking.
- Progress-bar math at edges (doc shorter than viewport, scrolled past end).
- Body-class add/remove across mount/unmount cycles.
- Connecting-line geometry for various card positions.
- Register/unregister ordering.
- `showToc={false}` code path.

Write these with `@testing-library/react` + mocked `getBoundingClientRect` / `IntersectionObserver`. Yes, it's tedious. That's because the component is doing too much (see §1.1).

### 8.2 The `hotId` test literally admits it can't test the thing

```tsx
// Re-render with hotId set to the actual assigned id, simulating a hot state
// isn't straightforward without exposing id. We assert the inverse instead:
// an aria-pressed attribute is present.
const el = screen.getByRole('button', { name: 'hot-anchor' });
expect(el).toHaveAttribute('aria-pressed');
```

"It's hard to test" is diagnostic information: the component is under-testable because `useId` generates opaque IDs that aren't observable from outside. This is a design problem masquerading as a test problem. Solutions:

- Accept an optional `id` prop on `<Aside>` (falls back to useId). Tests pass known IDs.
- Expose `data-marginalia-id={id}` on the rendered element. Tests can query by it.
- Refactor the hot-id logic into a hook that takes ids as input and returns the hot id, then test the hook directly.

Any of these would let the test verify _actual_ hot behavior rather than "the attribute is present."

### 8.3 No tests for the plugin module

`plugin.ts` has three exported resolvers with multiple fallback branches — that's 6+ test cases of straightforward branch coverage. Not one exists. Given §7.2's consumer-breaking bug, this is exactly where tests would have caught the regression.

### 8.4 No a11y assertions

`jest-axe` plugs into testing-library and takes 20 lines to wire up. Would catch §4.1–§4.2 today.

### 8.5 `Endpoint` test covers happy path only

No test for `method="nonsense"` (confirms the `(string & {})` branch renders gracefully), no test for both `path` and `children` provided (current code quietly ignores `children`), no test for neither (renders an empty chip).

### 8.6 Dead Babel config

`.babelrc.cjs` references `./jest/babel-plugin-transform-import-meta.cjs`. The `jest/` directory does not exist. Running any Babel-driven tool in test env would explode. Vitest doesn't need Babel, so it's inert — but inert misleading code is tech debt. Remove the file or remove the `env.test` stanza.

---

## 9. Packaging & build

### 9.1 Swizzle output may be unreadable

`tsup` bundles each theme component into `dist/theme/Marginalia/*.js` with references to hashed chunks (`chunk-GIRIPBL5.js`) and hashed CSS (`styles.module-3BADDAP6.module.css`). When a consumer runs `npm run swizzle docusaurus-plugin-marginalia Marginalia/Aside -- --eject`, Docusaurus copies the bundled `.js` with references to hashed private chunks. The consumer gets unreadable code they can't meaningfully edit.

Options:

- Ship unbundled `.js` per file (set `splitting: false`, or use `tsc` output instead of `tsup`).
- Ship `src/theme/**/*.tsx` in the package (reverse `.npmignore`) so swizzle `--typescript` works and is actually useful.

Swizzle is a first-class Docusaurus feature and the plugin advertises it in the README. The current build breaks that promise.

### 9.2 `@docusaurus/core` / `@docusaurus/types` listed as peers but only used for types

`plugin.ts` imports `LoadContext`, `Plugin` from `@docusaurus/types` — type-only. With `verbatimModuleSyntax` or explicit `import type`, they wouldn't appear in the runtime bundle. `@docusaurus/core` is listed as a peer but never imported in source. Consider moving to `devDependencies` and `peerDependenciesMeta.optional: true` (or dropping `@docusaurus/core` entirely).

### 9.3 `.npmignore` strips `src/` but publish flow references `src/theme`

See §7.2. These two facts are incompatible and the resolver silently returns `undefined` instead of failing loudly.

### 9.4 `eslint.config.js` ignores `jest/**` and `scripts/**` that don't exist

Dead config — easier to miss because it's an "allow" list rather than a rule. When someone later adds a real `scripts/` directory, lint will silently skip it.

### 9.5 `CI` workflow runs four commands that each install Node caches

```yaml
- run: npm ci
- run: npm run build
- run: npm run typecheck
- run: npm run lint
- run: npm run format:check
- run: npm test
```

Three Node versions × six steps = reasonable. But `npm test` runs the Vitest suite which doesn't need the `npm run build` output; `npm run lint` doesn't need `npm run build` either. Build once, then fan out parallel jobs (lint, typecheck, test) and you cut CI time in ~half. Matters more when the matrix grows.

### 9.6 Release workflow triggers on `paths: package.json` **and** `tags: v*`

```yaml
on:
  push:
    branches: [main]
    paths: ['package.json']
    tags: ['v*']
```

`tags` is **not** a `push` sub-filter in GitHub Actions — it's a sibling. As written, GitHub parses `tags` under `push` and applies it alongside `branches`. The practical effect is that the workflow only fires on main-branch pushes that touch `package.json` — it will not fire on tag pushes. If the author meant "fire on either a package.json bump _or_ a v-tag push," this needs two separate `on` entries. Test by pushing a tag and verifying the workflow actually runs before the next release.

### 9.7 `version-bump.yml` assumes the committer has push access

`peter-evans/create-pull-request@v6` creates a PR from the default `GITHUB_TOKEN`, which by default _can't_ trigger other workflows (anti-loop protection). When the resulting PR is merged, the `publish.yml` workflow (which listens for `package.json` pushes) will receive the merge commit and publish. Worth a dry-run and documenting — this interaction is subtle enough to catch out a first-time maintainer.

---

## 10. Edge cases that have not been spotted

This is the section the user explicitly asked for. Ranked roughly by real-world likelihood.

1. **Nested inside Docusaurus `<Tabs>`.** Hidden tabs register asides whose anchors have `getBoundingClientRect()` of all zeros until the tab is shown. They rank as "near the reading line" (y=0) and steal hot state, or they pile at the top of the margin column until a scroll event triggers re-layout. Actively broken today.
2. **RTL languages.** `<html dir="rtl">` flips the visual layout. The line geometry (`if (x2 <= x1) return null`) rejects what would be the normal RTL relationship. The margin column is still on the right in the CSS grid. The plugin is silently non-functional for Arabic/Hebrew Docusaurus deployments.
3. **Multiple `<Marginalia>` on one page.** Body class is added on first mount, removed on first unmount, regardless of the second instance. Two instances also double-register scroll listeners, causing double work on every scroll.
4. **Strict Mode double-invoke.** React 18 Strict Mode runs effects twice. The `register`/`unregister` cycle converges correctly, but `asidesRef.current = asides` during render + `setAsides` batch may see a brief state where asidesRef and asides disagree. Unlikely to produce a visible bug but will surface as test flake the first time someone adds Strict Mode in tests.
5. **`useId` values contain colons (`:r0:`).** Not user-facing in DOM, but if someone later switches to `<a href={"#" + id}>` for in-page nav, the colon is invalid in URL fragments. Using `id.replace(/:/g, '_')` at the boundary is the easy prophylaxis.
6. **Text zoom vs. page zoom.** Safari/Firefox let users increase _text_ size without affecting layout. The 1200px breakpoint + fixed 320px margin column doesn't adapt. Text overflows cards at 150% text zoom on a 1300px viewport.
7. **Reduced-motion users.** §4.4 — all animations ignore the preference.
8. **Anchor containing a real `<a>`.** `<Aside anchor={<a href="/foo">thing</a>}>...` — outer span `onClick` calls `e.preventDefault()`, killing the nested link navigation. Also nested interactive elements are an a11y anti-pattern; the library should at least warn in dev.
9. **Card body with wide content.** A code block or image inside `<Aside>body...</Aside>` is rendered in a 320px-wide absolute-positioned div. `overflow: hidden` is not set, so content escapes the card rectangle. Defensive CSS: `min-width: 0; overflow-wrap: anywhere;` and `overflow-x: auto` on card body.
10. **`meta` or `body` inline in MDX.** Every render creates new references → re-registration churn (§2.3). Not visible until the wrapping page is interactive (e.g., a search input forces re-render) — then cards visibly re-flow.
11. **Aside outside Marginalia.** Currently renders as plain `<span>` tooltip — acceptable fallback. But `children ?? anchor` choice flips: inside provider, `children` is body; outside, `children` is inline label. MDX authors who write `<Aside anchor="foo">bar</Aside>` see "foo" inside `<Marginalia>` and "bar" outside. Confusing.
12. **Printing.** §5.7.
13. **`behavior: 'smooth'` on sticky-header pages in Safari.** Known Safari bug where smooth scroll plus sticky header lands with the target hidden under the header. The `scroll-margin-top: calc(var(--marginalia-navbar-offset) + 24px)` should compensate, but `scrollCardIntoView` uses `block: 'center'` which ignores scroll-margin. Intermittent "card scrolled halfway behind the navbar" UX bug.
14. **Docusaurus HMR during dev.** Hot-reloading `Marginalia.tsx` discards the component's state; cards briefly disappear, register again on new `useId`s, causing a visual reset. Low priority but noticeable.
15. **Very short documents.** `const total = mRect.height - window.innerHeight; total > 0 ? ... : scrolled > 0 ? 100 : 0`. If the doc fits in viewport, progress shows 0 forever — probably correct, but document it. Edge case: `total === 0` exactly, branch to `100`? Current code goes to `scrolled > 0 ? 100 : 0` which is fine.
16. **Locale-aware number formatting in `meta`.** `meta={["1977", "253 patterns"]}` — strings, fine. But authors will reach for `new Intl.NumberFormat()` eventually; render path doesn't care. Non-issue, noted for completeness.
17. **Swizzle with `--typescript`.** §7.2 + §9.1 — explicitly advertised feature, actually broken.
18. **Disabled plugin (`enabled: false`).** `getClientModules` returns `[]` but `getThemePath()` still resolves, so `@theme/Marginalia` imports resolve and the components mount. They will try to register, set body class, etc. — with `enabled: false`, these should probably be no-ops. Currently "disabled" means "same behavior, no global styles" → the layout is unstyled but still active. Confusing semantics.
19. **Anchor with long JSX content.** `<Aside anchor={<span>very long phrase spanning several words</span>}>`. The `getBoundingClientRect` of a spanning anchor returns the union bounding box, which may wrap across two text lines. `r.top + r.height / 2` then picks a point in between the two lines — visually, the connecting line starts from empty space. Use `getClientRects()` and pick the last rect for line start point.
20. **CSS custom properties polyfill.** Some corporate Docusaurus deployments target IE11/legacy Edge via polyfills. `color-mix()` won't polyfill. `var()` will. Document supported browsers.

---

## 11. Notes for more junior readers

Nothing above is about being clever. The recurring themes are boring engineering hygiene:

1. **Don't let a file cross 200 lines without a reason.** If it does, the reason is usually "I haven't factored this yet." `Marginalia.tsx` is an example of what happens when you keep adding features to the file where the first feature went.
2. **State that lives in refs because a callback needs it is a design smell.** The fact that `asidesRef.current = asides` is written during render means the code _wants_ to read state synchronously that React wants to treat as async. Usually the answer is a reducer + `useSyncExternalStore`, or moving the state out of React entirely (a module-level store with subscribers).
3. **`useEffect` dependency arrays are the API of your effect.** If an effect has 10 dependencies, three of which are ReactNodes and arrays, the effect will run constantly. That's a design problem, not a lint problem.
4. **Always test the thing you're worried about, not the thing next to it.** The admitted-defeat `hotId` test (§8.2) is the red flag: "testing is hard" usually means "the design is hard to test." Fix the design.
5. **Imperative DOM + declarative React = flashing.** You can have one or the other. Mixing requires discipline: decide _which_ of the two owns a given piece of state and stick with it.
6. **Magic numbers deserve a source of truth.** Four numeric constants at the top of `Marginalia.tsx` + a 1200px breakpoint in CSS + a `< 100` threshold all describe the same layout. A maintainer trying to tweak the packing has to locate all four.
7. **Accessibility isn't a bolt-on.** `<span role="button">` is the JS equivalent of "I'll add proper error handling later." Start with the semantically correct element; the styling is always solvable.
8. **Published-package behavior ≠ local-dev behavior.** `resolveTypeScriptThemePath` works in local repo-clone dev and silently breaks for every npm installer. Always do a dry-run with `npm pack` and install the tarball in a scratch project before tagging a release.
9. **Defensive code you can't reach is the worst kind of defense.** `try { typeof __dirname }` and `globalStyles path without existsSync` are both examples — one guards against something that can't happen, the other fails to guard against something that can. Write the guard that fails loudly at the real failure point.
10. **Treat third-party selectors as unstable APIs.** `[class*='tableOfContents']` is coupling to Docusaurus internals. Pin to documented extension points, or be prepared to maintain the coupling across minor versions.

---

## Quick punch-list (triage order)

**Must-fix before a 1.0 release:**

- Fix `resolveTypeScriptThemePath` for published consumers (§7.2).
- Fix release workflow `paths`+`tags` mis-parse (§9.6).
- Replace `<span role="button">` with `<button>` (§4.1).
- Add `aria-describedby` anchor↔card relationship (§4.2).
- Stop re-registering Aside on every render (§2.3).

**Should-fix before broad adoption:**

- Decompose `Marginalia.tsx` (§1.1).
- Replace scroll-handler layout reads with IntersectionObserver (§3.1).
- Add `prefers-reduced-motion` handling (§4.4).
- Fix compaction cascade blame (§2.2) and infinite-render risk (§2.1).
- Theme endpoint colors via CSS vars; support dark mode (§5.2).
- Expose test seams, write tests for `Marginalia.tsx` (§8.1, §8.2).

**Nice-to-have:**

- Ship swizzle-friendly build (§9.1).
- MutationObserver for heading collection (§2.8).
- `<Marginalia>` tests with mocked layout (§8.1).
- Print stylesheet (§5.7).
- Loudly fail on missing build artifacts in plugin load (§7.3).
- Remove dead Babel / ESLint config (§8.6, §9.4).

---

_End of review._
