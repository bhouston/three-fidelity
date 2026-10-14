import { expect, it } from 'vitest';
import { requireHardwareGPU, hardwareBufferLimits } from './hardware.js';
it.each(['', 'SwiftShader Device', 'llvmpipe', 'lavapipe', 'Microsoft Basic Render Driver', 'WARP', 'CPU adapter'])(
  'blocks unavailable or software GPU %s',
  (value) => {
    expect(() => requireHardwareGPU(value)).toThrow('Rendering verification blocked');
  },
);
it('requests adapter-supported buffer limits while respecting explicit caller constraints', () => {
  const limits = { maxBufferSize: 2 ** 31, maxStorageBufferBindingSize: 2 ** 31 };
  expect(hardwareBufferLimits(limits)).toEqual(limits);
  expect(hardwareBufferLimits(limits, { maxBufferSize: 2 ** 28, maxStorageBufferBindingSize: 2 ** 27 })).toEqual({
    maxBufferSize: 2 ** 28,
    maxStorageBufferBindingSize: 2 ** 27,
  });
  expect(hardwareBufferLimits(limits, { maxBufferSize: 2 ** 28 })).toEqual({
    maxBufferSize: 2 ** 28,
    maxStorageBufferBindingSize: 2 ** 28,
  });
});
it.each(['ANGLE (NVIDIA GeForce GTX 1050 Direct3D11)', 'Intel Gen12', 'AMD Radeon', 'Apple M2'])(
  'permits hardware adapter %s',
  (value) => {
    expect(() => requireHardwareGPU(value)).not.toThrow();
  },
);
