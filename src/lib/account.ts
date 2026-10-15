import type { SupabaseClient } from '@supabase/supabase-js';

import { PRIVATE_PHOTO_BUCKET } from '@/lib/privacy';

const PHOTO_BUCKET = 'sighting-photos';
const PAGE = 100;

/** Remove everything in the user's folder of one bucket. */
async function emptyFolder(client: SupabaseClient, bucket: string, userId: string): Promise<void> {
  const photos = client.storage.from(bucket);
  // Photos live at <uid>/<file>. Removing shrinks the listing, so keep reading the first page.
  for (let round = 0; round < 1000; round++) {
    const { data, error } = await photos.list(userId, { limit: PAGE });
    if (error) {
      // No private bucket (the server hasn't had migration 0008): nothing private to remove.
      if (bucket === PRIVATE_PHOTO_BUCKET && /bucket not found/i.test(error.message)) return;
      throw new Error(`Could not list your photos: ${error.message}`);
    }
    const paths = (data ?? []).filter((item) => item.id !== null).map((item) => `${userId}/${item.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await photos.remove(paths);
    if (removeError) throw new Error(`Could not delete your photos: ${removeError.message}`);
  }
}

/**
 * Delete the signed-in user's account and everything ScubaGo holds for them on the server: their
 * photos first, shared and private (through the Storage API, which is the only way to delete stored
 * files), then the account itself (public.delete_own_account, migration 0004), which takes their
 * profile and sightings, with their private notes, with it. Dive sites they added stay, without their name. If the photos cannot all be
 * removed, the account is left untouched so the user can simply try again.
 */
export async function deleteAccount(client: SupabaseClient, userId: string): Promise<void> {
  await emptyFolder(client, PHOTO_BUCKET, userId);
  await emptyFolder(client, PRIVATE_PHOTO_BUCKET, userId);

  const { error } = await client.rpc('delete_own_account');
  if (error) {
    // PostgREST's "function not found": the server hasn't had migration 0004 yet.
    if (error.code === 'PGRST202') throw new Error('Account deletion is not set up on the server yet. Please try again later.');
    throw new Error(error.message);
  }
  // The session died with the account; clear it from this device without calling the server.
  await client.auth.signOut({ scope: 'local' });
}
