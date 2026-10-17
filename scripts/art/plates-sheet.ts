/**
 * A review sheet of the engraved species plates: each plate at a large size, at card size and as
 * the pencil outline of a species still to find, written as one HTML page to open in a browser.
 *
 * Run: npm run plates:sheet -- out.html                    (every species)
 *      npm run plates:sheet -- out.html whale-shark tiger-shark
 */
import { writeFileSync } from 'node:fs';

import { SPECIES_BY_ID } from '../../src/data/species';
import { drawPlate, fit, plateSvg } from '../../src/lib/plates/render';
import { PLATES } from '../../src/lib/plates/registry';

const [out = 'plates.html', ...only] = process.argv.slice(2);
const ids = only.length ? only : [...SPECIES_BY_ID.keys()];
const cards = ids.map((id, i) => {
  const def = PLATES[id];
  if (!def) return `<div class="card"><p>No plate for ${id}</p></div>`;
  const g = fit(def.build());
  const s = SPECIES_BY_ID.get(id);
  return `<div class="card">${plateSvg(drawPlate(g, def.palette, { width: 360 }), 360, `l${i}`)}<div class="small">${plateSvg(drawPlate(g, def.palette, { width: 110 }), 110, `s${i}`)}${plateSvg(drawPlate(g, def.palette, { width: 110, found: false, paper: '#FFFDF8' }), 110, `p${i}`)}</div><p><i>${s?.scientificName ?? ''}</i> · ${s?.commonName ?? id}</p></div>`;
});
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Species plates</title><style>body{margin:0;padding:16px;background:#F6F0E2;font:13px Georgia,serif;color:#1F2A44;display:grid;grid-template-columns:repeat(auto-fill,392px);gap:12px}.card{background:#FBF7EC;border:1px solid #D8CDB4;padding:16px}.small{display:flex;gap:12px}p{margin:6px 0 0}</style>${cards.join('')}`,
);
console.log(`Wrote ${ids.length} plates to ${out}`);
