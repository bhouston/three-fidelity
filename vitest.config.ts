import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Runtime aliases must take precedence over the declaration-only paths used by tsc.
    alias: [
      {
        find: 'three-dev/webgpu',
        replacement: fileURLToPath(new URL('./submodules/three-dev/build/three.webgpu.js', import.meta.url)),
      },
      {
        find: 'three-dev/tsl',
        replacement: fileURLToPath(new URL('./submodules/three-dev/build/three.tsl.js', import.meta.url)),
      },
      {
        find: /^three-dev\/addons\//,
        replacement: fileURLToPath(new URL('./submodules/three-dev/examples/jsm/', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    environment: 'node',
    coverage: {
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
    },
  },
});
