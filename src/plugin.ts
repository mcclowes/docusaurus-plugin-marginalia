import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';
import type { MarginaliaOptions } from './types';

const resolveGlobalStylesPath = () => {
  try {
    if (typeof __dirname === 'string') {
      return join(__dirname, 'theme/Marginalia/globalStylesLoader.js');
    }
  } catch {
    // fall through to ESM resolution
  }
  return fileURLToPath(new URL('./theme/Marginalia/globalStylesLoader.js', import.meta.url));
};

const resolveThemePath = () => {
  try {
    if (typeof __dirname === 'string') {
      return join(__dirname, 'theme');
    }
  } catch {
    // fall through to ESM resolution
  }
  return fileURLToPath(new URL('./theme', import.meta.url));
};

const resolveTypeScriptThemePath = () => {
  const candidates: string[] = [];
  try {
    if (typeof __dirname === 'string') {
      candidates.push(join(__dirname, '../src/theme'));
    }
  } catch {
    // fall through
  }
  if (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string') {
    candidates.push(fileURLToPath(new URL('../src/theme', import.meta.url)));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
};

export default function marginaliaPlugin(
  _context: LoadContext,
  options: MarginaliaOptions = {}
): Plugin<void> {
  const enabled = options.enabled ?? true;
  const themePath = resolveThemePath();
  const typeScriptThemePath = resolveTypeScriptThemePath();
  const globalStylesPath = resolveGlobalStylesPath();

  return {
    name: 'docusaurus-plugin-marginalia',

    getThemePath() {
      return themePath;
    },
    getTypeScriptThemePath() {
      return typeScriptThemePath ?? themePath;
    },
    getClientModules() {
      if (!enabled) return [];
      return [globalStylesPath];
    },
  };
}
