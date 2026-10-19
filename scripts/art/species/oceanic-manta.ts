/**
 * Oceanic manta ray (Mobula birostris): the reef manta's sheet, larger, and told apart by its markings.
 * On the jet-black back, two bright white shoulder patches shaped like right triangles: their front
 * edges run straight across behind the head, parallel to the mouth, and their inner edges along the
 * spine, so the black between them makes a "T"; their rear edges shade into grey. Below, a black mouth
 * and dark-grey chin, broad charcoal margins along the back and tips of the wings, and the dark belly
 * spots gathered low on the abdomen, behind the gill slits.
 */
import { Vector3 } from 'three';
import { buildManta, leadingEdge, sheet, sheetNormal, trailingEdge, wingSkin, type MantaLook } from './reef-manta';
import { clamp, hex, mix, MeshBuilder, noise, smoothstep, type RGB } from './kit';

const BACK = hex('#14181a'), WHITE = hex('#e9edeb'), SHADE = hex('#2c3336'), BELLY = hex('#f1f2ee');
const MARGIN = hex('#3d4548'), CHIN = hex('#4a5356'), MOUTH = hex('#0b0e0f'), GILL = hex('#8f999a'), SPOT = hex('#262d30');

/**
 * The patches (fore-aft z, the head's front at 0.205; span a from the midline): the straight front edge,
 * the half-width of the T's stem, the black band left along the wing's leading edge, and the rear edge
 * running diagonally from the spine out to the leading edge.
 */
const FRONT = .122, STEM = .03, BAND = .014;
const rear = (a: number) => -.035 + (a - STEM) * .52;
/** Where the patch's front meets its rear edge, out on the wing. */
const OUTER = (() => {
  let lo = STEM, hi = .45;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (Math.min(FRONT, leadingEdge(mid) - BAND) > rear(mid)) lo = mid; else hi = mid;
  }
  return lo;
})();

/** The white shoulder patches, laid on the back as their own thin skin so their straight edges stay straight. */
function shoulderPatches(mesh: MeshBuilder) {
  const columns = 18, rows = 7;
  for (const side of [1, -1]) {
    mesh.begin();
    const ids = Array.from({ length: columns + 1 }, (_, i) => {
      // Columns from the stem out to the tip of the patch, closer together toward the tip.
      const a = STEM + (OUTER - STEM) * Math.sin(Math.PI / 2 * i / columns), x = side * a;
      const le = leadingEdge(a), te = trailingEdge(a);
      const zFront = Math.min(FRONT, le - BAND), zRear = Math.min(zFront, rear(a));
      return Array.from({ length: rows + 1 }, (_, j) => {
        const t = j / rows, z = zFront + (zRear - zFront) * t;
        const u = (le - z) / (le - te);
        const n = sheetNormal(x, u, true);
        const p = sheet(x, u, true).addScaledVector(n, .0009);
        // Bright in front, shading to grey toward the rear edge and the outer tip.
        const shade = clamp(smoothstep(.35, 1, t) + .6 * smoothstep(.6, 1, (a - STEM) / (OUTER - STEM)) + .04 * noise(a * 60 + z * 40, 5));
        return mesh.vertex(p, mix(WHITE, SHADE, shade), wingSkin(x, p.z), n);
      });
    });
    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < rows; j++) mesh.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
    }
    mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
  }
}

function bottom(x: number, u: number): RGB {
  const a = Math.abs(x);
  const z = sheet(x, u, false).z;
  // Broad charcoal margins along the back of the wings and round their tips, and a dark band in from each tip's leading edge.
  const trailing = smoothstep(.66, .86, u + .03 * noise(a * 25, 3)) * smoothstep(.08, .2, a);
  const tip = smoothstep(.36, .47, a);
  const leading = (1 - smoothstep(.04, .14, u)) * smoothstep(.28, .42, a) * .7;
  // The chin around the mouth is dark grey.
  const chin = (1 - smoothstep(.04, .07, a)) * smoothstep(.14, .175, z);
  return mix(mix(BELLY, MARGIN, clamp(trailing + tip + leading)), CHIN, chin);
}

const OCEANIC_MANTA: MantaLook = {
  back: BACK, belly: BELLY, gill: GILL, mouth: MOUTH, spot: SPOT, bottom,
  top: () => BACK,
  mouthWidth: (t) => .0058 * Math.sin(Math.PI * (.06 + .88 * t)) ** .4,
  spots: [[-.014, .62, .008], [.011, .66, .007], [-.003, .72, .0065], [.022, .7, .006], [-.026, .68, .0055], [.006, .78, .006], [-.016, .8, .005], [.03, .76, .0045]],
};

export function buildOceanicManta() {
  const model = buildManta(OCEANIC_MANTA);
  shoulderPatches(model.mesh);
  return model;
}
