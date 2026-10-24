"""Refine the reef-fish family GLB after scripts/art/prepare-marine.py has exported it (stdlib only, no Blender).

The Quaternius reef fish is a needle seen from above, and its two eye spheres stand clear of the
head like ears. This post-process, applied to the exported GLB's vertex data only (no bone, node,
skin or animation is touched, so src/lib/marine-rigs.ts keeps driving it by the same bone names):

  * widens the body, its fins and the eye positions 1.35x across the body (X), normals corrected;
  * shrinks each eye to three quarters of its size and sets it into the head, a little proud of the skin.

It marks the file (asset.extras.refined) so running it twice does nothing.
Run: python3 scripts/art/refine-reef-fish.py [assets/models/marine/reef-fish.glb]
"""
import json
import math
import struct
import sys
from pathlib import Path

WIDEN = 1.35
EYE_SCALE = 0.75
# Eye centre, across the head (X), measured from the widened body: just proud of the skin.
EYE_X = 0.0425
MARK = 'reef-fish-widen-1.35'


def main(path: Path) -> None:
    data = path.read_bytes()
    magic, version, _total = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2, 'not a glTF 2 binary'
    off, chunks = 12, []
    while off < len(data):
        length, kind = struct.unpack_from('<II', data, off)
        chunks.append([kind, bytearray(data[off + 8:off + 8 + length])])
        off += 8 + length
    gltf = json.loads(bytes(chunks[0][1]).decode('utf8'))
    binary = chunks[1][1]
    if gltf['asset'].get('extras', {}).get('refined') == MARK:
        print('already refined:', path)
        return

    def read(accessor: int):
        a = gltf['accessors'][accessor]
        view = gltf['bufferViews'][a['bufferView']]
        base = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [list(struct.unpack_from('<3f', binary, base + 12 * i)) for i in range(a['count'])], base

    def write(accessor: int, values, base: int) -> None:
        for i, v in enumerate(values):
            struct.pack_into('<3f', binary, base + 12 * i, *v)
        a = gltf['accessors'][accessor]
        if 'min' in a:
            a['min'] = [min(v[k] for v in values) for k in range(3)]
            a['max'] = [max(v[k] for v in values) for k in range(3)]

    # Meshes: the two eyes, then the body in three material groups (Bottom, Top, Fins).
    eyes = [gltf['meshes'][0]['primitives'][0]['attributes'], gltf['meshes'][1]['primitives'][0]['attributes']]
    assert gltf['meshes'][0]['primitives'][0]['material'] == 0, 'expected the eyes first'
    body = [p['attributes'] for p in gltf['meshes'][2]['primitives']]

    for attrs in body:
        positions, base = read(attrs['POSITION'])
        write(attrs['POSITION'], [[x * WIDEN, y, z] for x, y, z in positions], base)
        normals, nbase = read(attrs['NORMAL'])
        fixed = []
        for x, y, z in normals:
            nx = x / WIDEN
            n = math.sqrt(nx * nx + y * y + z * z) or 1
            fixed.append([nx / n, y / n, z / n])
        write(attrs['NORMAL'], fixed, nbase)

    for attrs in eyes:
        positions, base = read(attrs['POSITION'])
        n = len(positions)
        centre = [sum(p[k] for p in positions) / n for k in range(3)]
        side = 1 if centre[0] > 0 else -1
        moved = [[side * EYE_X + (p[0] - centre[0]) * EYE_SCALE, centre[1] + (p[1] - centre[1]) * EYE_SCALE, centre[2] + (p[2] - centre[2]) * EYE_SCALE] for p in positions]
        write(attrs['POSITION'], moved, base)

    gltf['asset'].setdefault('extras', {})['refined'] = MARK
    raw = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    raw += b' ' * (-len(raw) % 4)
    chunks[0][1] = bytearray(raw)
    out = bytearray(struct.pack('<III', magic, version, 0))
    for kind, payload in chunks:
        out += struct.pack('<II', len(payload), kind) + payload
    struct.pack_into('<I', out, 8, len(out))
    path.write_bytes(bytes(out))
    print('refined', path, len(out), 'bytes')


if __name__ == '__main__':
    default = Path(__file__).resolve().parents[2] / 'assets/models/marine/reef-fish.glb'
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else default)
