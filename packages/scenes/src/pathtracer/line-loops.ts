import { Line, LineLoop, type Object3D } from 'three';

/** Express closed strips as ordinary lines, supported by both Three rendering backends. */
export function normalizeLineLoops(root: Object3D): void {
  const loops: LineLoop[] = [];
  root.traverse((object) => {
    if ((object as LineLoop).isLineLoop) loops.push(object as LineLoop);
  });
  for (const loop of loops) {
    if (!loop.parent) throw new Error('A scene root cannot be a LineLoop');
    const geometry = loop.geometry.clone();
    const count = geometry.index?.count ?? geometry.getAttribute('position').count;
    const indices = Array.from({ length: count }, (_, i) => geometry.index?.getX(i) ?? i);
    if (count > 0) indices.push(indices[0]!);
    geometry.setIndex(indices);
    const line = new Line(geometry, loop.material).copy(loop, false);
    line.geometry = geometry;
    while (loop.children.length) line.add(loop.children[0]!);
    const parent = loop.parent;
    const slot = parent.children.indexOf(loop);
    parent.remove(loop);
    parent.add(line);
    parent.children.splice(parent.children.indexOf(line), 1);
    parent.children.splice(slot, 0, line);
  }
}
