import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'theme/Marginalia/index': 'src/theme/Marginalia/index.ts',
    'theme/Marginalia/Marginalia': 'src/theme/Marginalia/Marginalia.tsx',
    'theme/Marginalia/Aside': 'src/theme/Marginalia/Aside.tsx',
    'theme/Marginalia/Endpoint': 'src/theme/Marginalia/Endpoint.tsx',
    'theme/Marginalia/MarginaliaContext': 'src/theme/Marginalia/MarginaliaContext.ts',
    'theme/Marginalia/globalStylesLoader': 'src/theme/Marginalia/globalStylesLoader.ts',
  },
  dts: true,
  format: ['cjs', 'esm'],
  sourcemap: true,
  clean: true,
  target: 'es2020',
  external: ['react', 'react-dom', '@docusaurus/types', '@docusaurus/core'],
  loader: {
    '.css': 'copy',
  },
});
