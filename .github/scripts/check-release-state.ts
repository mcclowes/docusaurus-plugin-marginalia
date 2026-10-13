import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

type ReleaseConfig = {
  packageName: string;
  version: string;
  repository: string;
  token: string;
};

export async function checkReleaseState(
  { packageName, version, repository, token }: ReleaseConfig,
  outputFile: string,
  fetcher: typeof fetch = fetch
) {
  const tag = `v${version}`;
  const githubBase = `https://api.github.com/repos/${repository}`;
  const checks = [
    {
      key: 'published',
      url: `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
      field: 'version',
      expected: version,
    },
    {
      key: 'tagged',
      url: `${githubBase}/git/ref/tags/${encodeURIComponent(tag)}`,
      field: 'ref',
      expected: `refs/tags/${tag}`,
    },
    {
      key: 'released',
      url: `${githubBase}/releases/tags/${encodeURIComponent(tag)}`,
      field: 'tag_name',
      expected: tag,
    },
  ];
  const states = await Promise.all(
    checks.map(async ({ key, url, field, expected }) => {
      try {
        const response = await fetcher(url, {
          headers:
            key === 'published'
              ? { Accept: 'application/json' }
              : { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 404) return `${key}=false`;
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (
          !body ||
          typeof body !== 'object' ||
          (body as Record<string, unknown>)[field] !== expected
        ) {
          throw new Error('Unexpected response identity');
        }
        if (key === 'released' && (body as Record<string, unknown>).draft === true) {
          return 'released=false';
        }
        return `${key}=true`;
      } catch (error) {
        throw new Error(`Could not check ${key}: ${(error as Error).message}`);
      }
    })
  );
  appendFileSync(outputFile, `${states.join('\n')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.GH_TOKEN;
    const outputFile = process.env.GITHUB_OUTPUT;
    if (!name || !version || !repository || !token || !outputFile) {
      throw new Error('Package metadata and GitHub release-check environment are required');
    }
    await checkReleaseState({ packageName: name, version, repository, token }, outputFile);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
