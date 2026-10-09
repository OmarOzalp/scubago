import type { SupabaseClient } from '@supabase/supabase-js';

import type { SightingStatus } from '@/lib/types';
import { isConnectionProblem } from '@/lib/verification';

/**
 * "Ask a buddy": the app's side of buddy verification (supabase/migrations/0006). Everything that
 * decides anything happens on the server; these only ask it, and turn its answers into words.
 */

/** What the verifier says they were on the dive (a claim: ScubaGo doesn't check it yet). */
export type VerifierRole = 'buddy' | 'instructor' | 'divemaster' | 'other';
export type Decision = 'saw_it' | 'did_not_see' | 'was_not_there';
export type Outcome = 'ok' | 'invalid_code' | 'expired' | 'rate_limited' | 'own_sighting' | 'changed' | 'already_answered';

export const ROLE_LABEL: Record<VerifierRole, string> = {
  buddy: 'Dive buddy', instructor: 'Instructor', divemaster: 'Divemaster', other: 'Other',
};

/** A code the owner has just created: shown to them once (only its hash is kept on the server). */
export interface CreatedCode { id: string; code: string; expiresAt: string; maxUses: number }

/** What a code asks the verifier to confirm. */
export interface CodePreview {
  sightingId: string;
  speciesId: string;
  siteId: string;
  /** From the server, for a site this device doesn't know yet. */
  siteName?: string;
  sightedOn: string;
  notes?: string;
  photoUrl?: string;
  owner: string;
  ownerId?: string;
  expiresAt: string;
  /** Their earlier answer, if they have given one. */
  answered: Decision | null;
}

export interface Answer { verifier: string; role: VerifierRole; decision: Decision; at: string }
export interface RequestInfo { id: string; expiresAt: string; status: 'open' | 'used' | 'expired' | 'revoked'; uses: number; maxUses: number; createdAt: string }
export interface Summary { requests: RequestInfo[]; answers: Answer[] }

/** Why something couldn't be done, in words for the diver, and what kind of problem it was. */
export class VerificationError extends Error {
  constructor(message: string, readonly kind: 'offline' | 'unavailable' | 'refused' | 'unknown') {
    super(message);
  }
}

const OFFLINE = 'You’re offline. Codes need a connection to create, look up or answer; try again when you’re back online.';
const UNAVAILABLE = 'Buddy verification isn’t switched on for this ScubaGo server yet.';

/** Turn whatever a call failed with into a VerificationError. */
export function verificationError(e: unknown): VerificationError {
  if (e instanceof VerificationError) return e;
  const error = (e ?? {}) as { message?: string; code?: string };
  const message = error.message ?? String(e);
  if (isConnectionProblem(message)) return new VerificationError(OFFLINE, 'offline');
  // The functions aren't there: migration 0006 hasn't been applied to this project.
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === 'PGRST205' || error.code === '42P01') {
    return new VerificationError(UNAVAILABLE, 'unavailable');
  }
  if (error.code === '42501' || error.code === 'P0001') return new VerificationError(message, 'refused');
  return new VerificationError(message || 'Something went wrong. Please try again.', 'unknown');
}

/** What an outcome means for the verifier. */
export const OUTCOME_MESSAGE: Record<Exclude<Outcome, 'ok'>, string> = {
  invalid_code: 'That code doesn’t match a sighting. Check it with your buddy.',
  expired: 'That code has expired or has been used. Ask your buddy for a new one.',
  rate_limited: 'Too many codes tried. Please wait an hour and try again.',
  own_sighting: 'That’s your own sighting. Send the code to someone who was on the dive with you.',
  changed: 'The sighting was changed after you opened it. Check the species, site and date again before you answer.',
  already_answered: 'You’ve already answered for this sighting.',
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A code as typed, tidied up: capitals, Crockford's look-alikes read as digits (O→0, I and L→1),
 * anything else dropped, and the dash after five characters. At most ten characters.
 */
export function formatCode(input: string): string {
  const chars = input.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').split('').filter((c) => CROCKFORD.includes(c)).slice(0, 10).join('');
  return chars.length > 5 ? `${chars.slice(0, 5)}-${chars.slice(5)}` : chars;
}

export const isCompleteCode = (input: string) => formatCode(input).length === 11;

async function call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  let result: { data: unknown; error: unknown };
  try {
    result = await promise;
  } catch (e) {
    throw verificationError(e);
  }
  if (result.error) throw verificationError(result.error);
  return result.data as T;
}

