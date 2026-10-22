import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineLoop } from 'three';
import { normalizeLineLoops } from './line-loops.js';

describe('closed line compatibility', () => {
  it.each([false, true])('preserves the closing edge and source buffers (indexed=%s)', (indexed) => {
    const geometry = new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0], 3),
    );
    if (indexed) geometry.setIndex([2, 0, 1]);
    const material = new LineBasicMaterial({ color: 'red' });
    const loop = new LineLoop(geometry, material);
    loop.position.set(2, 3, 4);
    loop.name = 'closed';
    const child = new Group();
    loop.add(child);
    const root = new Group();
    const sibling = new Group();
    root.add(loop, sibling);
    normalizeLineLoops(root);
    const result = root.children[0] as Line;
    expect(result.isLine).toBe(true);
    expect((result as LineLoop).isLineLoop).toBeUndefined();
    expect(Array.from(result.geometry.index!.array)).toEqual(indexed ? [2, 0, 1, 2] : [0, 1, 2, 0]);
    expect(geometry.index?.count).toBe(indexed ? 3 : undefined);
    expect(result.geometry).not.toBe(geometry);
    expect(result.material).toBe(material);
    expect(result.position.toArray()).toEqual([2, 3, 4]);
    expect(result.name).toBe('closed');
    expect(child.parent).toBe(result);
    expect(root.children[1]).toBe(sibling);
  });
});
