import { Mesh } from 'three';
import type { BufferAttribute } from 'three';
import { computeMorphedAttributes } from 'three/addons/utils/BufferGeometryUtils.js';

/** Snapshot the canonical pose; missing normals use the same flat faces as the raster material. */
export function createBakeProxy(mesh: Mesh): Mesh {
  const missingNormals = !mesh.geometry.hasAttribute('normal');
  const geometry = missingNormals && mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  let source = mesh;
  if (missingNormals) {
    geometry.computeVertexNormals();
    source = mesh.clone();
    source.geometry = geometry;
  }
  const posed = computeMorphedAttributes(source) as {
    morphedPositionAttribute: BufferAttribute;
    morphedNormalAttribute: BufferAttribute;
  };
  geometry.setAttribute('position', posed.morphedPositionAttribute);
  if (missingNormals) geometry.computeVertexNormals();
  else geometry.setAttribute('normal', posed.morphedNormalAttribute);
  const proxy = new Mesh(geometry, mesh.material);
  proxy.matrixAutoUpdate = false;
  proxy.matrix.copy(mesh.matrixWorld);
  return proxy;
}
