# Three.js light baking sources

Copied from https://github.com/mrdoob/three.js/pull/34991 at bhouston/three.js commit `afffb03157212f7bcf413cede8f97b470abf4c09` (MIT; see LICENSE).

LightMapper.js, VXGIIrradiance.js, and unwrapUVs.js retain the upstream implementation. remapAttribute.js extracts the upstream BufferGeometryUtils helper. Imports point to this local directory or the existing pinned fork's cone tracer and potpack. The fork remains unchanged.
