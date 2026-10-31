import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hierarchyImageName, ssgiWorkExperiments } from '@three-fidelity/renderers';
import { listSceneNames } from '@three-fidelity/scenes';
import yargs from 'yargs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderPath, repoRoot } from '../paths.js';
import type { RenderJob } from '../render-process.js';
import { command } from './render.js';
import { renderSuite } from 'fidelity-kit/render';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('fidelity-kit/render', () => ({ renderSuite: vi.fn() }));

const byString = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const scenes = listSceneNames().slice(0, 2);
let output: string;
let jobs: RenderJob[];

beforeEach(async () => {
  vi.mocked(renderSuite).mockReset();
  output = await mkdtemp(path.join(os.tmpdir(), 'three-fidelity-missing-only-'));
  jobs = [];
  vi.mocked(spawn)
    .mockReset()
    .mockImplementation((_command, args) => {
      jobs.push(JSON.parse(args![1]!) as RenderJob);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0));
      return child as ReturnType<typeof spawn>;
    });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

test('browser rendering forwards missing-only with imported scene and renderer globs', async () => {
  const previousCwd = process.cwd();
  vi.mocked(renderSuite).mockImplementation(async () => {
    expect(process.cwd()).toBe(path.resolve(repoRoot));
  });
  await yargs()
    .command(command)
    .exitProcess(false)
    .parseAsync([
      'render',
      '--missing-only',
      '--scenes',
      'pt-gi-*',
      '--renderers',
      'three-gpu-pathtracer*,blender',
      '--output',
      output,
    ]);
  expect(renderSuite).toHaveBeenCalledWith(
    expect.objectContaining({
      missingOnly: true,
      out: output,
      scene: listSceneNames().filter((name) => name.startsWith('pt-gi-')),
      renderer: ['three-gpu-pathtracer', 'blender', 'three-gpu-pathtracer-webgpu-experimental'],
    }),
  );
  expect(spawn).not.toHaveBeenCalled();
  expect(process.cwd()).toBe(previousCwd);
});

test('browser rendering restores the caller directory after capture failures', async () => {
  const previousCwd = process.cwd();
  vi.mocked(renderSuite).mockRejectedValueOnce(new Error('capture failed'));
  await expect(
    yargs().command(command).exitProcess(false).parseAsync(['render', '--scenes', 'pt-gi-basic']),
  ).rejects.toThrow('capture failed');
  expect(process.cwd()).toBe(previousCwd);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(output, { recursive: true, force: true });
});

async function image(scene: string, name: string): Promise<string> {
  const file = renderPath(scene, name, output);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'existing image');
  return file;
}

async function render(...args: string[]): Promise<void> {
  await yargs()
    .command(command)
    .exitProcess(false)
    .parseAsync([
      'render',
      '--native',
      ...(args.includes('--scenes') ? [] : ['--scenes', scenes[0]!]),
      ...(args.includes('--renderers') ? [] : ['--renderers', 'three-new-baseline']),
      '--output',
      output,
      ...args,
    ]);
}

test('missing-only skips existing scene/renderer pairs before spawning a child', async () => {
  const file = await image(scenes[0]!, 'three-new');
  await render('--missing-only', '--scenes', scenes.join(','), '--renderers', 'three-new-baseline,blender');
  expect(jobs.map((job) => [job.scenes[0], job.renderer]).toSorted(byString)).toEqual(
    [
      [scenes[1], 'three-new'],
      [scenes[0], 'blender'],
      [scenes[1], 'blender'],
    ].toSorted(byString),
  );
  expect(await readFile(file, 'utf8')).toBe('existing image');
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('skipped'));
});

test('default rendering still starts jobs for existing images', async () => {
  await image(scenes[0]!, 'three-new');
  await render();
  expect(jobs).toHaveLength(1);
  await render('--missing-only=false');
  expect(jobs).toHaveLength(2);
});

test('missing-only skips a complete set without starting any children', async () => {
  await image(scenes[0]!, 'three-new');
  await image(scenes[0]!, 'blender');
  await render('--missing-only', '--renderers', 'three-new-baseline,blender');
  expect(spawn).not.toHaveBeenCalled();
});

test('intentional black references require explicit native Blender selection', async () => {
  await render('--allow-all-black', '--renderers', 'blender');
  expect(jobs[0]!.allowAllBlack).toBe(true);
  await expect(render('--allow-all-black')).rejects.toThrow('requires selecting only Blender');
  await expect(
    yargs().command(command).exitProcess(false).parseAsync(['render', '--allow-all-black', '--renderers', 'blender']),
  ).rejects.toThrow('require --native');
});

