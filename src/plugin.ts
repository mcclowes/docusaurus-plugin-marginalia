import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';
import type { MarginaliaOptions } from './types';

const getModuleDir = (): string => {
  if (typeof __dirname === 'string') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
};

const resolveGlobalStylesPath = (moduleDir: string) =>
  join(moduleDir, 'theme/Marginalia/globalStylesLoader.js');

const resolveThemePath = (moduleDir: string) => join(moduleDir, 'theme');

const resolveTypeScriptThemePath = (moduleDir: string): string | undefined => {
  const candidate = join(moduleDir, '../src/theme');
  return existsSync(candidate) ? candidate : undefined;
};

export default function marginaliaPlugin(
  _context: LoadContext,
  options: MarginaliaOptions = {}
): Plugin<void> {
  const enabled = options.enabled ?? true;
  const moduleDir = getModuleDir();
  const themePath = resolveThemePath(moduleDir);
  const typeScriptThemePath = resolveTypeScriptThemePath(moduleDir);
  const globalStylesPath = resolveGlobalStylesPath(moduleDir);

  if (enabled && !existsSync(globalStylesPath)) {
    throw new Error(
      `[docusaurus-plugin-marginalia] Missing build artifact at ${globalStylesPath}. ` +
        `Run \`npm run build\` in the plugin package before using it.`
    );
  }

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
