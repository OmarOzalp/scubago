/**
 * Golden jellyfish (Mastigias papua, as in Palau's Jellyfish Lake): a deep, rounded, translucent
 * bell glowing golden amber (richest over the top, where the algae it farms gather, paler toward the
 * scalloped margin), and under it a stout column dividing into eight thick, frilly oral arms, each
 * ending in a short pale club. No long stinging tentacles.
 *
 * Model space: the bell's axis is +Y, its margin at y = 0 and one bell diameter across. The bell is
 * one closed shell (the inner surface first, then the margin, then the outer surface, so that drawn
 * in index order through the translucent bell the arms show, then its inside, then its outside).
 */
import { Vector3 } from 'three';
import { JELLY_ARMS, jellyArmAngle } from '../../../src/lib/marine-rigs';
import { blendSkins, chainSkin, hex, mix, MeshBuilder, smoothstep, TAU, type RGB, type RGBA, type Skin } from './kit';
import type { BoneSpec } from './export';

const CROWN = hex('#d97a12'), GOLD = hex('#f2a52a'), PALE = hex('#f9cf6a'), INNER = hex('#f7c45a'), CLOVER = hex('#b8621a');
const ARM = hex('#efb232'), FRILL = hex('#f7dca4'), CLUB = hex('#f6ead0'), COLUMN = hex('#cf9450');

const R = .5, H = .42;
const AROUND = 36;
/** Scalloped lappets around the margin: 0 at a notch, 1 at a lappet's middle. */
const lappet = (phi: number) => Math.abs(Math.sin(phi * 9));
const rgba = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], a];

/** A point on the bell. `t` runs from the apex (0) to the margin (1); `inner` is the subumbrella, under the thick jelly of the top. */
function bell(t: number, phi: number, inner: boolean) {
  const a = t * Math.PI / 2;
  const top = inner ? .14 - .125 * t ** .8 : 0, side = inner ? .055 - .045 * t : 0;
  const r = (R - side) * Math.sin(a) ** .82;
  const y = (H - top) * Math.cos(a) ** 1.12;
  // Lappets flare a little at the margin.
  const flare = smoothstep(.82, 1, t) * (.012 * lappet(phi) - .004);
  return new Vector3(Math.sin(phi) * (r + flare), y - .012 * smoothstep(.85, 1, t) * lappet(phi), Math.cos(phi) * (r + flare));
}
const bellSkin = (t: number): Skin => blendSkins({ Bell: 1 }, { Rim: 1 }, smoothstep(.35, .95, t));

function outerColor(t: number, phi: number): RGBA {
  // Golden amber, richest over the crown; a darker four-leaf clover (the stomach seen through the
  // jelly) under the top; eight faint radial bands; paler and clearer toward the margin.
  const base = mix(mix(CROWN, GOLD, smoothstep(.05, .55, t)), PALE, smoothstep(.55, .98, t));
  const clover = (1 - smoothstep(.12, .3, t * (1 - .35 * Math.abs(Math.cos(2 * phi))))) * .45;
  const band = .06 * Math.cos(8 * phi + .4) * smoothstep(.3, .7, t);
  const c = mix(base, CLOVER, clover);
  return rgba([c[0] * (1 + band), c[1] * (1 + band), c[2] * (1 + band)], .7 - .3 * smoothstep(.25, 1, t) - .08 * (1 - lappet(phi)) * smoothstep(.85, 1, t));
}
// Faint: through the bell from above the inside is seen from behind, in shadow.
const innerColor = (t: number): RGBA => rgba(mix(INNER, PALE, smoothstep(.4, 1, t)), .16 + .1 * smoothstep(.6, 1, t));