test('full renderer names preserve variant and SSR debug output names', async () => {
  const experiment = 'ssr-hiz-tight';
  const name = hierarchyImageName('three-new', experiment);
  await image(scenes[0]!, 'three-new');
  await render('--missing-only', '--renderers', `three-new-${experiment}`);
  expect(jobs).toHaveLength(1);
  await image(scenes[0]!, name);
  await render('--missing-only', '--renderers', `three-new-${experiment}`);
  expect(jobs).toHaveLength(1);
  await render('--missing-only', '--renderers', `three-new-${experiment}`, '--ssr-debug', 'hits');
  expect(jobs).toHaveLength(2);
  await image(scenes[0]!, `${name}@hits`);
  await render('--missing-only', '--renderers', `three-new-${experiment}`, '--ssr-debug', 'hits');
  expect(jobs).toHaveLength(2);
});

test('partial motion jobs keep motion parameters and capture only missing frames', async () => {
  const file = await image(scenes[0]!, 'three-new@m0');
  await image(scenes[0]!, 'three-new@m8');
  await render('--missing-only', '--motion', '30,10,0,4,8', '--motion-object', 'cube:2');
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.motion).toEqual({
    degrees: 30,
    moveFrames: 10,
    captures: [4],
    object: { name: 'cube', dx: 2 },
  });
  expect(await readFile(file, 'utf8')).toBe('existing image');
  await image(scenes[0]!, 'three-new@m4');
  await render('--missing-only', '--motion', '30,10,0,4,8');
  expect(jobs).toHaveLength(1);
});

test('motion capture names take precedence over SSR debug names and include experiments', async () => {
  const name = hierarchyImageName('three-new', 'ssr-hiz-tight');
  await image(scenes[0]!, `${name}@m0`);
  await render(
    '--missing-only',
    '--renderers',
    'three-new-ssr-hiz-tight',
    '--ssr-debug',
    'hits',
    '--motion',
    '30,10,0',
  );
  expect(spawn).not.toHaveBeenCalled();
});

test('missing-only preserves unsupported Blender mode failures in the render process', async () => {
  await image(scenes[0]!, 'blender');
  await render('--missing-only', '--renderers', 'blender', '--ssr-debug', 'hits');
  expect(jobs).toHaveLength(1);
});

test('default renderer selection excludes experimental and disabled configurations', async () => {
  await yargs()
    .command(command)
    .exitProcess(false)
    .parseAsync(['render', '--native', '--scenes', scenes[0]!, '--output', output]);
  expect(jobs.length).toBeGreaterThan(0);
  expect(jobs.map((job) => job.renderer)).not.toContain('three-gpu-pathtracer-webgpu-experimental');
  expect(jobs.map((job) => job.hierarchyExperiment)).not.toContain('ssr-radiance-mips');
  await render('--renderers', 'three-gpu-pathtracer-webgpu-experimental');
  expect(jobs.at(-1)?.renderer).toBe('three-gpu-pathtracer-webgpu-experimental');
});

test('renderer globs and comma-separated names select complete configurations once', async () => {
  await render('--renderers', 'three-new-*,three-new-hierarchy-combined,blender');
  expect(jobs.map((job) => [job.renderer, job.hierarchyExperiment]).toSorted(byString)).toEqual(
    [
      ['three-new', 'baseline'],
      ['three-new', 'ssr-hiz-tight'],
      ['three-new', 'ssr-radiance-mips'],
      ['three-new', 'ssgi-radiance-mips'],
      ['three-new', 'hierarchy-combined'],
      ...Object.keys(ssgiWorkExperiments).map((experiment) => ['three-new', experiment]),
      ['three-new', 'ssgi-half'],
      ['three-new', 'ssgi-third'],
      ['three-new', 'ssr-temporal-validated'],
      ['three-new', 'ssr-temporal-gaussian'],
      ['three-new-ssr-no-filter', undefined],
      ['three-new-ssr-no-hit-specular', undefined],
      ['three-new-ssr-no-back-depth', undefined],
      ['three-new-ssr-no-hiz', undefined],
      ['three-new-ssr-biased-lobe', undefined],
      ['three-new-ssr-short-rays', undefined],
      ['three-new-ssr-distance-fade', undefined],
      ['three-new-ssr-additive-env', undefined],
      ['three-new-ssr-capped-march', undefined],
      ['three-new-light-bake', undefined],
      ['three-new-vpl', undefined],
      ['three-new-vpl-shadow-maps', undefined],
      ['three-new-light-probe', undefined],
      ['three-new-light-probe-ddgi', undefined],
      ['blender', undefined],
    ].toSorted(byString),
  );
});

test('render rejects the removed experiment option and the old ambiguous renderer name', async () => {
  await expect(render('--experiment', 'hierarchy-combined')).rejects.toThrow('Unknown argument: experiment');
  await expect(render('--renderers', 'three-new')).rejects.toThrow('No renderer matches');
  expect(spawn).not.toHaveBeenCalled();
});

test('rejects the retired WebGPU path tracer name', async () => {
  await expect(render('--renderers', 'three-gpu-pathtracer-webgpu')).rejects.toThrow('No renderer matches');
  expect(spawn).not.toHaveBeenCalled();
});
