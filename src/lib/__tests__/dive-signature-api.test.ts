import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { askBuddyToSign, isDiveCode, lookUpDiveCode, signShareMessage, signWithCode, withdrawSignCode } from '@/lib/dive-signature-api';

type Reply = { data?: unknown; error?: unknown };

/** A client whose RPCs answer from `replies` (by function name) and record what they were sent. */
function rpcClient(replies: Record<string, Reply>) {
  const calls: [string, Record<string, unknown>][] = [];
  const client = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      const r = replies[fn];
      return { data: r?.data ?? null, error: r?.error ?? null };
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('signing a page from a buddy’s phone', () => {
  it('tells a page’s code from a sighting’s by its D', () => {
    expect(isDiveCode('d7q2m-x9vt4')).toBe(true);
    expect(isDiveCode('7Q2MX-9VT4K')).toBe(false);
    expect(isDiveCode('D7Q2M')).toBe(false);
  });

  it('makes and withdraws a code for a page', async () => {
    const { client, calls } = rpcClient({
      create_dive_signature_request: { data: { id: 'r1', code: 'DABCD-EFGHJ', expires_at: '2026-10-23T08:00:00+00:00', max_uses: 3 } },
    });
    expect(await askBuddyToSign(client, 'd-49')).toEqual({ id: 'r1', code: 'DABCD-EFGHJ', expiresAt: '2026-10-23T08:00:00.000Z', maxUses: 3 });
    await withdrawSignCode(client, 'r1');
    expect(calls).toEqual([
      ['create_dive_signature_request', { target: 'd-49' }],
      ['revoke_dive_signature_request', { request: 'r1' }],
    ]);
  });

  it('shows the buddy the page before they sign', async () => {
    const { client, calls } = rpcClient({
      preview_dive_signature: {
        data: {
          result: 'ok', owner: 'alice', site_name: 'Blue Corner', expires_at: '2026-10-23T08:00:00+00:00', signed: false,
          dive: { id: 'd-49', number: 49, site_id: 'blue-corner', dived_on: '2026-10-12', time_in: '09:30:00', bottom_time_min: 52, max_depth_m: 28.5, buddy_name: 'Bob', centre_name: null },
        },
      },
    });
    const found = await lookUpDiveCode(client, 'dabcd efghj');
    expect(calls[0]).toEqual(['preview_dive_signature', { code: 'DABCD-EFGHJ' }]);
    expect(found).toEqual({
      outcome: 'ok',
      preview: {
        diveId: 'd-49', number: 49, siteId: 'blue-corner', siteName: 'Blue Corner', divedOn: '2026-10-12', timeIn: '09:30', bottomTimeMin: 52,
        maxDepthM: 28.5, buddyName: 'Bob', centreName: undefined, owner: 'alice', expiresAt: '2026-10-23T08:00:00+00:00', signed: false,
      },
    });
  });

  it('passes on why a code didn’t work', async () => {
    const { client } = rpcClient({ preview_dive_signature: { data: { result: 'own_dive' } } });
    expect(await lookUpDiveCode(client, 'DABCD-EFGHJ')).toEqual({ outcome: 'own_dive' });
  });

  it('signs what the buddy was shown, and never sends a signature the app wouldn’t draw', async () => {
    const { client, calls } = rpcClient({ sign_dive: { data: { result: 'ok' } } });
    const shown = { number: 49, siteId: 'blue-corner', divedOn: '2026-10-12' };
    expect(await signWithCode(client, 'DABCD-EFGHJ', { name: ' Bob ', role: 'buddy', svg: 'M1,1L20,20' }, shown)).toBe('ok');
    await signWithCode(client, 'DABCD-EFGHJ', { name: 'Bob', role: 'guide', svg: '<svg onload=x>' }, shown);
    expect(calls[0]).toEqual(['sign_dive', {
      code: 'DABCD-EFGHJ', signer_name: 'Bob', signer_role: 'buddy', signature: 'M1,1L20,20', expected_number: 49, expected_site: 'blue-corner', expected_date: '2026-10-12',
    }]);
    expect(calls[1][1].signature).toBeNull();
  });

  it('says plainly when the project hasn’t got the dive log yet', async () => {
    const { client } = rpcClient({ preview_dive_signature: { error: { code: 'PGRST202', message: 'Could not find the function' } } });
    await expect(lookUpDiveCode(client, 'DABCD-EFGHJ')).rejects.toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/Signing dives isn’t switched on/) });
  });

  it('the share message carries the page, the code and the link', () => {
    const message = signShareMessage(49, 'Blue Corner', 'DABCD-EFGHJ', '2026-10-23T08:00:00Z');
    expect(message).toMatch(/dive No\. 49 at Blue Corner/);
    expect(message).toMatch(/Logbook → Buddy code and enter DABCD-EFGHJ/);
    expect(message).toMatch(/scubago:\/\/verify\?code=DABCD-EFGHJ$/);
  });
});
