import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Design system v2 (docs/design.md): a screen or component takes every size and colour from the tokens
 * (src/constants/theme.ts) or a primitive (src/components/ui). It never writes its own font size, font
 * family, corner radius, hex colour or shadow.
 *
 * Files not yet migrated are listed in design-tokens.allowlist.json, by area. The list only shrinks: a
 * listed file that no longer breaks a rule must come off it (this test says so), and a file that is not
 * listed may not break one. When the migration ends the list is empty.
 */
const ROOT = path.resolve(process.cwd(), 'src');
const ALLOWLIST = path.join(ROOT, '__tests__', 'design-tokens.allowlist.json');

/** Drawing code, which draws with its own fixed sizes and colours: the 3D scenes, plates and art, share cards, the stamp motif. */
const EXEMPT = [
  /^components\/ui\//,
  /\/__tests__\//,
  /\/three\//,
  /^components\/share\/(card-|archipelago-card|discovery-card|dive-log-card)/,
  /^components\/species-art\.tsx$/,
  /^components\/home\/(island-art|creature-art|sanctuary-scene|island-perf-badge)\.tsx$/,
  /^components\/rewards\/(emblem|badge-medal|palette|stamp-look)\.tsx?$/,
  /^components\/journal\/(stamp|wash)\.tsx$/,
  /^components\/animated-icon/,
];

const RULES = [
  { name: 'fontSize', re: /\bfontSize:\s*\d/ },
  { name: 'fontFamily', re: /\bfontFamily:\s*['"`]/ },
  { name: 'radius', re: /\b\w*[rR]adius:\s*\d/ },
  { name: 'hex colour', re: /['"`]#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/ },
  { name: 'boxShadow', re: /\bboxShadow:\s*['"`]/ },
];

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) yield full;
  }
}

/** Every file under src/app and src/components that breaks a rule, with its first few lines that do. */
function scan() {
  const found = new Map();
  for (const dir of ['app', 'components']) {
    for (const file of files(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (EXEMPT.some((re) => re.test(rel))) continue;
      const hits = [];
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // A comment may quote a value.
          const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
          for (const rule of RULES) if (rule.re.test(code)) hits.push(`${rel}:${i + 1} ${rule.name}`);
        });
      if (hits.length) found.set(rel, hits);
    }
  }
  return found;
}

const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
const listed = new Set(Object.values(allowlist).flat());

describe('design tokens', () => {
  const found = scan();

  test('no file outside the allowlist writes its own font size, font family, radius, hex colour or shadow', () => {
    const offenders = [...found.entries()].filter(([file]) => !listed.has(file)).flatMap(([, hits]) => hits.slice(0, 5));
    expect(offenders).toEqual([]);
  });

  test('the allowlist only shrinks: every listed file exists and still needs migrating', () => {
    const stale = [...listed].filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  test('the migrated screens and their components are off the allowlist', () => {
    const migrated = [
      'app/_layout.tsx',
      'app/(tabs)/_layout.tsx',
      'app/(tabs)/index.tsx',
      'app/(tabs)/field-guide.tsx',
      'app/(tabs)/map.tsx',
      'app/you.tsx',
      'app/design.tsx',
      'components/species-card.tsx',
      'components/site-list.tsx',
      'components/explore/search-bar.tsx',
      'components/explore/search-panel.tsx',
      'components/home/home-editor.tsx',
    ];
    expect(migrated.filter((file) => listed.has(file))).toEqual([]);
  });
});
