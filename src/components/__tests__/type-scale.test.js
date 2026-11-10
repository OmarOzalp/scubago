import { describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { TextStyles } from '@/components/themed-text';

jest.mock('@/global.css', () => ({}));

// The smallest text in the app is 13 pt, and the small typewriter capitals are normal-case labels.
describe('the type scale', () => {
  test('no text style is smaller than 13', () => {
    const sizes = Object.values(TextStyles).map((s) => s.fontSize ?? 16);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13);
  });

  test('a label is a normal-case title, not small capitals: footnoteStrong, tracked no more than the scale says', () => {
    expect(TextStyles.label.textTransform).toBeUndefined();
    expect(TextStyles.label).toEqual(TextStyles.footnoteStrong);
    expect(TextStyles.label.letterSpacing ?? 0).toBeLessThanOrEqual(0.1);
  });

  test('the old names are drawn as styles of the v2 scale, and only titles and figures are serif', () => {
    expect(TextStyles.small).toEqual(TextStyles.subhead);
    expect(TextStyles.heading).toEqual(TextStyles.headline);
    expect(TextStyles.default).toEqual(TextStyles.body);
    const serif = Object.entries(TextStyles).filter(([, s]) => /^Fraunces/.test(s.fontFamily)).map(([name]) => name).sort();
    expect(serif).toEqual(['display', 'figure', 'hero', 'number', 'scientific', 'subtitle', 'title']);
  });
});

// No screen or component sets a font size under 13 itself. (The 3D scene, the share cards drawn at 1080 px and the
// developer-only frame-rate badge are exempt; the map, site list and rewards are covered by their own pass.)
const ROOT = path.resolve(process.cwd(), 'src');
const EXEMPT = [/[\\/]three[\\/]/, /[\\/]share[\\/]/, /__tests__/, /island-perf-badge/];
function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.tsx$/.test(entry.name) && !EXEMPT.some((re) => re.test(full))) yield full;
  }
}

test('no component draws text under 13 pt', () => {
  const small = [];
  for (const dir of ['app', 'components']) {
    for (const file of files(path.join(ROOT, dir))) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const m = line.match(/fontSize:\s*(\d+(?:\.\d+)?)/);
          if (m && Number(m[1]) < 13) small.push(`${path.relative(ROOT, file)}:${i + 1} fontSize ${m[1]}`);
        });
    }
  }
  expect(small).toEqual([]);
});