export function buildGoldenJellyfish() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];

  // The arms first (see the header). The central column hangs from the bell's underside.
  mesh.begin();
  const column = [[.2, .07], [.12, .085], [.06, .08], [.02, .065]] as const;
  const columnRows = column.map(([y, r]) => Array.from({ length: 12 }, (_, k) => {
    const phi = TAU * k / 12;
    return mesh.vertex(new Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r), rgba(COLUMN, .92), { Root: 1 });
  }));
  for (let i = 0; i < columnRows.length - 1; i++) {
    for (let k = 0; k < 12; k++) mesh.quad(columnRows[i][k], columnRows[i][(k + 1) % 12], columnRows[i + 1][(k + 1) % 12], columnRows[i + 1][k]);
  }
  const capTop = mesh.vertex(new Vector3(0, .21, 0), rgba(COLUMN, .92), { Root: 1 });
  const capBottom = mesh.vertex(new Vector3(0, .01, 0), rgba(COLUMN, .92), { Root: 1 });
  for (let k = 0; k < 12; k++) {
    mesh.tri(capTop, columnRows[0][(k + 1) % 12], columnRows[0][k]);
    mesh.tri(capBottom, columnRows[columnRows.length - 1][k], columnRows[columnRows.length - 1][(k + 1) % 12]);
  }
  mesh.end();

  // Eight thick, frilly oral arms: a three-winged section, its wings crinkled along the arm, angling
  // out and down from the column; then a short pale club.
  const armPath = (t: number) => ({ r: .045 + .17 * Math.sin(t * Math.PI / 2) ** .9, y: .05 - .5 * t });
  const armJoints = [0, .12, .5];
  const armBones: { a: Vector3; b: Vector3 }[] = [];
  for (let i = 0; i < JELLY_ARMS; i++) {
    const phi = jellyArmAngle(i);
    const dir = new Vector3(Math.sin(phi), 0, Math.cos(phi)), across = new Vector3(Math.cos(phi), 0, -Math.sin(phi));
    const at = (t: number) => { const { r, y } = armPath(t); return dir.clone().multiplyScalar(r).setY(y); };
    const skin = (t: number) => chainSkin(t, armJoints, ['Root', `Arm${i + 1}A`, `Arm${i + 1}B`], 1);
    mesh.begin();
    const steps = 7, points = 6;
    const rows: number[][] = [];
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const c = at(t);
      const tangent = at(Math.min(1, t + .02)).sub(at(Math.max(0, t - .02))).normalize();
      const side = across.clone(), normal = tangent.clone().cross(side).normalize();
      const thick = .032 + .046 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** .6;
      rows.push(Array.from({ length: points }, (_, k) => {
        const a = TAU * k / points + .25 * t + i;
        // Three wings (every other point reaches out), each crinkled along the arm.
        const wing = k % 2 === 0;
        const crinkle = 1 + .3 * Math.sin(13 * t + 2.1 * k + i);
        const radius = (wing ? thick * crinkle : thick * .42) * (t > .97 ? .3 : 1);
        const p = c.clone().addScaledVector(side, Math.cos(a) * radius).addScaledVector(normal, Math.sin(a) * radius);
        const frill = wing ? .55 + .45 * Math.sin(13 * t + 2.1 * k + i) : 0;
        return mesh.vertex(p, rgba(mix(ARM, FRILL, .1 + .5 * frill), .92), skin(t));
      }));
    }
    for (let j = 0; j < steps; j++) for (let k = 0; k < points; k++) mesh.quad(rows[j][k], rows[j][(k + 1) % points], rows[j + 1][(k + 1) % points], rows[j + 1][k]);
    const startCap = mesh.vertex(at(0), rgba(ARM, .9), skin(0));
    for (let k = 0; k < points; k++) mesh.tri(startCap, rows[0][(k + 1) % points], rows[0][k]);
    // The club: a slender spindle continuing from the arm's tip, swelling a little before its end.
    const tip = at(1), down = at(1).sub(at(.94)).normalize();
    const clubRows: number[][] = [rows[steps]];
    for (let j = 1; j <= 4; j++) {
      const t = j / 4;
      const c = tip.clone().addScaledVector(down, .08 * t);
      const radius = .006 + .011 * Math.sin(Math.PI * Math.min(1, t * .9)) ** 1.5 * (1 - .4 * t);
      clubRows.push(Array.from({ length: points }, (_, k) => {
        const a = TAU * k / points;
        const p = c.clone().addScaledVector(across, Math.cos(a) * radius).addScaledVector(dir, Math.sin(a) * radius);
        return mesh.vertex(p, rgba(mix(FRILL, CLUB, smoothstep(0, .5, t)), .75), skin(1));
      }));
    }
    for (let j = 0; j < clubRows.length - 1; j++) for (let k = 0; k < points; k++) mesh.quad(clubRows[j][k], clubRows[j][(k + 1) % points], clubRows[j + 1][(k + 1) % points], clubRows[j + 1][k]);
    const clubEnd = mesh.vertex(tip.clone().addScaledVector(down, .088), rgba(CLUB, .75), skin(1));
    for (let k = 0; k < points; k++) mesh.tri(clubEnd, clubRows[clubRows.length - 1][k], clubRows[clubRows.length - 1][(k + 1) % points]);
    mesh.end();
    armBones.push({ a: at(armJoints[1]), b: at(armJoints[2]) });
  }

  // The bell: inner apex, the inner surface down to the margin, round the margin's edge, then the
  // outer surface back up to the crown.
  mesh.begin();
  const innerTs = [.15, .4, .65, .85, .96];
  const outerTs = [1, .95, .87, .76, .63, .5, .37, .25, .14, .06];
  const ring = (f: (phi: number) => { p: Vector3; color: RGBA; skin: Skin }) =>
    Array.from({ length: AROUND }, (_, k) => {
      const phi = TAU * k / AROUND;
      const { p, color, skin } = f(phi);
      return mesh.vertex(p, color, skin);
    });
  const rows = [
    ...innerTs.map((t) => ring((phi) => ({ p: bell(t, phi, true), color: innerColor(t), skin: bellSkin(t) }))),
    // The margin's rounded edge, between the inner and outer surfaces.
    ring((phi) => ({ p: bell(1, phi, false).lerp(bell(1, phi, true), .5).setY(bell(1, phi, false).y - .008), color: outerColor(1, phi), skin: bellSkin(1) })),
    ...outerTs.map((t) => ring((phi) => ({ p: bell(t, phi, false), color: outerColor(t, phi), skin: bellSkin(t) }))),
  ];
  for (let j = 0; j < rows.length - 1; j++) {
    for (let k = 0; k < AROUND; k++) mesh.quad(rows[j][k], rows[j][(k + 1) % AROUND], rows[j + 1][(k + 1) % AROUND], rows[j + 1][k]);
  }
  const innerApex = mesh.vertex(new Vector3(0, H - .14, 0), innerColor(0), bellSkin(0));
  const crown = mesh.vertex(new Vector3(0, H, 0), outerColor(0, 0), bellSkin(0));
  for (let k = 0; k < AROUND; k++) {
    mesh.tri(innerApex, rows[0][(k + 1) % AROUND], rows[0][k]);
    mesh.tri(crown, rows[rows.length - 1][k], rows[rows.length - 1][(k + 1) % AROUND]);
  }
  mesh.end();

  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, 0) },
    { name: 'Bell', parent: 'Root', position: new Vector3(0, 0, 0) },
    { name: 'Rim', parent: 'Root', position: new Vector3(0, 0, 0) },
    ...armBones.flatMap(({ a, b }, i) => [
      { name: `Arm${i + 1}A`, parent: 'Root', position: a },
      { name: `Arm${i + 1}B`, parent: `Arm${i + 1}A`, position: b },
    ]),
  );
  return { mesh, bones };
}
