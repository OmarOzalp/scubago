import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  answerCode,
  askBuddy,
  formatCode,
  isCompleteCode,
  lookUpCode,
  shareMessage,
  usable,
  VerificationError,
  verificationError,
  verificationSummary,
  withdrawCode,
  type RequestInfo,
} from '@/lib/verification-api';

type Reply = { data?: unknown; error?: unknown };

/** A client whose RPCs answer from `replies` (by function name) and record what they were sent. */
function rpcClient(replies: Record<string, Reply | (() => Promise<Reply>)>) {
  const calls: [string, Record<string, unknown>][] = [];
  const client = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      const reply = replies[fn];
      const r = typeof reply === 'function' ? await reply() : reply;
      return { data: r?.data ?? null, error: r?.error ?? null };
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('codes as typed', () => {
  it('reads look-alikes as digits, drops anything else and adds the dash', () => {
    expect(formatCode('abcde fghjk')).toBe('ABCDE-FGHJK');
    expect(formatCode('o0Il1')).toBe('00111');
    expect(formatCode(' 7q2m-x9vt4 ')).toBe('7Q2MX-9VT4');
    expect(formatCode('7Q2MX9VT4K-EXTRA')).toBe('7Q2MX-9VT4K');
    // U isn't in the alphabet (Crockford), so it can't be part of a code.
    expect(formatCode('uuuuu')).toBe('');
  });

  it('knows a complete code', () => {
    expect(isCompleteCode('7q2mx9vt4k')).toBe(true);
    expect(isCompleteCode('7Q2MX-9VT4')).toBe(false);
  });
});

describe('errors in words', () => {
  it('tells a missing connection from a refusal and from a server without the feature', () => {
    expect(verificationError(new TypeError('Network request failed')).kind).toBe('offline');
    expect(verificationError({ message: 'FetchError: request to … failed' }).kind).toBe('offline');
    expect(verificationError({ code: 'PGRST202', message: 'Could not find the function' }).kind).toBe('unavailable');
    expect(verificationError({ code: 'PGRST205', message: 'Could not find the table' }).kind).toBe('unavailable');
    const refused = verificationError({ code: '42501', message: 'Only the diver who logged a sighting can ask for it to be confirmed' });
    expect(refused.kind).toBe('refused');
    expect(refused.message).toBe('Only the diver who logged a sighting can ask for it to be confirmed');
    expect(verificationError({ code: 'XX000', message: 'boom' })).toMatchObject({ kind: 'unknown', message: 'boom' });
  });

  it('passes a VerificationError through', () => {
    const e = new VerificationError('x', 'refused');
    expect(verificationError(e)).toBe(e);
  });
});

describe('asking a buddy', () => {
  it('creates a code for the sighting', async () => {
    const { client, calls } = rpcClient({
      create_verification_request: { data: { id: 'req-1', code: 'ABCDE-FGHJK', expires_at: '2026-10-06T10:00:00+00:00', max_uses: 3 } },
    });
    await expect(askBuddy(client, 's-1')).resolves.toEqual({
      id: 'req-1', code: 'ABCDE-FGHJK', expiresAt: '2026-10-06T10:00:00.000Z', maxUses: 3,
    });
    expect(calls).toEqual([['create_verification_request', { target: 's-1' }]]);
  });

  it('says why a code could not be created', async () => {
    const { client } = rpcClient({ create_verification_request: { error: { code: 'P0001', message: 'Too many open codes' } } });
    await expect(askBuddy(client, 's-1')).rejects.toMatchObject({ kind: 'refused', message: 'Too many open codes' });
  });

  it('says so when offline', async () => {
    const { client } = rpcClient({ create_verification_request: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(askBuddy(client, 's-1')).rejects.toMatchObject({ kind: 'offline' });
  });

  it('says so when the server has no buddy verification yet', async () => {
    const { client } = rpcClient({ create_verification_request: { error: { code: 'PGRST202', message: 'not found' } } });
    await expect(askBuddy(client, 's-1')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('withdraws a code', async () => {
    const { client, calls } = rpcClient({ revoke_verification_request: { data: null } });
    await withdrawCode(client, 'req-1');
    expect(calls).toEqual([['revoke_verification_request', { request: 'req-1' }]]);
  });
});

describe('answering a code', () => {
  const sighting = {
    id: 's-1', user_id: 'owner-1', species_id: 'whale-shark', site_id: 'richelieu-rock', sighted_on: '2026-09-20',
    notes: 'At the safety stop', photo_url: null, status: 'unverified',
  };

  it('looks a code up as typed, and shows what it asks', async () => {
    const { client, calls } = rpcClient({
      preview_verification: {
        data: { result: 'ok', sighting, owner: 'nemo', site_name: 'Richelieu Rock', expires_at: '2026-09-27T00:00:00Z', answered: null },
      },
    });
    const found = await lookUpCode(client, 'abcde fghjk');
    expect(calls).toEqual([['preview_verification', { code: 'ABCDE-FGHJK' }]]);
    expect(found).toEqual({
      outcome: 'ok',
      preview: {
        sightingId: 's-1', speciesId: 'whale-shark', siteId: 'richelieu-rock', siteName: 'Richelieu Rock', sightedOn: '2026-09-20',
        notes: 'At the safety stop', photoUrl: undefined, ownerId: 'owner-1', owner: 'nemo',
        expiresAt: '2026-09-27T00:00:00Z', answered: null,
      },
    });
  });

  it.each(['invalid_code', 'expired', 'rate_limited', 'own_sighting'] as const)('reports %s without a sighting', async (result) => {
    const { client } = rpcClient({ preview_verification: { data: { result } } });
    await expect(lookUpCode(client, 'ABCDE-FGHJK')).resolves.toEqual({ outcome: result });
  });

  it('answers for the facts the verifier was shown', async () => {
    const { client, calls } = rpcClient({ attest: { data: { result: 'ok', status: 'confirmed' } } });
    const shown = { speciesId: 'whale-shark', siteId: 'richelieu-rock', sightedOn: '2026-09-20' };
    await expect(answerCode(client, 'abcde-fghjk', 'saw_it', 'instructor', shown)).resolves.toEqual({ outcome: 'ok', status: 'confirmed' });
    expect(calls).toEqual([['attest', {
      code: 'ABCDE-FGHJK', decision: 'saw_it', verifier_role: 'instructor',
      expected_species: 'whale-shark', expected_site: 'richelieu-rock', expected_date: '2026-09-20',
    }]]);
  });

  it.each(['changed', 'already_answered', 'expired'] as const)('passes %s back', async (result) => {
    const { client } = rpcClient({ attest: { data: { result } } });
    const shown = { speciesId: 'whale-shark', siteId: 'richelieu-rock', sightedOn: '2026-09-20' };
    await expect(answerCode(client, 'ABCDE-FGHJK', 'did_not_see', 'buddy', shown)).resolves.toMatchObject({ outcome: result });
  });
});

describe("the owner's summary", () => {
  it('lists codes and answers, with names', async () => {
    const rows: Record<string, unknown[]> = {
      verification_requests: [{ id: 'req-1', expires_at: '2026-10-06T10:00:00+00:00', status: 'open', uses: 1, max_uses: 3, created_at: '2026-09-29T10:00:00+00:00' }],
      attestations: [
        { role: 'buddy', decision: 'saw_it', created_at: '2026-09-29T11:00:00+00:00', profiles: { username: 'nemo' } },
        { role: 'instructor', decision: 'did_not_see', created_at: '2026-09-29T10:30:00+00:00', profiles: null },
      ],
    };
    const filters: unknown[] = [];
    const client = {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: (column: string, value: string) => { filters.push([table, column, value]); return query; },
          order: () => Promise.resolve({ data: rows[table], error: null }),
        };
        return query;
      },
    } as unknown as SupabaseClient;

    await expect(verificationSummary(client, 's-1')).resolves.toEqual({
      requests: [{ id: 'req-1', expiresAt: '2026-10-06T10:00:00.000Z', status: 'open', uses: 1, maxUses: 3, createdAt: '2026-09-29T10:00:00.000Z' }],
      answers: [
        { verifier: 'nemo', role: 'buddy', decision: 'saw_it', at: '2026-09-29T11:00:00.000Z' },
        { verifier: 'a diver', role: 'instructor', decision: 'did_not_see', at: '2026-09-29T10:30:00.000Z' },
      ],
    });
    expect(filters).toEqual([['verification_requests', 'sighting_id', 's-1'], ['attestations', 'sighting_id', 's-1']]);
  });

  it('knows which codes still work', () => {
    const now = Date.parse('2026-09-29T12:00:00Z');
    const code = (over: Partial<RequestInfo>): RequestInfo => ({
      id: 'r', expiresAt: '2026-10-06T12:00:00Z', status: 'open', uses: 0, maxUses: 3, createdAt: '2026-09-29T11:00:00Z', ...over,
    });
    expect(usable(code({}), now)).toBe(true);
    expect(usable(code({ expiresAt: '2026-09-29T11:59:59Z' }), now)).toBe(false);
    expect(usable(code({ uses: 3 }), now)).toBe(false);
    expect(usable(code({ status: 'revoked' }), now)).toBe(false);
    expect(usable(code({ status: 'used' }), now)).toBe(false);
  });

  it('shares the code with a way to open it', () => {
    const message = shareMessage('Whale Shark', 'ABCDE-FGHJK', '2026-10-06T10:00:00Z');
    expect(message).toContain('Whale Shark');
    expect(message).toContain('ABCDE-FGHJK');
    expect(message).toContain('scubago://verify?code=ABCDE-FGHJK');
  });
});
