import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import type { KelpPlant } from '@/lib/kelp';
import { OCEAN } from '@/lib/ocean';

/**
 * Giant kelp's colors: olive-brown stipes, olive-gold blades lightening toward their tips, the
 * yellowish gas floats at their bases, the dark holdfast, and the sunlit golden-tan canopy.
 */
const STIPE = new Color('#3E3719'), BLADE = new Color('#55461A'), BLADE_DARK = new Color('#463A16'), BLADE_TIP = new Color('#6A5822');
const FLOAT = new Color('#7A6A2A'), HOLDFAST = new Color('#3A3422'), CANOPY = new Color('#4A3E18'), CANOPY_SUN = new Color('#62521F'), CANOPY_TIP = new Color('#6E6128');
/** The canopy's dense mat of floating fronds under the blades lying on it. */
const MAT = new Color('#352D12'), MAT_EDGE = new Color('#3F3516');

export type KelpDetail = {
  /** Blades per unit of a stipe's rise, and at most per stipe. */
  bladeDensity: number; maxBlades: number;
  /** Pairs of blades along each stipe's canopy. */
  canopyPairs: number;
};
export const KELP_DETAIL: Record<'full' | 'lite', KelpDetail> = {
  full: { bladeDensity: 6, maxBlades: 8, canopyPairs: 5 },
  lite: { bladeDensity: 3, maxBlades: 4, canopyPairs: 4 },
};

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const UP = new Vector3(0, 1, 0);

/**
 * Every kelp plant in one geometry (world coordinates), flat-shaded triangles. Besides position,
 * normal and color, each vertex carries `aKelp`: x its rise (0 at the holdfast, 1 at the surface),
 * y how far along the canopy it is (0 below the surface), z its plant's sway phase, w how freely it
 * flutters (0 on the stipe, 1 at a blade's tip). `aAnchor` is where on its stipe each piece hangs
 * (x, z): a blade's, float's or canopy mat's every vertex shares one, so an animal swimming through
 * pushes the piece aside whole, never stretching it, while the stipe bends from point to point.
 * kelp-forest.tsx sways it from these in the shader.
 */
