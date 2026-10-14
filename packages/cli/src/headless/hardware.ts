export function requireHardwareGPU(description: string): void {
  if (
    !description.trim() ||
    /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|\bwarp\b|\bcpu\b/i.test(description)
  ) {
    throw new Error(
      'Rendering verification blocked: a real hardware GPU is required (' +
        (description || 'adapter unavailable') +
        ')',
    );
  }
}

/** Large imported BVHs can exceed WebGPU's conservative default buffer limits. */
export function hardwareBufferLimits(
  limits: Pick<GPUSupportedLimits, 'maxBufferSize' | 'maxStorageBufferBindingSize'>,
  requested: GPUDeviceDescriptor['requiredLimits'] = {},
): GPUDeviceDescriptor['requiredLimits'] {
  return {
    maxBufferSize: limits.maxBufferSize,
    maxStorageBufferBindingSize: Math.min(
      limits.maxStorageBufferBindingSize,
      requested.maxBufferSize ?? limits.maxBufferSize,
    ),
    ...requested,
  };
}
