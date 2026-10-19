import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { SeagrassTuft } from '@/lib/seagrass';

const BASE = new Color('#3B6E3A'), MIDDLE = new Color('#5C9447'), TIP = new Color('#9DC266'), DRY = new Color('#B5B264');

/**
 * Every blade of every tuft (src/lib/seagrass.ts) in one geometry, for seagrass-meadow.tsx: each
 * blade a strap bent a little outward, two segments (a quad and a pointed tip), darker at its base
 * and paler toward the tip, a few yellowing. `aGrass` is (how far up the blade, its tuft's phase,
 * 0, 0) for the shader's sway.
 */
export function buildSeagrassGeometry(tufts: readonly SeagrassTuft[], blades: number) {
  const positions: number[] = [], colors: number[] = [], grass: number[] = [];
  const color = new Color();
  const vertex = (x: number, y: number, z: number, up: number, phase: number, c: Color) => {
    positions.push(x, y, z); colors.push(c.r, c.g, c.b); grass.push(up, phase, 0, 0);
  };
  tufts.forEach((tuft, t) => {
    for (let b = 0; b < blades; b++) {
      const a = tuft.turn + b * Math.PI * 2 / blades + (b % 2) * .4, ca = Math.cos(a), sa = Math.sin(a);
      const h = tuft.height * (.75 + .25 * ((b * 7 + t) % 5) / 4), w = .009, lean = .3 * h;
      // Across the blade (perpendicular to its lean), its base just out from the tuft's middle.
      const bx = tuft.x + ca * .006, bz = tuft.z + sa * .006, px = -sa * w, pz = ca * w;
      const mx = bx + ca * lean * .35, mz = bz + sa * lean * .35, tx = bx + ca * lean, tz = bz + sa * lean;
      const y0 = tuft.floor - .01, y1 = tuft.floor + h * .55, y2 = tuft.floor + h;
      const tip = color.copy(MIDDLE).lerp(TIP, .7).lerp(DRY, (t * 13 + b) % 9 === 0 ? .6 : 0).clone();
      const mid = color.copy(BASE).lerp(MIDDLE, .8).clone();
      // Quad from the base to the middle, then a pointed tip.
      vertex(bx - px, y0, bz - pz, 0, tuft.phase, BASE); vertex(bx + px, y0, bz + pz, 0, tuft.phase, BASE); vertex(mx + px * .85, y1, mz + pz * .85, .55, tuft.phase, mid);
      vertex(bx - px, y0, bz - pz, 0, tuft.phase, BASE); vertex(mx + px * .85, y1, mz + pz * .85, .55, tuft.phase, mid); vertex(mx - px * .85, y1, mz - pz * .85, .55, tuft.phase, mid);
      vertex(mx - px * .85, y1, mz - pz * .85, .55, tuft.phase, mid); vertex(mx + px * .85, y1, mz + pz * .85, .55, tuft.phase, mid); vertex(tx, y2, tz, 1, tuft.phase, tip);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aGrass', new Float32BufferAttribute(grass, 4));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
