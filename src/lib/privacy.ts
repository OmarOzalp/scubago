import type { Sighting } from '@/lib/types';

/**
 * Who can see what (migration 0008). For each sighting the diver chooses whether everyone can see
 * it or only they can, and, for a shared sighting, whether its notes and its photo are shared too.
 *
 * What isn't shared never goes to the public row or the public bucket: private notes go to
 * sighting_details and private photos to the private bucket, which only their owner can read. A
 * private sighting keeps everything private, whatever was chosen for its notes and photo.
 */

export type PrivacyChoice = Pick<Sighting, 'visibility' | 'notesPrivate' | 'photoPrivate'>;

export const PRIVATE_PHOTO_BUCKET = 'sighting-photos-private';

/** A photo in the private bucket has no public URL; the app knows it as `private:<uid>/<file>`. */
const PRIVATE_REF = 'private:';

export function isPrivateSighting(s: PrivacyChoice): boolean {
  return s.visibility === 'private';
}

/** Everyone may read the notes: the sighting is shared and its notes weren't kept back. */
export function sharesNotes(s: PrivacyChoice): boolean {
  return !isPrivateSighting(s) && !s.notesPrivate;
}

/** Everyone may see the photo: the sighting is shared and its photo wasn't kept back. */
export function sharesPhoto(s: PrivacyChoice): boolean {
  return !isPrivateSighting(s) && !s.photoPrivate;
}

/** Part of this sighting is only for the diver (and so needs the server to have migration 0008). */
export function keepsSomethingPrivate(s: PrivacyChoice & Pick<Sighting, 'notes' | 'photoUri'>): boolean {
  return isPrivateSighting(s) || (!!s.notes && !sharesNotes(s)) || (!!s.photoUri && !sharesPhoto(s));
}

export function privatePhotoRef(path: string): string {
  return `${PRIVATE_REF}${path}`;
}

export function isPrivatePhotoRef(uri: string | undefined | null): uri is string {
  return !!uri && uri.startsWith(PRIVATE_REF);
}

/** The private-bucket path a private ref names (unchecked: the bucket itself lets only the owner read it). */
export function privateRefPath(ref: string): string {
  return ref.slice(PRIVATE_REF.length);
}

/**
 * The private-bucket path behind one of this user's private photos, or null for anything else: only
 * the owner's own files are ever read, moved or removed.
 */
export function privatePhotoPath(ref: string | undefined | null, userId: string): string | null {
  if (!isPrivatePhotoRef(ref)) return null;
  const path = ref.slice(PRIVATE_REF.length);
  const [folder, file, ...rest] = path.split('/');
  if (folder !== userId || !file || rest.length > 0 || file.startsWith('.')) return null;
  return path;
}

/** A photo that is still only on this device (a file, or a blob on the web): it hasn't been uploaded. */
export function isLocalPhoto(uri: string | undefined | null): uri is string {
  return !!uri && !uri.startsWith('http') && !isPrivatePhotoRef(uri);
}

/** What other divers see of a sighting, in a few words ("Everyone", "Only you", …). */
export function privacySummary(s: PrivacyChoice & Pick<Sighting, 'notes' | 'photoUri'>): string {
  if (isPrivateSighting(s)) return 'Only you';
  const kept = [s.notes && !sharesNotes(s) ? 'notes' : null, s.photoUri && !sharesPhoto(s) ? 'photo' : null].filter(Boolean);
  return kept.length === 0 ? 'Everyone' : `Everyone, except your ${kept.join(' and ')}`;
}

/** Why a private change can't sync: the server doesn't have migration 0008 yet. Nothing private was sent. */
export class PrivacyNotReadyError extends Error {
  constructor() {
    super('The server isn’t set up for private sightings yet (migration 0008). This change waits on this phone until it is.');
  }
}
