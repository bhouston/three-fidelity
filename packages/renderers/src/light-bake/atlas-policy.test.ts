import { Mesh, MeshStandardMaterial, PlaneGeometry, Scene } from 'three';
import { expect, test } from 'vitest';
import { prepareAdaptiveAtlas } from './atlas-policy.js';

function fixture() {
  const scene = new Scene();
  for (let i = 0; i < 6; i++) scene.add(new Mesh(new PlaneGeometry(), new MeshStandardMaterial()));
  return scene;
}
test('grows atlas capacity when the minimum chart padding cannot fit', () => {
  const scene = fixture(),
    original = scene.children.map((o) => (o as Mesh).geometry);
  const atlas = prepareAdaptiveAtlas(scene, 16, 64, 16);
  expect(atlas.size).toBeGreaterThan(16);
  expect(atlas.size).toBeLessThanOrEqual(64);
  expect(atlas.charts).toHaveLength(6);
  atlas.charts.forEach((chart) => {
    expect(chart.w - chart.innerW).toBe(6);
    expect(chart.h - chart.innerH).toBe(6);
  });
  atlas.entries.forEach((entry) => entry.geometry.dispose());
  original.forEach((geometry) => geometry.dispose());
});
test('keeps the source geometry intact when the hardware capacity is insufficient', () => {
  const scene = fixture(),
    original = scene.children.map((o) => (o as Mesh).geometry);
  expect(() => prepareAdaptiveAtlas(scene, 16, 16, 16)).toThrow('chart budget');
  expect(scene.children.map((o) => (o as Mesh).geometry)).toEqual(original);
  original.forEach((geometry) => geometry.dispose());
});