export function buildKelpGeometry(plants: readonly KelpPlant[], detail: KelpDetail) {
  const positions: number[] = [], colors: number[] = [], kelp: number[] = [], anchors: number[] = [];
  const push = (p: Vector3, color: Color, rise: number, runner: number, phase: number, flutter: number, at: Vector3) => {
    positions.push(p.x, p.y, p.z);
    colors.push(color.r, color.g, color.b);
    kelp.push(rise, runner, phase, flutter);
    anchors.push(at.x, at.z);
  };
  /** A vertex; `at`, where its piece hangs from the stipe (itself, unless given). */
  type V = { p: Vector3; color: Color; rise: number; runner: number; flutter: number; at?: Vector3 };
  const tri = (a: V, b: V, c: V, phase: number) => { for (const v of [a, b, c]) push(v.p, v.color, v.rise, v.runner, phase, v.flutter, v.at ?? v.p); };
  const quad = (a: V, b: V, c: V, d: V, phase: number) => { tri(a, b, c, phase); tri(a, c, d, phase); };
  const surface = OCEAN.surfaceLevel;
  const shade = new Color();

  /**
   * A blade: a narrow, pointed, slightly ruffled leaf from `base` along `dir`, `length` long and
   * `width` wide, bending toward `bend`. Three triangles: from its narrow base out to its widest,
   * then the tip.
   */
  const blade = (base: Vector3, dir: Vector3, bend: Vector3, length: number, width: number, rise: (p: Vector3) => number, runner: number,
    phase: number, color: Color, tip: Color, seed: number) => {
    const across = new Vector3().crossVectors(dir, UP);
    if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
    across.normalize();
    // A twist about its length, so blades catch the light differently.
    const twist = (hash(seed, 3.1) - .5) * 1.4;
    const normal = new Vector3().crossVectors(across, dir).normalize();
    across.multiplyScalar(Math.cos(twist)).addScaledVector(normal, Math.sin(twist));
    const at = (t: number) => base.clone().addScaledVector(dir, length * t).addScaledVector(bend, length * .3 * t * t);
    const sections = [[0, .16], [.42, 1]] as const;
    const pairs = sections.map(([t, w], k) => {
      const c = at(t), hw = width * .5 * w, ruffle = k === 1 ? (hash(seed, 7.7) - .5) * width * .5 : 0;
      const tone = shade.copy(k === 0 ? FLOAT : color).lerp(tip, t * .8).clone();
      const left = c.clone().addScaledVector(across, hw).addScaledVector(normal, ruffle);
      const right = c.clone().addScaledVector(across, -hw).addScaledVector(normal, -ruffle);
      return [left, right].map((p) => ({ p, color: tone, rise: rise(p), runner, flutter: t, at: base })) as [V, V];
    });
    const tipPoint = at(1);
    const end: V = { p: tipPoint, color: tip, rise: rise(tipPoint), runner, flutter: 1, at: base };
    quad(pairs[0][0], pairs[1][0], pairs[1][1], pairs[0][1], phase);
    tri(pairs[1][0], end, pairs[1][1], phase);
  };

  plants.forEach((plant, n) => {
    const { x, z, floor, height, dx, dz, canopy, stipes, phase, size } = plant;
    const flow = new Vector3(dx, 0, dz), side = new Vector3(-dz, 0, dx);
    const riseAt = (p: Vector3) => Math.min(1, Math.max(0, (p.y - floor) / height));

    // The holdfast: a low, dark, knobbly clump gripping the rock.
    const r = .036 * size;
    const ring = Array.from({ length: 5 }, (_, k) => {
      const a = Math.PI * 2 * k / 5 + hash(n, k);
      return { p: new Vector3(x + Math.cos(a) * r, floor, z + Math.sin(a) * r), color: HOLDFAST, rise: 0, runner: 0, flutter: 0 } as V;
    });
    const top: V = { p: new Vector3(x, floor + r * 1.1, z), color: HOLDFAST, rise: 0, runner: 0, flutter: 0 };
    for (let k = 0; k < 5; k++) tri(ring[k], top, ring[(k + 1) % 5], phase);

    for (let s = 0; s < stipes; s++) {
      const seed = n * 13.7 + s * 3.3, stipePhase = phase + s * .4;
      // Each stipe leans a little downstream and spreads from its neighbors toward the top.
      const spread = (hash(seed, 1.1) - .5) * .16, lean = .1 + .12 * hash(seed, 2.2);
      const topPoint = new Vector3(x, surface - .01, z).addScaledVector(flow, lean * height * .35).addScaledVector(side, spread);
      const base = new Vector3(x + (hash(seed, 4.4) - .5) * .02, floor + r * .6, z + (hash(seed, 5.5) - .5) * .02);
      // Bowed by the spread, with a gentle S-bend where the swell has worked it.
      const bend = (hash(seed, 6.6) - .5) * .05 * height;
      const along = (t: number) => base.clone().lerp(topPoint, t).addScaledVector(side, Math.sin(Math.PI * t) * spread * .5 + Math.sin(Math.PI * 2 * t) * bend);

      // The stipe: a thin ribbon, seen across from the camera's side.
      const segments = detail.maxBlades > 6 ? 5 : 4, width = .009;
      for (let k = 0; k < segments; k++) {
        const a = along(k / segments), b = along((k + 1) / segments);
        const w = new Vector3(width * .5, 0, 0);
        const v = (p: Vector3, sign: number): V => {
          const q = p.clone().addScaledVector(w, sign);
          return { p: q, color: STIPE, rise: riseAt(q), runner: 0, flutter: 0, at: p };
        };
        quad(v(a, -1), v(a, 1), v(b, 1), v(b, -1), stipePhase);
      }

      // Blades along the stipe on short floats, turning about it and angled up toward the light.
      const blades = Math.max(2, Math.min(detail.maxBlades, Math.round(height * detail.bladeDensity)));
      for (let k = 0; k < blades; k++) {
        const t = .3 + .66 * (k + hash(seed, k * 1.3) * .5) / blades;
        const attach = along(t);
        const azimuth = (k * 2.4 + hash(seed, k)) % (Math.PI * 2);
        const out = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
        const dir = out.multiplyScalar(.5).addScaledVector(UP, .8).addScaledVector(flow, .4).normalize();
        const tone = shade.copy(BLADE_DARK).lerp(BLADE, hash(seed, k + 50)).clone();
        blade(attach, dir, flow, (.11 + .05 * hash(seed, k + 70)) * size, .03 * size, riseAt, 0, stipePhase, tone, BLADE_TIP, seed + k);
      }

      // The canopy: the stipe lies along the surface and streams with the current, blades fanning
      // from it on both sides, lying on the water.
      const heading = flow.clone().applyAxisAngle(UP, (hash(seed, 9.9) - .5) * .8);
      const across = new Vector3(-heading.z, 0, heading.x);
      const length = canopy * (.75 + .5 * hash(seed, 8.8));
      const runner = (u: number) => topPoint.clone().addScaledVector(heading, length * u).addScaledVector(across, Math.sin(u * 3 + seed) * .04 * u)
        .setY(surface + .003 + .003 * Math.sin(u * 5 + seed));
      // The mat first, so the blades lie over it: the floating fronds packed along the runner, an
      // irregular patch on the water (a fan of triangles from its middle).
      // A plume: narrow where the stipe surfaces, widening downstream, its edge ragged with fronds.
      const rim = 10, mid = runner(.5);
      const matPoint = (k: number): V => {
        const a = Math.PI * 2 * k / rim, along = Math.cos(a), sideways = Math.sin(a);
        const u = Math.min(1, Math.max(0, .5 + .56 * along)), ragged = .45 + .9 * hash(seed, k + 40);
        const p = runner(u).addScaledVector(across, sideways * (.03 + .1 * u) * size * ragged);
        return { p: p.setY(surface + .001), color: shade.copy(MAT_EDGE).lerp(CANOPY, hash(seed, k + 41) * .6).clone(), rise: 1, runner: u, flutter: .3, at: mid };
      };
      // Just clear of the water: the canopy rides the waves (kelp-forest.tsx), so it stays there.
      const center: V = { p: mid.clone().setY(surface + .002), color: MAT, rise: 1, runner: .5, flutter: 0, at: mid };
      for (let k = 0; k < rim; k++) tri(center, matPoint(k + 1), matPoint(k), stipePhase);
      // Long, narrow blades streaming downstream from it at irregular angles and lengths, each on its round gas float, lying on the water.
      const canopyBlades = detail.canopyPairs * 2 - 2;
      for (let k = 0; k < canopyBlades; k++) {
        const u = Math.min(1, (k + hash(seed, k + 60)) / canopyBlades), at = runner(u);
        const sideSign = hash(seed, k + 61) < .5 ? 1 : -1;
        const tone = shade.copy(CANOPY).lerp(CANOPY_SUN, hash(seed, k + 90)).lerp(BLADE_DARK, hash(seed, k + 91) * .35).clone();
        const fan = .15 + .75 * hash(seed + sideSign, k);
        const dir = heading.clone().multiplyScalar(Math.cos(fan)).addScaledVector(across, sideSign * Math.sin(fan)).setY(.02 + .04 * hash(seed, k + 62)).normalize();
        const base = at.clone().addScaledVector(across, sideSign * .012);
        const tipTone = tone.clone().lerp(CANOPY_TIP, .55);
        blade(base, dir, heading, (.13 + .09 * hash(seed, k + 30)) * size, (.036 + .02 * hash(seed, k + 31)) * size, () => 1, u, stipePhase, tone, tipTone, seed + k * 2 + sideSign);
        // The float: a small, round, yellowish bulb at the blade's base (every other blade).
        if (k % 2) continue;
        const f = .012 * size, ring = [0, 1, 2, 3].map((q): V => {
          const a = Math.PI * q / 2 + k;
          return { p: base.clone().add(new Vector3(Math.cos(a) * f, q % 2 ? f * .5 : 0, Math.sin(a) * f)), color: FLOAT, rise: 1, runner: u, flutter: 0, at: base };
        });
        quad(ring[0], ring[1], ring[2], ring[3], stipePhase);
      }
      // The canopy's own stem along the surface.
      for (let k = 0; k < 3; k++) {
        const a = runner(k / 3), b = runner((k + 1) / 3);
        const w = across.clone().multiplyScalar(.005);
        const v = (p: Vector3, sign: number, u: number): V => ({ p: p.clone().addScaledVector(w, sign), color: STIPE, rise: 1, runner: u, flutter: 0, at: p });
        quad(v(a, -1, k / 3), v(a, 1, k / 3), v(b, 1, (k + 1) / 3), v(b, -1, (k + 1) / 3), stipePhase);
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aKelp', new Float32BufferAttribute(kelp, 4));
  geometry.setAttribute('aAnchor', new Float32BufferAttribute(anchors, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