/** A new code for one of the owner's sightings. */
export async function askBuddy(client: SupabaseClient, sightingId: string): Promise<CreatedCode> {
  const data = await call<{ id: string; code: string; expires_at: string; max_uses: number }>(
    client.rpc('create_verification_request', { target: sightingId }),
  );
  return { id: data.id, code: data.code, expiresAt: new Date(data.expires_at).toISOString(), maxUses: data.max_uses };
}

/** Withdraw a code (it stops working at once). */
export async function withdrawCode(client: SupabaseClient, requestId: string): Promise<void> {
  await call(client.rpc('revoke_verification_request', { request: requestId }));
}

/** What a code asks the verifier to confirm (nothing is answered yet). */
export async function lookUpCode(client: SupabaseClient, code: string): Promise<{ outcome: Outcome; preview?: CodePreview }> {
  const data = await call<{
    result: Outcome; owner?: string; site_name?: string | null; expires_at?: string; answered?: Decision | null;
    sighting?: { id: string; species_id: string; site_id: string; sighted_on: string; notes: string | null; photo_url: string | null; user_id?: string };
  }>(client.rpc('preview_verification', { code: formatCode(code) }));
  if (data.result !== 'ok' || !data.sighting) return { outcome: data.result === 'ok' ? 'invalid_code' : data.result };
  const s = data.sighting;
  return {
    outcome: 'ok',
    preview: {
      sightingId: s.id, speciesId: s.species_id, siteId: s.site_id, siteName: data.site_name ?? undefined, sightedOn: s.sighted_on,
      notes: s.notes ?? undefined, photoUrl: s.photo_url ?? undefined, ownerId: s.user_id,
      owner: data.owner ?? 'diver', expiresAt: data.expires_at ?? '', answered: data.answered ?? null,
    },
  };
}

/** Answer a code for the sighting the verifier was shown (its species, site and date). */
export async function answerCode(
  client: SupabaseClient,
  code: string,
  decision: Decision,
  role: VerifierRole,
  shown: Pick<CodePreview, 'speciesId' | 'siteId' | 'sightedOn'>,
): Promise<{ outcome: Outcome; status?: SightingStatus }> {
  const data = await call<{ result: Outcome; status?: SightingStatus }>(client.rpc('attest', {
    code: formatCode(code), decision, verifier_role: role,
    expected_species: shown.speciesId, expected_site: shown.siteId, expected_date: shown.sightedOn,
  }));
  return { outcome: data.result, status: data.status };
}

/** The owner's codes for a sighting and the answers to them (newest first). */
export async function verificationSummary(client: SupabaseClient, sightingId: string): Promise<Summary> {
  const [requests, answers] = await Promise.all([
    call<{ id: string; expires_at: string; status: RequestInfo['status']; uses: number; max_uses: number; created_at: string }[]>(
      client.from('verification_requests').select('id,expires_at,status,uses,max_uses,created_at')
        .eq('sighting_id', sightingId).order('created_at', { ascending: false }),
    ),
    call<{ role: VerifierRole; decision: Decision; created_at: string; profiles: { username: string } | null }[]>(
      client.from('attestations').select('role,decision,created_at,profiles(username)')
        .eq('sighting_id', sightingId).order('created_at', { ascending: false }),
    ),
  ]);
  return {
    requests: requests.map((r) => ({
      id: r.id, expiresAt: new Date(r.expires_at).toISOString(), status: r.status, uses: r.uses, maxUses: r.max_uses,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    answers: answers.map((a) => ({ verifier: a.profiles?.username ?? 'a diver', role: a.role, decision: a.decision, at: new Date(a.created_at).toISOString() })),
  };
}

/** A code still usable: open, not expired, with uses left. */
export function usable(r: RequestInfo, now = Date.now()): boolean {
  return r.status === 'open' && Date.parse(r.expiresAt) > now && r.uses < r.maxUses;
}

/** The share message: the code first, and a link that opens it in the app where the app is installed. */
export function shareMessage(speciesName: string, code: string, expiresAt: string): string {
  const until = new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Can you confirm my ${speciesName} sighting on ScubaGo? In the app, go to My Log → Confirm a buddy’s sighting and enter ${code} (valid until ${until}).\n\nscubago://verify?code=${code}`;
}
