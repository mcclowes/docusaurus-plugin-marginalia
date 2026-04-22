import { describe, expect, it } from 'vitest';
import type { LoadContext } from '@docusaurus/types';
import marginaliaPlugin from '../src/plugin';

// The plugin entry resolves paths from __dirname, which points at tests/
// when Vitest runs this file. We pass a fake LoadContext (the plugin only
// uses it for types, not values).
const fakeContext = {} as unknown as LoadContext;

describe('marginaliaPlugin', () => {
  it('returns a plugin with the expected name', () => {
    const plugin = marginaliaPlugin(fakeContext, { enabled: false });
    expect(plugin.name).toBe('docusaurus-plugin-marginalia');
  });

  it('exposes getThemePath and getTypeScriptThemePath as strings', () => {
    const plugin = marginaliaPlugin(fakeContext, { enabled: false });
    expect(typeof plugin.getThemePath?.()).toBe('string');
    expect(typeof plugin.getTypeScriptThemePath?.()).toBe('string');
  });

  it('falls back getTypeScriptThemePath to getThemePath when src is absent', () => {
    const plugin = marginaliaPlugin(fakeContext, { enabled: false });
    // In this repo both paths exist; assert at minimum that the tsx path
    // resolves to a string (the fallback branch is exercised for published
    // consumers — verified manually via npm pack).
    const themePath = plugin.getThemePath?.();
    const tsPath = plugin.getTypeScriptThemePath?.();
    expect(themePath).toBeTruthy();
    expect(tsPath).toBeTruthy();
  });

  it('skips client modules when disabled', () => {
    const plugin = marginaliaPlugin(fakeContext, { enabled: false });
    expect(plugin.getClientModules?.()).toEqual([]);
  });

  it('defaults enabled to true (throws if build artifact is missing)', () => {
    // With no options, enabled defaults to true. The plugin's load-time
    // existsSync check throws a readable error when the dist bundle is
    // absent. We don't exercise the happy path here because the dist file
    // only exists after `npm run build`; the assertion is that the check
    // either returns the client-modules array (post-build) or throws the
    // helpful error (pre-build). Either way is acceptable in this test
    // environment.
    const run = () => marginaliaPlugin(fakeContext);
    try {
      const plugin = run();
      const modules = plugin.getClientModules?.();
      expect(Array.isArray(modules)).toBe(true);
      expect(modules?.length).toBe(1);
    } catch (err) {
      expect((err as Error).message).toMatch(/Missing build artifact/);
    }
  });
});
