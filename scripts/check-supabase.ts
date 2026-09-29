/**
 * Checks a live Supabase project from the outside, with only the app's publishable (or anon) key,
 * exactly as the app sees it. Read-only: the write attempts below are ones the database must
 * refuse, and each points at rows that cannot exist, so nothing is created even if a policy is
 * missing.
 *
 * Run: npm run check:supabase   (reads EXPO_PUBLIC_SUPABASE_URL and the key from the environment,
 * .env.local or .env). The deeper checks run in the SQL editor: supabase/checks/audit.sql and
 * supabase/checks/rls-isolation.sql (see docs/ios-distribution.md, "Supabase after a reset").
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias in scripts.
 */
import { join } from 'node:path';

import { SITES } from '../src/data/sites';
import { SPECIES } from '../src/data/species';
import { checkSupabaseConfig, describeSupabaseConfig } from '../src/lib/supabase-env';
import { envSources, supabaseSettings } from './lib/env-files';

type Verdict = 'ok' | 'ACTION' | 'info';
const results: { verdict: Verdict; item: string; detail: string }[] = [];
const note = (verdict: Verdict, item: string, detail: string) => results.push({ verdict, item, detail });

const { url, key } = supabaseSettings(envSources(join(__dirname, '..')));
const config = checkSupabaseConfig(url, key);
if (config.status !== 'ok') {
  console.error(config.status === 'unconfigured'
    ? 'No Supabase settings found. Put EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env (see .env.example).'
    : describeSupabaseConfig(config));
  process.exit(1);
}
const base = config.url;
const headers = { apikey: config.key };

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, headers: response.headers, body };
}

/** Rows in a table (via PostgREST's exact count), or null with the error if the table is unreachable. */
async function count(table: string, filter = '') {
  const { status, headers: h, body } = await call(`/rest/v1/${table}?select=id&limit=1${filter}`, { headers: { Prefer: 'count=exact' } });
  if (status >= 400) return { rows: null, error: body?.message ?? `HTTP ${status}` };
  const total = Number(h.get('content-range')?.split('/')[1]);
  return { rows: Number.isFinite(total) ? total : null, error: null };
}

/** An insert the database must refuse. Row-level security should answer 42501 before any constraint runs. */
async function refused(item: string, table: string, row: object) {
  const { status, body } = await call(`/rest/v1/${table}`, {
    method: 'POST', body: JSON.stringify(row), headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  });
  if (body?.code === '42501') note('ok', item, 'refused by row-level security');
  else if (status < 300) note('ACTION', item, `ACCEPTED (HTTP ${status}): row-level security is missing on ${table}; delete any row whose id starts with "scubago-check" and apply the migrations`);
  else if (body?.code === '23503' || body?.code === '23505') note('ACTION', item, `row-level security let it through (only a constraint stopped it: ${body.code}); check the policies on ${table}`);
  else note('ACTION', item, `unexpected answer (HTTP ${status}${body?.code ? `, ${body.code}` : ''}: ${body?.message ?? body})`);
}

async function main() {
  console.log(`Checking ${new URL(base).host} with its ${config.status === 'ok' ? config.kind : ''} key…\n`);

  // Auth: ScubaGo's sign-in creates the account on first use and expects a session straight away.
  const auth = await call('/auth/v1/settings');
  if (auth.status === 401 || auth.status === 403) {
    console.error(`The project rejected the key (HTTP ${auth.status}: ${auth.body?.message ?? auth.body}). Check that EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is this project's publishable key (Project Settings → API Keys).`);
    process.exit(1);
  }
  if (auth.status >= 400 || typeof auth.body !== 'object') note('ACTION', 'auth settings', `unreachable (HTTP ${auth.status}): check the URL and key`);
  else {
    note(auth.body.external?.email ? 'ok' : 'ACTION', 'email sign-in', auth.body.external?.email ? 'enabled' : 'disabled: enable Authentication → Providers → Email');
    note(auth.body.disable_signup ? 'ACTION' : 'ok', 'new accounts', auth.body.disable_signup ? 'sign-ups are disabled: new testers cannot create accounts' : 'allowed');
    note(auth.body.mailer_autoconfirm ? 'ok' : 'ACTION', '"Confirm email" off',
      auth.body.mailer_autoconfirm ? 'yes: new accounts sign in immediately' : 'no: turn off Authentication → Providers → Email → "Confirm email", or new accounts cannot sign in');
  }

  // Schema and catalog: sightings point at species and dive sites; an empty catalog makes every upload fail.
  const species = await count('species');
  if (species.rows === null) note('ACTION', 'species catalog', `not reachable (${species.error}): apply supabase/migrations (supabase db push)`);
  else note(species.rows >= SPECIES.length ? 'ok' : 'ACTION', 'species catalog', `${species.rows} of ${SPECIES.length} species${species.rows >= SPECIES.length ? '' : ': run npm run seed:supabase'}`);
  const sites = await count('dive_sites', '&source=eq.seed');
  if (sites.rows === null) note('ACTION', 'curated dive sites', `not reachable (${sites.error}): apply supabase/migrations`);
  else note(sites.rows >= SITES.length ? 'ok' : 'ACTION', 'curated dive sites', `${sites.rows} of ${SITES.length} sites${sites.rows >= SITES.length ? '' : ': run npm run seed:supabase'}`);
  const profiles = await count('profiles'), sightings = await count('sightings');
  if (profiles.rows !== null && sightings.rows !== null) note('info', 'community data', `${profiles.rows} profiles, ${sightings.rows} sightings (public by design today)`);

  // Row-level security, as an anonymous visitor: every write refused.
  const nobody = '00000000-0000-0000-0000-000000000000', id = `scubago-check-${Date.now().toString(36)}`;
  await refused('anonymous sighting insert', 'sightings', { id, user_id: nobody, species_id: id, site_id: id, sighted_on: '2000-01-01' });
  await refused('anonymous profile insert', 'profiles', { user_id: nobody, username: id.slice(0, 24) });
  await refused('anonymous species insert', 'species', { id, common_name: id, scientific_name: id, category: 'other', rarity: 'common' });
  await refused('anonymous dive site insert', 'dive_sites', { id, name: id, lat: 0, lng: 0, source: 'user', created_by: nobody });

  // Photo bucket: exists and serves public reads (an object that isn't there: "not found", not "bucket not found").
  const photo = await call('/storage/v1/object/public/sighting-photos/scubago-check-missing.jpg');
  const message = String(photo.body?.message ?? photo.body?.error ?? photo.body ?? '');
  if (/bucket not found/i.test(message)) note('ACTION', 'photo bucket', 'sighting-photos is missing: apply supabase/migrations/0001_init.sql');
  else if (photo.status === 400 || photo.status === 404) note('ok', 'photo bucket', 'sighting-photos exists and is publicly readable');
  else note('info', 'photo bucket', `unexpected answer (HTTP ${photo.status}: ${message})`);

  const width = Math.max(...results.map((r) => r.item.length));
  for (const r of results) console.log(`${r.verdict.padEnd(6)} ${r.item.padEnd(width)}  ${r.detail}`);
  const actions = results.filter((r) => r.verdict === 'ACTION').length;
  console.log(`\n${actions ? `${actions} thing(s) to fix.` : 'All outside checks passed.'} Next, run supabase/checks/audit.sql and supabase/checks/rls-isolation.sql in the SQL editor (docs/ios-distribution.md).`);
  process.exit(actions ? 1 : 0);
}

main().catch((error) => {
  console.error(`check:supabase could not reach ${base}: ${error?.message ?? error}`);
  process.exit(1);
});
