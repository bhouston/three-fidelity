# Three.js light baking sources

Copied from https://github.com/mrdoob/three.js/pull/34991 at bhouston/three.js commit `afffb03157212f7bcf413cede8f97b470abf4c09` (MIT; see LICENSE).

LightMapper.js, VXGIIrradiance.js, and unwrapUVs.js retain the upstream implementation. remapAttribute.js extracts the upstream BufferGeometryUtils helper. VXGIConeTracer.js and potpack.module.js are copied unchanged from the existing fork commit `83c310af72715ae558beea12d169f00c62ea48eb`; local copies prevent TypeScript from traversing generated fork code when emitting JS declarations. Imports point to this local directory. The fork remains unchanged.
