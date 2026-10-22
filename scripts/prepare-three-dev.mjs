// Use the pinned dev source rather than its checked-in release bundles.
import { mkdir, writeFile } from 'node:fs/promises';

const build = new URL('../submodules/three-dev/build/', import.meta.url);
await mkdir(build, { recursive: true });
for (const [name, source] of Object.entries({
  'three.core.js': 'Three.Core.js',
  'three.module.js': 'Three.js',
  'three.webgpu.js': 'Three.WebGPU.js',
  'three.webgpu.nodes.js': 'Three.WebGPU.Nodes.js',
  'three.tsl.js': 'Three.TSL.js',
})) {
  await writeFile(new URL(name, build), `export * from '../src/${source}';\n`);
}
