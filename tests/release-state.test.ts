// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseState } from '../.github/scripts/check-release-state.js';

const config = {
  packageName: 'docusaurus-plugin-marginalia',
  version: '0.1.0',
  repository: 'mcclowes/docusaurus-plugin-marginalia',
  token: 'test-token',
};
const keys = ['published', 'tagged', 'released'] as const;
const identities = [{ version: '0.1.0' }, { ref: 'refs/tags/v0.1.0' }, { tag_name: 'v0.1.0' }];
const urls = [
  'https://registry.npmjs.org/docusaurus-plugin-marginalia/0.1.0',
  'https://api.github.com/repos/mcclowes/docusaurus-plugin-marginalia/git/ref/tags/v0.1.0',
  'https://api.github.com/repos/mcclowes/docusaurus-plugin-marginalia/releases/tags/v0.1.0',
];

describe('release state checks', () => {
  let directory: string;
  let output: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'marginalia-release-state-'));
    output = join(directory, 'github-output');
    writeFileSync(output, 'existing=value\n');
  });

  afterEach(() => rmSync(directory, { recursive: true }));

  const combinations = [false, true].flatMap(published =>
    [false, true].flatMap(tagged => [false, true].map(released => [published, tagged, released]))
  );

  it.each(combinations)('reports independent state for %j / %j / %j', async (...state) => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const index = urls.indexOf(String(input));
      if (index < 0) throw new Error(`Unexpected URL: ${input}`);
      return state[index] ? Response.json(identities[index]) : new Response(null, { status: 404 });
    });
    await checkReleaseState(config, output, fetcher);
    expect(readFileSync(output, 'utf8')).toBe(
      `existing=value\n${keys.map((key, index) => `${key}=${state[index]}`).join('\n')}\n`
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [input, options] of fetcher.mock.calls) {
      const headers = new Headers(options?.headers);
      expect(headers.get('Authorization')).toBe(
        String(input).startsWith('https://api.github.com/') ? 'Bearer test-token' : null
      );
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  const failures = keys.flatMap((key, index) =>
    [401, 403, 429, 500].map(status => ({ key, index, status }))
  );
  it.each(failures)('fails closed for $key HTTP $status', async ({ key, index, status }) => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const current = urls.indexOf(String(input));
      return current === index
        ? new Response(null, { status })
        : Response.json(identities[current]);
    });
    await expect(checkReleaseState(config, output, fetcher)).rejects.toThrow(
      `Could not check ${key}: HTTP ${status}`
    );
    expect(readFileSync(output, 'utf8')).toBe('existing=value\n');
  });

  it.each(keys)('fails closed for %s transport errors', async key => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const index = urls.indexOf(String(input));
      if (keys[index] === key) throw new Error('Connection unavailable');
      return Response.json(identities[index]);
    });
    await expect(checkReleaseState(config, output, fetcher)).rejects.toThrow(
      `Could not check ${key}: Connection unavailable`
    );
    expect(readFileSync(output, 'utf8')).toBe('existing=value\n');
  });

  it.each(keys)('rejects malformed JSON for %s', async key => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const index = urls.indexOf(String(input));
      return keys[index] === key ? new Response('{invalid') : Response.json(identities[index]);
    });
    await expect(checkReleaseState(config, output, fetcher)).rejects.toThrow(
      `Could not check ${key}`
    );
    expect(readFileSync(output, 'utf8')).toBe('existing=value\n');
  });

  it.each(keys)('rejects an unexpected identity for %s', async key => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const index = urls.indexOf(String(input));
      return Response.json(keys[index] === key ? { version: 'wrong' } : identities[index]);
    });
    await expect(checkReleaseState(config, output, fetcher)).rejects.toThrow(
      `Could not check ${key}: Unexpected response identity`
    );
    expect(readFileSync(output, 'utf8')).toBe('existing=value\n');
  });
  it('allows an existing draft GitHub Release to be published on retry', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const index = urls.indexOf(String(input));
      return Response.json(
        keys[index] === 'released' ? { tag_name: 'v0.1.0', draft: true } : identities[index]
      );
    });
    await checkReleaseState(config, output, fetcher);
    expect(readFileSync(output, 'utf8')).toBe(
      'existing=value\npublished=true\ntagged=true\nreleased=false\n'
    );
  });
});
