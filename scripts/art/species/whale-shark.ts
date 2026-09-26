/**
 * Whale shark (Rhincodon typus): a huge, flattened, truncated head with a wide
 * terminal mouth and small eyes; a thick body with longitudinal ridges that
 * tapers slowly to a keeled tail stock; a large rearward first dorsal and a big
 * semi-lunate tail. Dark blue-gray with pale spots between pale vertical and
 * horizontal lines, and a white belly.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, MeshBuilder, mix, noise, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#3b5360'), FLANK = hex('#4c6570'), BELLY = hex('#eef0ea');
const SPOT = hex('#e4ebe6'), LINE = hex('#c9d6d2'), GILL = hex('#2b3e47'), EYE = hex('#0b1215'), MOUTH = hex('#1d2a30');

const rig = SWIM_RIGS['whale-shark'] as SharkRig;
const BOUNDARY = 1.8;
const RIDGES = [.52, 1.0, 1.42];

export const WHALE_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8, frontDome: .007,
  width: [[0, .074], [.02, .083], [.06, .089], [.12, .092], [.2, .094], [.3, .093], [.4, .087], [.5, .075], [.6, .059], [.68, .043], [.74, .03], [.78, .02], [.8, .013]],
  top: [[0, .019], [.02, .03], [.06, .042], [.12, .056], [.2, .071], [.3, .083], [.4, .085], [.5, .077], [.6, .061], [.68, .044], [.74, .029], [.78, .021], [.8, .018]],
  bottom: [[0, .021], [.02, .029], [.06, .037], [.12, .048], [.2, .06], [.3, .069], [.4, .068], [.5, .059], [.6, .046], [.68, .033], [.74, .023], [.78, .017], [.8, .015]],
  center: [[0, -.008], [.08, -.005], [.2, -.001], [.4, 0], [.6, .003], [.8, .006]],
  squareTop: [[0, 2.9], [.1, 2.6], [.3, 2.3], [.6, 2.2], [.8, 2]],
  squareBottom: [[0, 3.4], [.1, 3], [.3, 2.5], [.6, 2.3], [.8, 2]],
  keel: [[.62, 0], [.7, .006], [.755, .01], [.785, .005], [.8, 0]],
  ridges: RIDGES.map((angle, i) => ({ angle, height: [[.16, 0], [.24, .0035 - i * .0005], [.6, .003 - i * .0005], [.72, 0]] as [number, number][] })),
  rings: 36, columnsAbove: 6, columnsBelow: 5,
  boundary: () => BOUNDARY, boundaryGap: .05,
  paint: (s, theta, p) => {
    const flank = mix(TOP, FLANK, smoothstep(.5, 1.7, theta) * .6);
    return mix(flank, BELLY, smoothstep(BOUNDARY - .02, BOUNDARY + .02, theta + .02 * noise(p.z * 30, 4)) * smoothstep(-.01, .03, s));
  },
};

/** A tiny four-point spot; at gameplay scale these read as dots and keep the asset light. */
function dot(ctx: ReturnType<typeof sharkContext>, s: number, theta: number, r: number, color: RGB) {
  const mesh = ctx.mesh;
  mesh.begin();
  const gs = ctx.raw(s + .002, theta).sub(ctx.raw(s - .002, theta)).length() / .004;
  const gt = ctx.raw(s, theta + .01).sub(ctx.raw(s, theta - .01)).length() / .02;
  const ids = [0, 1, 2, 3].map((i) => {
    const a = TAU * i / 4;
    const ps = s + Math.cos(a) * r / gs, pt = theta + Math.sin(a) * r / gt;
    return mesh.vertex(ctx.surface(ps, pt, .001), color, ctx.skin(ps), ctx.normal(ps, pt));
  });
  mesh.quad(ids[0], ids[1], ids[2], ids[3]);
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}

/** The wide terminal mouth: a dark lens across the lower front face. */
function mouth(ctx: ReturnType<typeof sharkContext>, mesh: MeshBuilder) {
  const w = ctx.width(0), h = ctx.bottom(0), c = ctx.center(0), top = ctx.top(0);
  const bulge = WHALE_SHARK.frontDome!;
  const onFace = (x: number, y: number) => {
    const q = Math.min(1, Math.hypot(x / w, (y - c) / (y < c ? h : top)));
    return new Vector3(x, y, ctx.z(0) + bulge * (1 - q * q) + .0012);
  };
  mesh.begin();
  const n = 9, rows: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = (t * 2 - 1) * w * .9;
    const open = .3 * h * (1 - (x / (w * .92)) ** 2) ** .7;
    const y = c - .42 * h + .12 * h * (x / w) ** 2;
    rows.push([y + open * .45, y - open * .55].map((yy) => mesh.vertex(onFace(x, yy), MOUTH, { Head: 1 }, new Vector3(0, 0, 1))));
  }
  for (let i = 0; i < n; i++) mesh.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
  mesh.end({ closed: false, normals: false, outward: () => new Vector3(0, 0, 1) });
}

