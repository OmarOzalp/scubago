/**
 * Ocean sunfish (Mola mola): a tall, laterally compressed disc that ends abruptly
 * in the scalloped clavus, with a tall dorsal fin above and a matching anal fin
 * below set far back, tiny rounded pectoral fins, a small beaked mouth and
 * mottled blue-gray skin. The body is one stiff piece; the dorsal and anal fins
 * and the clavus carry the rig's bones.
 *
 * Model space: snout at z = +0.5, clavus edge at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, curve, eye, fin, hex, MeshBuilder, mix, noise, smoothstep, TAU, type RGB } from './kit';
import type { BoneSpec } from './export';

const BACK = hex('#707e87'), FLANK = hex('#98a5ac'), BELLY = hex('#cdd5d6'), MOTTLE = hex('#c7d0d2');
const FIN = hex('#5d6a72'), FIN_EDGE = hex('#85929a'), CLAVUS_EDGE = hex('#a3aeb2'), PECTORAL = hex('#7e8b92');
const MOUTH = hex('#3a4449'), EYE = hex('#0c1113'), EYE_RING = hex('#c9d1d2'), GILL = hex('#3f4a50');

/** Body loft: s runs from the snout (0) to the rear edge where the clavus attaches (1). */
const NOSE = .5, BODY_END = -.355;
const z = (s: number) => NOSE + (BODY_END - NOSE) * s;
const top = curve([[0, .045], [.05, .125], [.12, .205], [.25, .29], [.4, .335], [.55, .345], [.7, .325], [.85, .285], [1, .235]]);
const bottom = curve([[0, .055], [.05, .135], [.12, .22], [.25, .3], [.4, .345], [.55, .355], [.7, .335], [.85, .295], [1, .245]]);
const center = curve([[0, -.03], [.15, -.01], [.4, 0], [1, 0]]);
const width = curve([[0, .036], [.05, .058], [.12, .078], [.25, .088], [.4, .086], [.55, .078], [.7, .066], [.85, .05], [1, .03]]);

/** Flat flanks with rounded top and bottom edges: a superellipse section. */
function surface(s: number, theta: number) {
  const e = 2 / 2.5;
  const sinT = Math.sin(theta), cosT = Math.cos(theta);
  const h = cosT >= 0 ? top(s) : bottom(s);
  return new Vector3(width(s) * Math.sign(sinT) * Math.abs(sinT) ** e, center(s) + h * Math.sign(cosT) * Math.abs(cosT) ** e, z(s));
}

function skinColor(p: Vector3): RGB {
  // Darker back, paler belly, and soft pale blotches over the flanks.
  const height = p.y / .35;
  let color = mix(BELLY, FLANK, smoothstep(-.75, -.15, height));
  color = mix(color, BACK, smoothstep(.2, .85, height));
  // Rotated coordinates keep the blotches irregular instead of lining up in stripes.
  const blotch = noise(p.z * 6.5 + p.y * 3.1 + 3, 1) * noise(p.y * 5.5 - p.z * 4.2 - 2, 4);
  color = mix(color, MOTTLE, clamp(blotch * 2.6) * .8 * (1 - smoothstep(.65, .98, Math.abs(height))));
  // Pale ring around the eye, and the small dark gill opening in front of each pectoral fin.
  const eyeDistance = Math.hypot(p.z - .355, p.y - .085);
  color = mix(color, EYE_RING, (1 - smoothstep(.03, .05, eyeDistance)) * .85);
  const gill = Math.hypot((p.z - .21) / .012, (p.y + .005) / .026);
  return mix(color, GILL, 1 - smoothstep(.7, 1.1, gill));
}

