"""Run with Blender --background --python scripts/convert-research-environments.py.
Resample pinned PBRT equal-area lights into world-space Three equirectangular HDRs.
Uses Blender's float image decoder and bundled numpy; no display transform is applied.
"""
import json
from pathlib import Path
import bpy
import numpy as np

entries = json.loads(Path('packages/scenes/src/research-scenes.json').read_text())
out = Path('assets/research-environments')
out.mkdir(exist_ok=True)
width, height = 1024, 512
u, v = np.meshgrid((np.arange(width) + .5) / width, (np.arange(height) + .5) / height)
# Output rows run north to south. Three equirect: atan2(z,x)/(2pi)+.5.
theta, phi = v * np.pi, (u - .5) * 2 * np.pi
world = np.stack([np.sin(theta)*np.cos(phi), np.cos(theta), np.sin(theta)*np.sin(phi)], axis=-1)
for entry in entries:
    for light in entry['lights']:
        if light['pbrt'] != 'infinite' or not light.get('source'):
            continue
        path = Path('submodules/gltf-research-scenes/scenes') / entry['id'] / 'source' / light['source']
        if not path.exists():
            print(f'Missing upstream environment, excluded from capture: {path}')
            continue
        image = None
        if path.suffix.lower() == '.pfm':
            with path.open('rb') as f:
                assert f.readline().strip() == b'PF'
                iw, ih = map(int, f.readline().split())
                scale = float(f.readline())
                pixels = np.frombuffer(f.read(), dtype='<f4' if scale < 0 else '>f4').reshape(ih, iw, 3)[::-1] * abs(scale)
        else:
            image = bpy.data.images.load(str(path.resolve()), check_existing=False)
            iw, ih = image.size
            pixels = np.empty(iw * ih * 4, dtype=np.float32)
            image.pixels.foreach_get(pixels)
            pixels = pixels.reshape(ih, iw, 4)[::-1]  # Blender bottom-up -> PBRT top-down
        transform = np.array(light['pbrt_transform']).reshape(4,4).T[:3,:3]
        direction = world @ np.linalg.inv(transform).T
        direction /= np.linalg.norm(direction, axis=-1, keepdims=True)
        x,y,z = np.moveaxis(direction,-1,0)
        r = np.sqrt(np.maximum(0,1-np.abs(z)))
        angle = np.arctan2(np.abs(y),np.abs(x)) * (2/np.pi)
        vv = angle*r
        uu = r-vv
        uu,vv = np.where(z<0,1-vv,uu),np.where(z<0,1-uu,vv)
        su = (np.copysign(uu,x)+1)/2
        sv = (np.copysign(vv,y)+1)/2
        # Bilinear filtering in the source square, clamped at its boundary.
        sx,sy = np.clip(su*iw-.5,0,iw-1),np.clip(sv*ih-.5,0,ih-1)
        x0,y0 = sx.astype(int),sy.astype(int)
        x1,y1 = np.minimum(x0+1,iw-1),np.minimum(y0+1,ih-1)
        fx,fy = (sx-x0)[...,None],(sy-y0)[...,None]
        rgb = ((pixels[y0,x0,:3]*(1-fx)+pixels[y0,x1,:3]*fx)*(1-fy)
               +(pixels[y1,x0,:3]*(1-fx)+pixels[y1,x1,:3]*fx)*fy)
        rgb *= np.array(light.get('radiance_rgb',[1,1,1]))
        peak = np.max(rgb,axis=-1)
        mantissa, exponent = np.frexp(peak)
        scale = np.divide(mantissa*256,peak,out=np.zeros_like(peak),where=peak>1e-32)
        rgbe = np.concatenate([np.clip(rgb*scale[...,None],0,255).astype(np.uint8),
                               np.where(peak>1e-32,exponent+128,0).astype(np.uint8)[...,None]],axis=-1)
        target=out/(entry['id']+'.hdr')
        with target.open('wb') as f:
            f.write(f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n'.encode())
            for row in rgbe:
                f.write(bytes([2,2,width>>8,width&255]))
                for channel in row.T:
                    for start in range(0,width,128):
                        chunk=channel[start:start+128]
                        f.write(bytes([len(chunk)])); f.write(chunk.tobytes())
        if image is not None: bpy.data.images.remove(image)
        print(target)