export function buildWhaleShark() {
  const ctx = sharkContext(WHALE_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (p: Vector3, v: number, u: number) => mix(TOP, FLANK, .2 * u + .15 * v);
  const dorsal = ctx.midlineFin({
    le: [[-.012, .435], [0, .44], [.03, .458], [.065, .486], [.09, .508], [.102, .522]],
    te: [[-.012, .552], [0, .557], [.008, .562], [.022, .546], [.05, .532], [.08, .525], [.102, .522]],
    height: .102, thickness: .022, bone: 'Dorsal', color: finColor,
  });
  ctx.midlineFin({
    le: [[-.01, .676], [0, .68], [.02, .694], [.032, .706]],
    te: [[-.01, .718], [0, .722], [.006, .726], [.02, .712], [.032, .706]],
    height: .032, thickness: .01, stations: 5, color: finColor,
  });
  ctx.midlineFin({
    le: [[-.01, .7], [0, .703], [.016, .716], [.026, .726]],
    te: [[-.01, .738], [0, .741], [.006, .744], [.016, .731], [.026, .726]],
    height: .026, thickness: .009, stations: 5, ventral: true,
    color: (_p, v) => mix(FLANK, BELLY, .45 - .2 * v),
  });
  const pectorals = ctx.pairedFin({
    rootS: .205, theta: 2.02, span: .18, droop: .36, sweep: .28, thickness: .022,
    le: [[-.015, 0], [0, 0], [.04, .014], [.09, .042], [.13, .075], [.162, .108], [.18, .13]],
    te: [[-.015, .09], [0, .092], [.035, .094], [.08, .1], [.12, .108], [.158, .118], [.18, .13]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u) => mix(TOP, FLANK, .15 + .1 * u + .1 * v),
  });
  ctx.pairedFin({
    rootS: .525, theta: 2.42, span: .06, droop: .9, sweep: .15, thickness: .012, stations: 5,
    le: [[-.01, 0], [0, 0], [.03, .018], [.06, .044]],
    te: [[-.01, .055], [0, .056], [.03, .053], [.05, .049], [.06, .044]],
    color: (_p, v) => mix(FLANK, BELLY, .4 - .2 * v),
  });
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .112, high: axis + .168,
    le: [[axis - .112, .93], [axis - .08, .878], [axis - .045, .822], [axis - .016, .78], [axis + .004, .765], [axis + .02, .772], [axis + .05, .81], [axis + .09, .87], [axis + .13, .93], [axis + .155, .972], [axis + .168, 1]],
    te: [[axis - .112, .93], [axis - .08, .922], [axis - .045, .9], [axis - .015, .872], [axis + .004, .862], [axis + .03, .886], [axis + .075, .93], [axis + .12, .968], [axis + .15, .99], [axis + .168, 1]],
    thickness: (y) => .004 + .022 * Math.max(0, 1 - Math.abs(y - axis) / .13) ** 1.3,
    upperPivot: .06, lowerPivot: .04, stations: 18,
    color: (p, _v, u) => mix(TOP, FLANK, .12 + .12 * u + (p.y < axis ? .2 : 0)),
  });
  ctx.eyes({ s: .046, theta: 1.46, radius: .0052, color: EYE, sink: .3 });
  ctx.gills({ from: .152, to: .225, count: 5, top: 1.12, bottom: 1.92, halfWidth: .0022, slant: .012, color: GILL });
  mouth(ctx, mesh);

  // Pale ridge lines and the vertical bars that complete the checkerboard.
  for (const side of [1, -1]) {
    for (const [i, angle] of RIDGES.entries()) {
      const from = .2 + .02 * i, to = .7 - .03 * i;
      ctx.ribbon(Array.from({ length: 9 }, (_, j) => [from + (to - from) * j / 8, side * (angle + .004)] as const), (t) => .0022 * Math.sin(Math.PI * (.05 + .9 * t)) ** .4, LINE);
    }
    for (let j = 0; j < 11; j++) {
      const s = .245 + j * .043;
      const bottom = BOUNDARY - .08 - .25 * smoothstep(.45, .7, s);
      ctx.ribbon(Array.from({ length: 4 }, (_, k) => [s + .004 * k / 3, side * (.62 + (bottom - .62) * k / 3)] as const), (t) => .0019 * Math.sin(Math.PI * (.1 + .8 * t)) ** .5, LINE);
    }
  }
  // Spots: rows between the pale lines on the body, smaller and denser on the head.
  const rows = [.2, .78, 1.22, 1.62];
  for (const side of [1, -1]) {
    for (let j = 0; j < 23; j++) {
      const s = .228 + j * .0215;
      if (s > .72) break;
      for (const [r, theta] of rows.entries()) {
        if (r === 3 && (s > .52 || j % 2)) continue;
        const jitter = .004 * noise(j * 3.3 + r * 7.1, side);
        dot(ctx, s + jitter, side * (theta + .05 * noise(j * 1.9 + r, 5 + side)), .0068 - .0012 * smoothstep(.55, .72, s), SPOT);
      }
      if (j % 2 === 0) dot(ctx, s + .01, side * .47, .006, SPOT);
    }
    // Head: a jittered grid of small spots, offset on alternate rows.
    for (let row = 0; row < 7; row++) {
      const s = .03 + row * .027;
      for (let col = 0; col < 6; col++) {
        const theta = .14 + col * .245 + (row % 2) * .12 + .05 * noise(row * 6 + col, 9 + side);
        if (theta > 1.5 || (s < .06 && theta > 1.2)) continue;
        dot(ctx, s + .006 * noise(row * 5.7 + col * 2.3, 13 + side), side * theta, .0046, SPOT);
      }
    }
  }

  ctx.spineBones();
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tail.upper },
    { name: 'TailLower', parent: 'Tail', position: tail.lower },
    { name: 'Dorsal', parent: rig.dorsalParent, position: dorsal.base },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  return { mesh, bones };
}
