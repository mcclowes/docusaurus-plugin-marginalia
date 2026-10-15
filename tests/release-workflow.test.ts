// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
const steps = workflow.split(/^ {6}- name: /m).slice(1);
const stageNames = [
  'Publish to npm with provenance',
  'Create and push tag',
  'Create GitHub Release',
];
type State = { published: boolean; tagged: boolean; released: boolean };

function selectedStages(state: State) {
  return steps
    .filter(step => stageNames.includes(step.split('\n')[0]))
    .filter(step => {
      const condition = step.match(/if: steps\.check\.outputs\.(\w+) == 'false'/);
      if (!condition) throw new Error(`Missing release-state condition: ${step.split('\n')[0]}`);
      const field = condition[1];
      if (field === 'skip') return !state.tagged;
      if (!(field in state)) throw new Error(`Unknown release-state condition: ${field}`);
      return !state[field as keyof State];
    })
    .map(step => step.split('\n')[0]);
}

function runRelease(state: State, failure = '') {
  const directory = mkdtempSync(join(tmpdir(), 'marginalia-release-workflow-'));
  const log = join(directory, 'actions');
  writeFileSync(log, '');
  const stub = `#!/bin/bash
printf '%s %s\\n' "\${0##*/}" "$*" >> "$ACTION_LOG"
if [[ "\${0##*/}" == npm && "$FAIL_STAGE" == publish ]]; then exit 17; fi
if [[ "\${0##*/}" == git && "$1" == push && "$FAIL_STAGE" == tag ]]; then exit 23; fi
`;
  for (const command of ['npm', 'git']) {
    writeFileSync(join(directory, command), stub, { mode: 0o755 });
  }
  try {
    for (const stage of selectedStages(state)) {
      if (stage === 'Create GitHub Release') {
        appendFileSync(log, 'release\n');
        if (failure === 'release') break;
        state.released = true;
        continue;
      }
      const step = steps.find(entry => entry.startsWith(`${stage}\n`));
      const script = step?.match(/\n {8}run: \|\n([\s\S]*)$/)?.[1];
      if (!script) throw new Error(`Missing shell release step: ${stage}`);
      const result = spawnSync('/bin/bash', ['-e', '-c', script], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          ACTION_LOG: log,
          FAIL_STAGE: failure,
          VERSION: '0.1.0',
          TAG: 'v0.1.0',
        },
        encoding: 'utf8',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) break;
      if (stage === 'Publish to npm with provenance') state.published = true;
      else state.tagged = true;
    }
    return readFileSync(log, 'utf8').trim().split('\n');
  } finally {
    rmSync(directory, { recursive: true });
  }
}

describe('release workflow recovery', () => {
  const combinations = [false, true].flatMap(published =>
    [false, true].flatMap(tagged =>
      [false, true].map(released => ({ published, tagged, released }))
    )
  );

  it.each(combinations)('runs only missing stages for %j', state => {
    const expected = [
      ...(!state.published ? [stageNames[0]] : []),
      ...(!state.tagged ? [stageNames[1]] : []),
      ...(!state.released ? [stageNames[2]] : []),
    ];
    expect(selectedStages(state)).toEqual(expected);
  });

  it('publishes before creating the version tag', () => {
    expect(workflow.indexOf('- name: Publish to npm')).toBeLessThan(
      workflow.indexOf('- name: Create and push tag')
    );
  });

  it('serializes branch and tag release runs without canceling publication', () => {
    const concurrency = workflow.split('concurrency:\n')[1].split('\njobs:')[0];
    expect(concurrency).toContain('cancel-in-progress: false');
    expect(concurrency).not.toContain('github.ref');
  });

  it('runs the remote state checker on the configured runtime before publication', () => {
    expect(workflow.indexOf('- name: Setup Node.js')).toBeLessThan(
      workflow.indexOf('- name: Check release state')
    );
    expect(workflow.indexOf('- name: Check release state')).toBeLessThan(
      workflow.indexOf('- name: Publish to npm')
    );
    expect(workflow).toContain('run: node .github/scripts/check-release-state.ts');
  });

  it.each(['Upgrade npm for OIDC support', 'Install dependencies', 'Build package', 'Run tests'])(
    'validates missing publication through %s even when the tag exists',
    name => {
      const step = steps.find(entry => entry.startsWith(`${name}\n`));
      expect(step).toContain("if: steps.check.outputs.published == 'false'");
    }
  );

  it('does not create or push a tag after a failed npm publication', () => {
    const state = { published: false, tagged: false, released: false };
    expect(runRelease(state, 'publish')).toEqual(['npm publish --provenance --access public']);
    expect(state).toEqual({ published: false, tagged: false, released: false });
  });

  it('retries a failed tag push without publishing the same version again', () => {
    const state = { published: false, tagged: false, released: false };
    expect(runRelease(state, 'tag')).toEqual([
      'npm publish --provenance --access public',
      'git tag v0.1.0',
      'git push origin v0.1.0',
    ]);
    expect(state).toEqual({ published: true, tagged: false, released: false });
    expect(runRelease(state)).toEqual(['git tag v0.1.0', 'git push origin v0.1.0', 'release']);
    expect(state).toEqual({ published: true, tagged: true, released: true });
  });

  it('retries only GitHub Release creation after that stage fails', () => {
    const state = { published: false, tagged: false, released: false };
    runRelease(state, 'release');
    expect(state).toEqual({ published: true, tagged: true, released: false });
    expect(runRelease(state)).toEqual(['release']);
    expect(state).toEqual({ published: true, tagged: true, released: true });
  });
});
