import { beforeEach, expect, it, vi } from 'vitest';
import type { SceneInstance } from '@three-fidelity/scenes';
import { createRenderer } from './index.js';
import { createThreeNewRenderer } from './three-new.js';
import { createCurrentRenderer } from './three-current.js';
import { createDevSSRRenderer } from './three-dev-ssr.js';
import { createVXGIRenderer } from './vxgi.js';
import { createVXGILightBakeRenderer } from './vxgi-light-bake.js';
import { createRenderer as createPathTracerRenderer } from 'fidelity-kit-three-gpu-pathtracer';
import { hierarchyExperiments, hierarchyImageName } from './types.js';
import type { RendererName, HierarchyExperiment } from './types.js';

vi.mock('./three-new.js', () => ({ createThreeNewRenderer: vi.fn() }));
vi.mock('./three-current.js', () => ({ createCurrentRenderer: vi.fn() }));
vi.mock('./three-dev-ssr.js', () => ({ createDevSSRRenderer: vi.fn() }));
vi.mock('./vxgi.js', () => ({ createVXGIRenderer: vi.fn() }));
vi.mock('./vxgi-light-bake.js', () => ({ createVXGILightBakeRenderer: vi.fn() }));
vi.mock('fidelity-kit-three-gpu-pathtracer', () => ({ createRenderer: vi.fn(), dequantizeAttributes: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('dispatches independent SSR fixes without enabling another fix or changing the stock baseline', () => {
  const setup = {} as SceneInstance;
  const canvas = {} as HTMLCanvasElement;
  const options = { width: 480, height: 360 };
  for (const fix of [
    'baseline',
    'normal-bias',
    'ray-length',
    'mirror-bias-docs',
    'dielectric-fresnel',
    'background-depth',
    'back-depth',
  ] as const) {
    void createRenderer(`three-dev-ssr-${fix}`, canvas, setup, options);
    expect(createDevSSRRenderer).toHaveBeenLastCalledWith(canvas, setup, options, fix);
  }
  for (const fix of ['baseline', 'normal-bias', 'ray-length'] as const) {
    void createRenderer(`three-dev-ssr-ggx-${fix}`, canvas, setup, options);
    expect(createDevSSRRenderer).toHaveBeenLastCalledWith(canvas, setup, options, fix, true);
  }
  expect(createCurrentRenderer).not.toHaveBeenCalled();
  expect(createThreeNewRenderer).not.toHaveBeenCalled();
});

it('dispatches each renderer name to its own pipeline without changing the scene setup', () => {
  const setup = { effects: { ssgi: { sliceCount: 8, stepCount: 32, radius: 32, thickness: 4 } } } as SceneInstance;
  const before = structuredClone(setup);
  const canvas = {} as HTMLCanvasElement;
  const options = { width: 640, height: 480 };
  void createRenderer('three-new', canvas, setup, options);
  void createRenderer('three-current', canvas, setup, options);
  void createRenderer('vxgi', canvas, setup, options);
  expect(createVXGIRenderer).toHaveBeenCalledWith(canvas, setup, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith(canvas, setup, options);
  // three-current is stock npm three.js r186, not a mode of the fork pipeline
  expect(createCurrentRenderer).toHaveBeenCalledWith(canvas, setup, options);
  expect(createPathTracerRenderer).not.toHaveBeenCalled();
  expect(setup).toEqual(before);
});

it('rejects the retired WebGPU path tracer before initializing a GPU', () => {
  expect(
    () =>
      void createRenderer('three-gpu-pathtracer-webgpu' as RendererName, {} as HTMLCanvasElement, {} as SceneInstance, {
        width: 1,
        height: 1,
      }),
  ).toThrow('Unknown renderer');
  expect(createPathTracerRenderer).not.toHaveBeenCalled();
  expect(createThreeNewRenderer).not.toHaveBeenCalled();
});

it('rejects unknown renderer names rather than silently choosing a method', () => {
  expect(
    () =>
      void createRenderer('unknown' as RendererName, {} as HTMLCanvasElement, {} as SceneInstance, {
        width: 1,
        height: 1,
      }),
  ).toThrow('Unknown renderer');
  expect(createThreeNewRenderer).not.toHaveBeenCalled();
  expect(createPathTracerRenderer).not.toHaveBeenCalled();
});

it('rejects experiments on other renderers before initializing a GPU', () => {
  const options = { width: 640, height: 480, hierarchyExperiment: 'ssr-hiz-tight' as const };
  expect(() => createRenderer('three-current', {} as HTMLCanvasElement, {} as SceneInstance, options)).toThrow(
    'require the three-new',
  );
  expect(createCurrentRenderer).not.toHaveBeenCalled();
  void createRenderer('three-new', {} as HTMLCanvasElement, {} as SceneInstance, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith({}, {}, options);
});

it('rejects misspelled experiment names instead of quietly benchmarking the baseline', () => {
  expect(
    () =>
      void createRenderer('three-new', {} as HTMLCanvasElement, {} as SceneInstance, {
        width: 640,
        height: 480,
        hierarchyExperiment: 'ssr-hzi-tight' as HierarchyExperiment,
      }),
  ).toThrow('Unknown hierarchical experiment');
  expect(createThreeNewRenderer).not.toHaveBeenCalled();
});

it('uses suite-compatible experiment image identifiers while preserving baseline names', () => {
  expect(hierarchyImageName('three-new')).toBe('three-new');
  expect(hierarchyImageName('three-new', 'baseline')).toBe('three-new');
  for (const experiment of hierarchyExperiments.filter((name) => name !== 'baseline')) {
    const label = hierarchyImageName('three-new', experiment);
    expect(label).toBe(`three-new-${experiment}`);
    expect(label).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  }
});

// A misspelled or unsupported experiment must not silently produce baseline measurements.
it('rejects SSR temporal profiles on other renderers before initializing a GPU', () => {
  expect(
    () =>
      void createRenderer('three-current', {} as HTMLCanvasElement, {} as SceneInstance, {
        width: 1,
        height: 1,
        ssrTemporalProfile: 'validated',
      }),
  ).toThrow('SSR temporal profiles require the three-new');
  expect(createCurrentRenderer).not.toHaveBeenCalled();
});
it('rejects unknown SSR temporal profiles before initializing a GPU', () => {
  expect(
    () =>
      void createRenderer('three-new', {} as HTMLCanvasElement, {} as SceneInstance, {
        width: 1,
        height: 1,
        ssrTemporalProfile: 'validtaed' as import('./types.js').SSRTemporalProfile,
      }),
  ).toThrow('Unknown SSR temporal profile');
  expect(createThreeNewRenderer).not.toHaveBeenCalled();
});

it('dispatches the basic probe renderer as a separately named pipeline', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  void createRenderer('three-new-light-probe', {} as HTMLCanvasElement, setup, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith({}, setup, options, 'light-probe');
});

it('dispatches the DDGI extension without changing the basic probe mode', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  void createRenderer('three-new-light-probe-ddgi', {} as HTMLCanvasElement, setup, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith({}, setup, options, 'light-probe-ddgi');
});

it('dispatches progressive surface baking independently of probe lighting', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  void createRenderer('three-new-light-bake', {} as HTMLCanvasElement, setup, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith({}, setup, options, 'light-bake');
});

it('dispatches surface VPL transport independently of baking and probes', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  void createRenderer('three-new-vpl', {} as HTMLCanvasElement, setup, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith({}, setup, options, 'vpl');
});

it('dispatches shadow-map VPL transport independently of the retained RIS baseline', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  void createRenderer('three-new-vpl-shadow-maps', {} as HTMLCanvasElement, setup, options);
  expect(createThreeNewRenderer).toHaveBeenCalledWith({}, setup, options, 'vpl-shadow-maps');
});

it('rejects the retired VPL mirror and box-projected variants', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  for (const name of ['three-new-vpl-mirror', 'three-new-vpl-box-projected']) {
    expect(() => createRenderer(name as RendererName, {} as HTMLCanvasElement, setup, options)).toThrow(
      'Unknown renderer',
    );
  }
});

it('dispatches baked VXGI independently of live cone tracing', () => {
  const setup = { effects: {} } as SceneInstance;
  const options = { width: 640, height: 480 };
  void createRenderer('vxgi-light-bake', {} as HTMLCanvasElement, setup, options);
  expect(createVXGILightBakeRenderer).toHaveBeenCalledWith({}, setup, options);
  expect(createVXGIRenderer).not.toHaveBeenCalled();
});

it('dispatches each full-pipeline SSR ablation independently', () => {
  const canvas = {} as HTMLCanvasElement,
    setup = {} as SceneInstance,
    options = { width: 480, height: 360 };
  for (const contribution of [
    'no-filter',
    'no-hit-specular',
    'no-back-depth',
    'no-hiz',
    'biased-lobe',
    'short-rays',
    'distance-fade',
    'additive-env',
    'capped-march',
  ] as const) {
    void createRenderer(`three-new-ssr-${contribution}`, canvas, setup, options);
    expect(createThreeNewRenderer).toHaveBeenLastCalledWith(canvas, setup, options, undefined, contribution);
  }
  expect(createDevSSRRenderer).not.toHaveBeenCalled();
});