export function buildMolaMola() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];

  // --- Body: one stiff closed loft ---
  mesh.begin();
  const rings = 24, columns = 20;
  const ss = Array.from({ length: rings }, (_, j) => {
    const t = j / (rings - 1);
    // Denser rings at the blunt face and toward the rear edge.
    return .6 * t + .4 * (1 - Math.cos(Math.PI * t)) / 2;
  });
  ss[0] = .004;
  const thetas = Array.from({ length: columns }, (_, k) => TAU * k / columns);
  const rows = ss.map((s) => thetas.map((theta) => {
    const p = surface(s, theta);
    return mesh.vertex(p, skinColor(p), { Root: 1 });
  }));
  for (let j = 0; j < rings - 1; j++) {
    for (let k = 0; k < columns; k++) mesh.quad(rows[j][k], rows[j][(k + 1) % columns], rows[j + 1][(k + 1) % columns], rows[j + 1][k]);
  }
  // Blunt face and the flat rear edge (hidden behind the clavus) close with fans.
  const face = mesh.vertex(new Vector3(0, center(0), NOSE + .004), skinColor(new Vector3(0, center(0), NOSE)), { Root: 1 });
  const rear = mesh.vertex(new Vector3(0, 0, BODY_END - .004), FIN, { Root: 1 });
  for (let k = 0; k < columns; k++) {
    mesh.tri(face, rows[0][(k + 1) % columns], rows[0][k]);
    mesh.tri(rear, rows[rings - 1][k], rows[rings - 1][(k + 1) % columns]);
  }
  mesh.end();

  // --- Small beaked mouth: a short dark tube at the front, just below center ---
  mesh.begin();
  const lip = [0, .022].map((dz, i) => Array.from({ length: 8 }, (_, k) => {
    const a = TAU * k / 8, r = i === 0 ? .03 : .024;
    return mesh.vertex(new Vector3(Math.cos(a) * r * .75, -.032 + Math.sin(a) * r, NOSE - .006 + dz), MOUTH, { Root: 1 });
  }));
  const gape = mesh.vertex(new Vector3(0, -.032, NOSE + .012), hex('#1c2225'), { Root: 1 });
  for (let k = 0; k < 8; k++) {
    mesh.quad(lip[0][k], lip[0][(k + 1) % 8], lip[1][(k + 1) % 8], lip[1][k]);
    mesh.tri(gape, lip[1][k], lip[1][(k + 1) % 8]);
  }
  mesh.end();

  // --- Eyes, set into the flanks above the mouth ---
  for (const side of [1, -1]) {
    const s = (NOSE - .355) / (NOSE - BODY_END);
    const at = new Vector3(side * width(s) * .92, .085, .355);
    eye(mesh, at, new Vector3(side, .1, .15), .025, EYE, { Root: 1 }, .6);
  }

  // --- Dorsal fin (up) and anal fin (down): tall, far back, swept slightly rearward ---
  const tallFin = (sign: 1 | -1) => {
    const [first, second] = sign > 0 ? ['Dorsal1', 'Dorsal2'] : ['Anal1', 'Anal2'];
    const edge = (s: number) => (sign > 0 ? top(s) + center(s) : -bottom(s) + center(s)) - sign * .02;
    const baseFront = new Vector3(0, edge(.56), z(.56)), baseBack = new Vector3(0, edge(.8), z(.8));
    const tip = new Vector3(0, sign * .72, -.255);
    fin(mesh, {
      stations: 7,
      // A gently convex leading edge and a concave trailing edge give the sickle outline.
      le: (v) => baseFront.clone().lerp(tip, v).add(new Vector3(0, 0, .045 * Math.sin(Math.PI * v))),
      te: (v) => baseBack.clone().lerp(tip, v).add(new Vector3(0, -sign * .03 * Math.sin(Math.PI * v), .02 * Math.sin(Math.PI * v))),
      thickness: (v) => .034 * (1 - .75 * v),
      side: new Vector3(1, 0, 0),
      color: (_p, v, u) => mix(FIN, FIN_EDGE, smoothstep(.75, 1, u) * .8 + smoothstep(.85, 1, v) * .3),
      skin: (_p, v) => {
        const bend = chainSkin(v, [0, .45], [first, second], 1);
        return blendSkins({ Root: 1 }, bend, smoothstep(.02, .14, v));
      },
      chordPoints: 6,
    });
    bones.push(
      { name: first, parent: 'Root', position: new Vector3(0, edge(.68), z(.68)) },
      { name: second, parent: first, position: new Vector3(0, sign * .52, -.2) },
    );
  };
  tallFin(1);
  tallFin(-1);

  // --- Clavus: the scalloped rudder that replaces a tail, wrapped along the rear edge ---
  const rearEdge = (v: number) => {
    // v runs from just behind the dorsal fin (0) down to just behind the anal fin (1).
    const y = .24 - .49 * v;
    return new Vector3(0, y, BODY_END - .008 + .03 * (1 - (2 * v - 1) ** 2));
  };
  fin(mesh, {
    stations: 15,
    rootPoint: true,
    le: (v) => rearEdge(v),
    te: (v) => rearEdge(v).add(new Vector3(0, 0, -(.105 + .028 * Math.cos(v * TAU * 3.5)) * Math.sin(Math.PI * clamp(v * 1.02)) ** .35)),
    thickness: () => .02,
    side: new Vector3(1, 0, 0),
    color: (_p, _v, u) => mix(FIN, CLAVUS_EDGE, smoothstep(.55, 1, u)),
    skin: (_p, v, u) => blendSkins({ Root: 1 }, chainSkin(v, [0, .33, .66], ['Clavus1', 'Clavus2', 'Clavus3'], 1), smoothstep(0, .35, u)),
    chordPoints: 5,
  });
  bones.push(
    { name: 'Clavus1', parent: 'Root', position: rearEdge(.18) },
    { name: 'Clavus2', parent: 'Root', position: rearEdge(.5) },
    { name: 'Clavus3', parent: 'Root', position: rearEdge(.82) },
  );

  // --- Tiny rounded pectoral fins behind the gill openings ---
  for (const side of [1, -1] as const) {
    const s = (NOSE - .18) / (NOSE - BODY_END);
    const root = new Vector3(side * width(s) * .85, .02, .18);
    const name = side > 0 ? 'PectoralL' : 'PectoralR';
    // A small rounded paddle angled up and back.
    fin(mesh, {
      stations: 5,
      le: (v) => root.clone().add(new Vector3(side * .028 * v, .024 * (1 - v) + .045 * v - .02 * v * v, -.075 * v)),
      te: (v) => root.clone().add(new Vector3(side * .02 * v, -.024 * (1 - v) + .03 * v, -.03 - .05 * v)),
      thickness: (v) => .012 * (1 - .5 * v),
      side: new Vector3(side, 0, 0),
      color: (_p, v) => mix(PECTORAL, FIN_EDGE, smoothstep(.5, 1, v)),
      skin: (_p, v) => blendSkins({ Root: 1 }, { [name]: 1 }, smoothstep(.05, .3, v)),
    });
    bones.push({ name, parent: 'Root', position: root.clone() });
  }

  bones.push({ name: 'Root', parent: null, position: new Vector3(0, 0, 0) });
  return { mesh, bones };
}
