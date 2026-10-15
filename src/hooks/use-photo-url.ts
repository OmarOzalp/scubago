import { useEffect, useState } from 'react';

import { isPrivatePhotoRef, PRIVATE_PHOTO_BUCKET, privateRefPath } from '@/lib/privacy';
import { getSupabase } from '@/lib/supabase';

/** How long a link to a private photo works. The screen asks for a new one when it opens again. */
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Something an <Image> can show for a sighting's photo. Files on the device and public URLs are used
 * as they are; a private photo (`private:<uid>/<file>`) has no public address, so this asks the
 * server for a short-lived signed link, which only its owner can get. Undefined while that link is
 * on its way, or if it can't be had (offline, signed out).
 */
export function usePhotoUrl(uri: string | undefined): string | undefined {
  const path = isPrivatePhotoRef(uri) ? privateRefPath(uri) : null;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    const client = getSupabase();
    if (!path || !client) return;
    let live = true;
    void client.storage
      .from(PRIVATE_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data }) => {
        if (live && data) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return uri;
  return signed?.path === path ? signed.url : undefined;
}
