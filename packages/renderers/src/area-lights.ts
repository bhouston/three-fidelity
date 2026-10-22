import { RectAreaLightNode } from 'three/webgpu';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';

let initialized = false;
/** Three's WebGPU examples explicitly install the area-light BRDF lookup textures. */
export function initializeAreaLights(): void {
  if (initialized) return;
  RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
  initialized = true;
}
