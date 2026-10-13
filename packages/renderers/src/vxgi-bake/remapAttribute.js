function remapAttribute(attribute, sourceIndices, buffers = new Map()) {
  const interleaved = attribute.isInterleavedBufferAttribute;
  const source = interleaved ? attribute.data : attribute;
  const stride = interleaved ? source.stride : attribute.itemSize;
  let data = interleaved ? buffers.get(source) : undefined;

  if (data === undefined) {
    const array = new source.array.constructor(sourceIndices.length * stride);
    for (let i = 0; i < sourceIndices.length; i++) {
      for (let j = 0; j < stride; j++) array[i * stride + j] = source.array[sourceIndices[i] * stride + j];
    }

    data = interleaved
      ? new source.constructor(array, stride, source.meshPerAttribute)
      : new attribute.constructor(array, attribute.itemSize, attribute.normalized, attribute.meshPerAttribute);
    data.setUsage(source.usage);
    if (interleaved) buffers.set(source, data);
  }

  const result = interleaved
    ? new attribute.constructor(data, attribute.itemSize, attribute.offset, attribute.normalized)
    : data;
  result.name = attribute.name;
  if (!interleaved) result.gpuType = attribute.gpuType;
  return result;
}

export { remapAttribute };
