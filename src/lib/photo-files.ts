import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/** Where the app keeps photos until they've reached the server (safe from cache clean-ups). */
const FOLDER = 'sighting-photos';

function keptFolder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

/**
 * Keep a copy of a picked photo in the app's documents folder. The picker leaves it in a cache the
 * system may clear, and a sighting logged offline can wait days for a connection. Returns the
 * copy's URI, or the original if copying isn't possible (web, or an error).
 */
export async function keepPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return uri;
  try {
    const folder = keptFolder();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const source = new File(uri);
    const copy = new File(folder, source.name);
    if (!copy.exists) await source.copy(copy);
    return copy.uri;
  } catch (e) {
    console.warn('could not keep a copy of the photo; using the original', e);
    return uri;
  }
}

/** Delete a kept copy once the server has the photo (or the sighting is gone). Best-effort. */
export function discardKeptPhoto(uri: string): void {
  if (Platform.OS === 'web' || !uri.includes(`/${FOLDER}/`)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('could not delete a kept photo', e);
  }
}
