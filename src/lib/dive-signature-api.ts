import type { SupabaseClient } from '@supabase/supabase-js';

import { isSignaturePath } from '@/lib/dives';
import { formatCode, isCompleteCode, verificationError, VerificationError, type CreatedCode } from '@/lib/verification-api';

/**
 * A buddy signing a page of the diver's log from their own phone (supabase/migrations/0009). The
 * diver makes a code for the page; the buddy, signed in, sees the page's number, site and date and
 * signs. The server decides everything; these only ask it.
 *
 * Page codes read DXXXX-XXXXX. Sighting codes are ten random characters, so one in 32 also starts
 * with a D: a D code that matches no page is tried as a sighting code too (lookUpBuddyCode).
 */

export type SignerRole = 'buddy' | 'instructor' | 'divemaster' | 'guide' | 'other';
export type SignOutcome = 'ok' | 'invalid_code' | 'expired' | 'rate_limited' | 'own_dive' | 'changed' | 'already_signed';

export const SIGNER_ROLES: SignerRole[] = ['buddy', 'guide', 'instructor', 'divemaster', 'other'];
export const SIGNER_ROLE_LABEL: Record<SignerRole, string> = {
  buddy: 'Dive buddy',
  guide: 'Guide',
  instructor: 'Instructor',
  divemaster: 'Divemaster',
  other: 'Other',
};

/** What a page code asks the buddy to sign. */
export interface DivePreview {
  diveId: string;
  number: number;
  siteId: string;
  /** From the server, for a site this phone doesn't know. */
  siteName?: string;
  divedOn: string;
  timeIn?: string;
  bottomTimeMin?: number;
  maxDepthM?: number;
  buddyName?: string;
  centreName?: string;
  owner: string;
  expiresAt: string;
  /** They have already signed this page. */
  signed: boolean;
}

export const SIGN_OUTCOME_MESSAGE: Record<Exclude<SignOutcome, 'ok'>, string> = {
  invalid_code: 'That code doesn’t match a dive. Check it with your buddy.',
  expired: 'That code has expired or has been used. Ask your buddy for a new one.',
  rate_limited: 'Too many codes tried. Please wait an hour and try again.',
  own_dive: 'That’s a page of your own log. Send the code to someone who dived with you.',
  changed: 'The page was changed after you opened it. Check the number, site and date again before you sign.',
  already_signed: 'You’ve already signed this page.',
};

const UNAVAILABLE = 'Signing dives isn’t switched on for this ScubaGo server yet.';

function signError(e: unknown): VerificationError {
  const error = verificationError(e);
  return error.kind === 'unavailable' ? new VerificationError(UNAVAILABLE, 'unavailable') : error;
}

async function call<T>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  let result: { data: unknown; error: unknown };
  try {
    result = await promise;
  } catch (e) {
    throw signError(e);
  }
  if (result.error) throw signError(result.error);
  return result.data as T;
}

/** A complete code that names a page (rather than a sighting) if anything does. */
export const isDiveCode = (input: string): boolean => isCompleteCode(input) && formatCode(input).startsWith('D');

/** A code for one of the diver's pages (it must have synced). */
export async function askBuddyToSign(client: SupabaseClient, diveId: string): Promise<CreatedCode> {
  const data = await call<{ id: string; code: string; expires_at: string; max_uses: number }>(
    client.rpc('create_dive_signature_request', { target: diveId }),
  );
  return { id: data.id, code: data.code, expiresAt: new Date(data.expires_at).toISOString(), maxUses: data.max_uses };
}

/** Withdraw a page code (it stops working at once). */
export async function withdrawSignCode(client: SupabaseClient, requestId: string): Promise<void> {
  await call(client.rpc('revoke_dive_signature_request', { request: requestId }));
}

/** What a page code asks the buddy to sign (nothing is signed yet). */
export async function lookUpDiveCode(client: SupabaseClient, code: string): Promise<{ outcome: SignOutcome; preview?: DivePreview }> {
  const data = await call<{
    result: SignOutcome; owner?: string; site_name?: string | null; expires_at?: string; signed?: boolean;
    dive?: {
      id: string; number: number; site_id: string; dived_on: string; time_in: string | null; bottom_time_min: number | null;
      max_depth_m: number | null; buddy_name: string | null; centre_name: string | null;
    };
  }>(client.rpc('preview_dive_signature', { code: formatCode(code) }));
  if (data.result !== 'ok' || !data.dive) return { outcome: data.result === 'ok' ? 'invalid_code' : data.result };
  const d = data.dive;
  return {
    outcome: 'ok',
    preview: {
      diveId: d.id,
      number: d.number,
      siteId: d.site_id,
      siteName: data.site_name ?? undefined,
      divedOn: d.dived_on,
      timeIn: d.time_in ? d.time_in.slice(0, 5) : undefined,
      bottomTimeMin: d.bottom_time_min ?? undefined,
      maxDepthM: d.max_depth_m ?? undefined,
      buddyName: d.buddy_name ?? undefined,
      centreName: d.centre_name ?? undefined,
      owner: data.owner ?? 'diver',
      expiresAt: data.expires_at ?? '',
      signed: !!data.signed,
    },
  };
}

/** Sign the page the buddy was shown (its number, site and date), with their name, role and signature. */
export async function signWithCode(
  client: SupabaseClient,
  code: string,
  signer: { name: string; role: SignerRole; svg?: string },
  shown: Pick<DivePreview, 'number' | 'siteId' | 'divedOn'>,
): Promise<SignOutcome> {
  const data = await call<{ result: SignOutcome }>(
    client.rpc('sign_dive', {
      code: formatCode(code),
      signer_name: signer.name.trim(),
      signer_role: signer.role,
      signature: signer.svg && isSignaturePath(signer.svg) ? signer.svg : null,
      expected_number: shown.number,
      expected_site: shown.siteId,
      expected_date: shown.divedOn,
    }),
  );
  return data.result;
}

/** The share message for a page code. */
export function signShareMessage(number: number, siteName: string, code: string, expiresAt: string): string {
  const until = new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Can you sign dive No. ${number} at ${siteName} in my ScubaGo logbook? In the app, go to Logbook → Buddy code and enter ${code} (valid until ${until}).\n\nscubago://verify?code=${code}`;
}
