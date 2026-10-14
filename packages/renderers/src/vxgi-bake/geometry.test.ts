import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { createBakeProxy } from './geometry.js';

test('bakes indexed meshes without normals without changing the input geometry', () => {
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2]);
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ flatShading: true }));
  mesh.position.x = 3;
  mesh.updateMatrixWorld();
  const proxy = createBakeProxy(mesh),
    normal = proxy.geometry.getAttribute('normal');
  expect(proxy.geometry.index).toBeNull();
  expect([normal.getX(0), normal.getY(0), normal.getZ(0)]).toEqual([0, 0, 1]);
  expect(proxy.matrix).toEqual(mesh.matrixWorld);
  expect(mesh.geometry).toBe(geometry);
  expect(geometry.hasAttribute('normal')).toBe(false);
  proxy.geometry.dispose();
});
test('derives flat normals from the posed morph positions rather than the base pose', () => {
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.morphAttributes.position = [new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 1], 3)];
  geometry.morphTargetsRelative = true;
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ flatShading: true }));
  mesh.morphTargetInfluences = [1];
  const proxy = createBakeProxy(mesh),
    normal = proxy.geometry.getAttribute('normal');
  expect(proxy.geometry.getAttribute('position').getZ(2)).toBe(1);
  expect(normal.getY(0)).toBeCloseTo(-Math.SQRT1_2);
  expect(normal.getZ(0)).toBeCloseTo(Math.SQRT1_2);
  expect(geometry.getAttribute('position').getZ(2)).toBe(0);
  expect(geometry.hasAttribute('normal')).toBe(false);
  proxy.geometry.dispose();
});
