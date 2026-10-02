/**
 * Day octopus (Octopus cyanea): a rounded head with raised eyes, a distinct neck, and a soft mantle
 * sac rising behind it; eight tapering arms spread over the floor from a webbed crown beneath the
 * head. Mottled reddish brown with darker blotches and pale spots above, lighter beneath, the
 * suckers suggested by pale dots along the arms' undersides. The head is rigid with `Root`, the
 * mantle has its own bone (it breathes, settles and squeezes), and each arm four segments.
 *
 * Model space: forward (the way it walks) is +Z; the arms span about one unit across, the head
 * slightly ahead of center and the mantle trailing behind (it jets mantle-first, toward -Z).
 */
import { Vector3 } from 'three';
import { OCTOPUS_ARMS, octopusArmBone, OCTOPUS_SEGMENTS } from '../../../src/lib/marine-rigs';
import { blendSkins, chainSkin, clamp, hex, MeshBuilder, mix, noise, path, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const BASE = hex('#8b4a33'), BLOTCH = hex('#5c2c1f'), PATCH = hex('#b2704c'), SPOT = hex('#dfb393');
const BELOW = hex('#d4a184'), SUCKER = hex('#efcaad'), EYE = hex('#dccb8d'), PUPIL = hex('#1a1210'), WEB = hex('#7e4330');

/** The crown, where the arms meet under the head (Root sits here). */
const CROWN = new Vector3(0, .026, .036);
/** Where the mantle joins the head (the Mantle bone). */
const NECK = new Vector3(0, .102, -.02);
/** Arms run out radially from the crown rim to their tips. */
const ARM_BASE = .045, ARM_TIP = .5;
/** Arm segment joints, as distances from the crown's axis. */
const JOINTS = [ARM_BASE, .16, .27, .38];

/** A small, deterministic 3D mottle in [-1, 1]. */
const mottle = (p: Vector3, scale: number, seed: number) =>
  noise(p.x * scale + 3.1 * noise(p.z * scale * .8, seed + 1) + 5.7 * noise(p.y * scale * 1.1, seed + 2), seed);

/** Skin above: reddish brown, darker blotches, warmer patches and the odd pale spot. */
function skinColor(p: Vector3, seed: number): RGB {
  const blotch = smoothstep(.2, .55, mottle(p, 19, seed));
  const patch = smoothstep(.35, .7, mottle(p, 31, seed + 9));
  const spot = smoothstep(.72, .86, mottle(p, 57, seed + 21));
  return mix(mix(mix(BASE, PATCH, patch * .7), BLOTCH, blotch * .75), SPOT, spot * .8);
}

export function buildDayOctopus() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [
    { name: 'Root', parent: null, position: CROWN.clone() },
    { name: 'Mantle', parent: 'Root', position: NECK.clone() },
  ];

  // --- Head and mantle: one soft loft from under the crown, up through the head, back over the neck into the sac ---
  const spine = path([[0, .016, .05], [0, .056, .052], [0, .088, .02], [0, .112, -.045], [0, .132, -.13], [0, .146, -.21], [0, .152, -.265]]);
  const radius = (u: number) => {
    // Head (widest where the eyes sit), a pinched neck, then the swelling mantle sac closing to its rounded tip.
    const points: [number, number][] = [[0, .046], [.12, .061], [.24, .066], [.36, .05], [.48, .068], [.66, .084], [.82, .072], [.93, .045], [1, .006]];
    let i = 0;
    while (i < points.length - 2 && u > points[i + 1][0]) i++;
    const [u0, r0] = points[i], [u1, r1] = points[i + 1], t = smoothstep(u0, u1, u);
    return r0 + (r1 - r0) * t;
  };
  const bodySkin = (u: number): Skin => blendSkins({ Root: 1 }, { Mantle: 1 }, smoothstep(.34, .46, u));
  const us = Array.from({ length: 19 }, (_, i) => (i / 18) ** .95);
  const sides = 14;
  mesh.begin();
  const rings = us.map((u) => {
    const center = spine(u), ahead = spine(Math.min(1, u + .01)).sub(spine(Math.max(0, u - .01))).normalize();
    const lateral = new Vector3(1, 0, 0), normal = new Vector3().crossVectors(ahead, lateral).normalize();
    if (normal.y < 0) normal.negate();
    return Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides, r = radius(u);
      // Slightly irregular skin, so the low-poly surface reads as soft, faceted flesh.
      const bump = 1 + .07 * noise(u * 23 + k * 1.7, 4);
      const p = center.clone().addScaledVector(lateral, Math.sin(a) * r * bump).addScaledVector(normal, Math.cos(a) * r * .9 * bump);
      const under = smoothstep(.1, -.6, Math.cos(a));
      return mesh.vertex(p, mix(skinColor(p, 3), BELOW, under * (u < .4 ? .85 : .55)), bodySkin(u));
    });
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < sides; k++) mesh.quad(rings[j][k], rings[j][(k + 1) % sides], rings[j + 1][(k + 1) % sides], rings[j + 1][k]);
  }
  const bottom = mesh.vertex(spine(0).add(new Vector3(0, -.03, 0)), BELOW, { Root: 1 });
  const tip = mesh.vertex(spine(1), skinColor(spine(1), 3), { Mantle: 1 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(bottom, rings[0][(k + 1) % sides], rings[0][k]);
    mesh.tri(tip, rings[rings.length - 1][k], rings[rings.length - 1][(k + 1) % sides]);
  }
  mesh.end();

  // --- Eyes: raised pale domes high on the head, each with a dark horizontal slit pupil ---
  for (const side of [1, -1]) {
    const center = new Vector3(side * .052, .102, .032), out = new Vector3(side * .75, .65, .15).normalize();
    const t1 = new Vector3(0, 1, 0).cross(out).normalize(), t2 = out.clone().cross(t1);
    const r = .026;
    mesh.begin();
    const top = mesh.vertex(center.clone().addScaledVector(out, r * .75), PUPIL, { Root: 1 });
    const rows: number[][] = [];
    for (let ring = 1; ring <= 3; ring++) {
      const phi = Math.PI * ring / 7;
      rows.push(Array.from({ length: 10 }, (_, s) => {
        const a = TAU * s / 10;
        const p = center.clone().addScaledVector(out, Math.cos(phi) * r * .75)
          .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * r).addScaledVector(t2, Math.sin(phi) * Math.sin(a) * r);
        // The pupil: a dark bar across the middle of the eye, along the head.
        const slit = ring <= 2 && Math.abs(Math.sin(a)) < .45;
        return mesh.vertex(p, slit ? PUPIL : ring === 3 ? mix(EYE, BASE, .5) : EYE, { Root: 1 });
      }));
    }
    const base = mesh.vertex(center.clone().addScaledVector(out, -r * .4), BASE, { Root: 1 });
    for (let s = 0; s < 10; s++) {
      const s1 = (s + 1) % 10;
      mesh.tri(top, rows[0][s], rows[0][s1]);
      for (let ring = 0; ring < 2; ring++) mesh.quad(rows[ring][s], rows[ring + 1][s], rows[ring + 1][s1], rows[ring][s1]);
      mesh.tri(base, rows[2][s1], rows[2][s]);
    }
    mesh.end();
  }

  // --- Arms: tapering, slightly flattened tubes running out over the floor ---
  const armAt = (angle: number, r: number) => {
    const y = r < .16 ? .02 - .026 * smoothstep(ARM_BASE, .16, r) : -.006;
    return new Vector3(Math.sin(angle) * r, y, CROWN.z * (1 - smoothstep(ARM_BASE, .2, r)) + Math.cos(angle) * r);
  };
  const armRadius = (r: number) => .031 * (1 - .88 * clamp((r - ARM_BASE) / (ARM_TIP - ARM_BASE)) ** 1.05);
  for (const { name, angle } of OCTOPUS_ARMS) {
    const names = Array.from({ length: OCTOPUS_SEGMENTS }, (_, s) => octopusArmBone(name, s + 1));
    names.forEach((bone, s) => bones.push({ name: bone, parent: s ? names[s - 1] : 'Root', position: armAt(angle, JOINTS[s]) }));
    const seed = angle * 7.3;
    const rs = Array.from({ length: 12 }, (_, i) => ARM_BASE + (ARM_TIP - .012 - ARM_BASE) * (i / 11) ** .9);
    const armSides = 6;
    const skin = (r: number): Skin => blendSkins({ Root: 1 }, chainSkin(r, JOINTS, names, ARM_TIP), smoothstep(ARM_BASE, .075, r));
    mesh.begin();
    const armRings = rs.map((r, i) => {
      const center = armAt(angle, r), out = new Vector3(Math.sin(angle), 0, Math.cos(angle)), across = new Vector3(Math.cos(angle), 0, -Math.sin(angle));
      const ra = armRadius(r);
      return Array.from({ length: armSides }, (_, k) => {
        const a = TAU * k / armSides;
        const p = center.clone().addScaledVector(across, Math.sin(a) * ra).addScaledVector(new Vector3(0, 1, 0), Math.cos(a) * ra * .72);
        // Beneath: lighter, with pale dots for the suckers along the underside's edges.
        const under = Math.cos(a) < -.2;
        const sucker = under && Math.abs(Math.sin(a)) > .3 && (i % 2 === 0);
        const color = under ? (sucker ? SUCKER : BELOW) : skinColor(p.clone().add(out.clone().multiplyScalar(seed * .01)), 7 + Math.round(seed));
        return mesh.vertex(p, color, skin(r));
      });
    });
    for (let j = 0; j < armRings.length - 1; j++) {
      for (let k = 0; k < armSides; k++) mesh.quad(armRings[j][k], armRings[j][(k + 1) % armSides], armRings[j + 1][(k + 1) % armSides], armRings[j + 1][k]);
    }
    const end = mesh.vertex(armAt(angle, ARM_TIP), BELOW, skin(ARM_TIP));
    const start = mesh.vertex(armAt(angle, ARM_BASE * .5), BASE, { Root: 1 });
    for (let k = 0; k < armSides; k++) {
      mesh.tri(end, armRings[armRings.length - 1][k], armRings[armRings.length - 1][(k + 1) % armSides]);
      mesh.tri(start, armRings[0][(k + 1) % armSides], armRings[0][k]);
    }
    mesh.end();
  }

  // --- Web: the membrane between neighboring arms' bases, its edge dipping between them ---
  mesh.begin();
  const order = [...OCTOPUS_ARMS].sort((a, b) => a.angle - b.angle);
  for (let i = 0; i < order.length; i++) {
    const a = order[i], b = order[(i + 1) % order.length];
    const span = ((b.angle - a.angle) % TAU + TAU) % TAU;
    const mid = a.angle + span / 2, reach = .125 - .03 * clamp((span - .6) / .9);
    const ia = octopusArmBone(a.name, 1), ib = octopusArmBone(b.name, 1);
    const pa = armAt(a.angle, .15).add(new Vector3(0, .006, 0)), pb = armAt(b.angle, .15).add(new Vector3(0, .006, 0));
    const pm = new Vector3(Math.sin(mid) * reach, .008, CROWN.z * .4 + Math.cos(mid) * reach);
    const c = CROWN.clone().add(new Vector3(0, -.006, 0));
    const va = mesh.vertex(pa, WEB, blendSkins({ Root: .3 }, { [ia]: 1 }, .7));
    const vb = mesh.vertex(pb, WEB, blendSkins({ Root: .3 }, { [ib]: 1 }, .7));
    const vm = mesh.vertex(pm, mix(WEB, BLOTCH, .3), blendSkins({ [ia]: .5 }, { [ib]: .5 }, .5));
    const vc = mesh.vertex(c, WEB, { Root: 1 });
    mesh.tri(vc, va, vm);
    mesh.tri(vc, vm, vb);
  }
  mesh.end({ closed: false, outward: () => new Vector3(0, 1, 0) });

  return { mesh, bones };
}
