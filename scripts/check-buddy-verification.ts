/**
 * "Ask a buddy" end to end on a live project, as two divers, with only the app's publishable key:
 * the owner logs a test sighting and asks, the buddy looks the code up and confirms, and the owner
 * sees "Buddy verified". Then the refusals: answering your own code, a wrong code, answering twice,
 * writing a status or an answer directly, and an edit that voids the confirmation. At the end it
 * deletes its test sighting, which takes its codes and answers with it.
 *
 * Run once migration 0006 is applied, with two test accounts (not real divers': sign-in creates
 * them if they don't exist yet):
 *   CHECK_OWNER_EMAIL=… CHECK_OWNER_PASSWORD=… CHECK_BUDDY_EMAIL=… CHECK_BUDDY_PASSWORD=… npm run check:buddy
 * The deeper checks (expiry, guessing limits, deleted accounts) run in the SQL editor:
 * supabase/checks/verification-check.sql.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ensureProfile, signInWithPassword } from '../src/lib/auth';
import { checkSupabaseConfig, describeSupabaseConfig } from '../src/lib/supabase-env';
import { answerCode, askBuddy, lookUpCode, verificationSummary } from '../src/lib/verification-api';
import { envSources, supabaseSettings } from './lib/env-files';

const { url, key } = supabaseSettings(envSources(join(__dirname, '..')));
const config = checkSupabaseConfig(url, key);
if (config.status !== 'ok') {
  console.error(config.status === 'unconfigured' ? 'No Supabase settings found (see .env.example).' : describeSupabaseConfig(config));
  process.exit(1);
}
const accounts = ['OWNER', 'BUDDY'].map((who) => ({ email: process.env[`CHECK_${who}_EMAIL`], password: process.env[`CHECK_${who}_PASSWORD`] }));
if (accounts.some((a) => !a.email || !a.password) || accounts[0].email === accounts[1].email) {
  console.error('Set CHECK_OWNER_EMAIL, CHECK_OWNER_PASSWORD, CHECK_BUDDY_EMAIL and CHECK_BUDDY_PASSWORD: two different test accounts.');
  process.exit(1);
}

let failed = 0;
function check(item: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok    ' : 'ACTION'}  ${item}${ok || detail === undefined ? '' : `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

async function signIn(email: string, password: string) {
  const client = createClient(config.status === 'ok' ? config.url : '', config.status === 'ok' ? config.key : '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { id } = await signInWithPassword(client, email, password);
  return { client, id, username: await ensureProfile(client, id) };
}

async function main() {
  const owner = await signIn(accounts[0].email!, accounts[0].password!);
  const buddy = await signIn(accounts[1].email!, accounts[1].password!);
  const sightingId = randomUUID();
  const facts = { species_id: 'whale-shark', site_id: 'richelieu-rock', sighted_on: '2026-01-15' };
  const own = (c: SupabaseClient) => c.from('sightings').select('status').eq('id', sightingId).single();
  try {
    const logged = await owner.client.from('sightings').insert({ id: sightingId, user_id: owner.id, ...facts, notes: 'ScubaGo buddy check (test data, deleted by the check)' });
    if (logged.error) throw new Error(`could not log the test sighting: ${logged.error.message}`);

    const code = await askBuddy(owner.client, sightingId);
    check('the owner gets a code', /^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(code.code), code);
    check('the owner cannot answer their own code', (await lookUpCode(owner.client, code.code)).outcome === 'own_sighting');
    check('a wrong code is refused', (await lookUpCode(buddy.client, 'ZZZZZ-ZZZZZ')).outcome === 'invalid_code');

    const seen = await lookUpCode(buddy.client, code.code);
    check('the buddy sees species, site, date and who logged it', seen.outcome === 'ok' && seen.preview?.speciesId === facts.species_id
      && seen.preview.siteId === facts.site_id && seen.preview.sightedOn === facts.sighted_on && seen.preview.owner === owner.username, seen);
    if (!seen.preview) throw new Error('the buddy could not look the code up');

    const forged = await owner.client.from('sightings').update({ status: 'confirmed' }).eq('id', sightingId).select('status');
    check('the app cannot set a status', forged.error?.code === '42501', forged.error ?? forged.data);
    const direct = await buddy.client.from('attestations').insert({ request_id: code.id, sighting_id: sightingId, verifier_id: buddy.id, role: 'buddy', decision: 'saw_it' });
    check('answers cannot be written directly', !!direct.error, direct.error);
    check('still unverified', (await own(owner.client)).data?.status === 'unverified');

    const answer = await answerCode(buddy.client, code.code, 'saw_it', 'buddy', seen.preview);
    check('the buddy confirms it', answer.outcome === 'ok' && answer.status === 'confirmed', answer);
    check('the owner sees "Buddy verified"', (await own(owner.client)).data?.status === 'confirmed');
    const summary = await verificationSummary(owner.client, sightingId);
    check('the owner sees who confirmed it', summary.answers.some((a) => a.verifier === buddy.username && a.decision === 'saw_it'), summary.answers);
    check('the same diver cannot answer twice', (await answerCode(buddy.client, code.code, 'did_not_see', 'buddy', seen.preview)).outcome === 'already_answered');
    check("others can't see the owner's codes", (await verificationSummary(buddy.client, sightingId)).requests.length === 0);

    const edited = await owner.client.from('sightings').update({ sighted_on: '2026-01-14' }).eq('id', sightingId).select('status').single();
    check('editing the date resets the status', edited.data?.status === 'unverified', edited.error ?? edited.data);
    check('and clears the old answers', (await verificationSummary(owner.client, sightingId)).answers.length === 0);
  } finally {
    const removed = await owner.client.from('sightings').delete().eq('id', sightingId).select('id');
    check('the test sighting is deleted', !removed.error && removed.data?.length === 1, removed.error ?? `delete sighting ${sightingId} by hand`);
  }
  console.log(failed ? `\n${failed} to fix.` : '\nBuddy verification works on this project.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(/function|schema cache|PGRST202/i.test(message) ? `Migration 0006 doesn't seem to be applied: ${message}` : message);
  process.exit(1);
});
