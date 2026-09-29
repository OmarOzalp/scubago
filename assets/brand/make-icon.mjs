// ScubaGo's placeholder brand art (replace freely): run `node assets/brand/make-icon.mjs` in assets/brand to
// regenerate icon.svg (app icon), mark.svg (white mark: splash), foreground/monochrome/background.svg
// (Android adaptive layers), then export the PNGs in assets/images with any SVG renderer.
// Generates ScubaGo's icon art: a manta ray seen from above, symmetric, on an ocean gradient.
import { writeFileSync } from 'node:fs';
const C = 512;
// Right half, from the front centre around to the tail: M start, then cubic segments [c1, c2, end].
const start = [512, 336];
const right = [
  [[530, 334], [546, 304], [553, 266]],   // inner edge of the right cephalic fin, up to its tip
  [[566, 280], [576, 302], [580, 326]],   // outer edge back down
  [[668, 340], [800, 440], [890, 588]],   // leading edge of the wing, out to the swept-back tip
  [[800, 574], [694, 590], [612, 636]],   // concave trailing edge, back toward the body
  [[586, 652], [556, 682], [534, 706]],   // pelvic taper
  [[528, 714], [522, 718], [519, 722]],   // narrowing to the tail base
  [[517, 790], [515, 850], [513.5, 910]], // the tail, right edge
];
const fmt = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
const mirror = ([x, y]) => [2 * C - x, y];
function mantaPath(scale = 1, dx = 0, dy = 0) {
  const t = ([x, y]) => [(x - C) * scale + C + dx, (y - C) * scale + C + dy];
  let d = `M ${fmt(t(start))}`;
  for (const [a, b, e] of right) d += ` C ${fmt(t(a))} ${fmt(t(b))} ${fmt(t(e))}`;
  // Across the tail tip, then the left half in reverse (mirrored, control points swapped).
  const points = [start, ...right.map((s) => s[2])];
  d += ` L ${fmt(t(mirror(points[points.length - 1])))}`;
  for (let i = right.length - 1; i >= 0; i--) {
    const [a, b] = right[i];
    d += ` C ${fmt(t(mirror(b)))} ${fmt(t(mirror(a)))} ${fmt(t(mirror(points[i])))}`;
  }
  return d + ' Z';
}
const manta = (fill, scale = 1, dy = 0, extra = '') => `<path d="${mantaPath(scale, 0, dy)}" fill="${fill}" ${extra}/>`;
const bubbles = (fill) => [[706, 250, 16], [742, 196, 10], [690, 170, 7]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
const defs = `<defs>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2CC8DA"/><stop offset=".55" stop-color="#0891B2"/><stop offset="1" stop-color="#0A4A78"/>
  </linearGradient>
  <radialGradient id="light" cx=".5" cy="0" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8F6FA"/></linearGradient>
</defs>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1024 1024">${defs}${body}</svg>`;
// App icon: full-bleed square (iOS rounds the corners itself).
writeFileSync('icon.svg', svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#sea)"/><rect width="1024" height="1024" fill="url(#light)"/>${manta('#063A5E', .92, 34, 'opacity=".25"')}${manta('url(#body)', .92, 10)}${bubbles('#FFFFFF" fill-opacity=".7')}`));
// Transparent white mark (splash, Android foreground/monochrome).
writeFileSync('mark.svg', svg(1024, 1024, `${manta('#FFFFFF', .92, 10)}${bubbles('#FFFFFF')}`));
// Android adaptive foreground and monochrome: the mark inside the launcher's safe zone (the middle ~60%).
writeFileSync('foreground.svg', svg(1024, 1024, `${manta('url(#body)', .56, 6)}`));
writeFileSync('monochrome.svg', svg(1024, 1024, `${manta('#FFFFFF', .56, 6)}`));
// Android adaptive background: the sea alone.
writeFileSync('background.svg', svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#sea)"/><rect width="1024" height="1024" fill="url(#light)"/>`));
console.log('ok');
