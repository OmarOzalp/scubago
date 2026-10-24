import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Visibility } from '@/lib/types';

/** A full privacy choice, as the logging flow holds it. */
export interface PrivacySettings {
  visibility: Visibility;
  notesPrivate: boolean;
  photoPrivate: boolean;
}

/**
 * Until the diver chooses otherwise: the sighting and its photo are shared (that's what the map and
 * a photo's credibility are for), and notes, which can be personal, stay with the diver.
 */
export const DEFAULT_PRIVACY: PrivacySettings = { visibility: 'public', notesPrivate: true, photoPrivate: false };

const KEY = 'scubago.privacyChoice';

/** The choice made for the last log, so the next one starts there. Best effort: storage failures are ignored. */
export async function rememberPrivacyChoice(choice: PrivacySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Not remembering is fine.
  }
}

export async function lastPrivacyChoice(): Promise<PrivacySettings | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const { visibility, notesPrivate, photoPrivate } = JSON.parse(raw) as Partial<PrivacySettings>;
    if ((visibility !== 'public' && visibility !== 'private') || typeof notesPrivate !== 'boolean' || typeof photoPrivate !== 'boolean') {
      return null;
    }
    return { visibility, notesPrivate, photoPrivate };
  } catch {
    return null;
  }
}

function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The choice in a few words, for "Visible to: …": "Only me", "Everyone", or "Everyone, but not your
 * notes" when something stays private. A photo only counts where there can be one.
 */
export function privacySummary(value: PrivacySettings, { photo }: { photo: boolean }): string {
  if (value.visibility === 'private') return 'Only me';
  const kept: string[] = [];
  if (value.notesPrivate) kept.push('notes');
  if (photo && value.photoPrivate) kept.push('photo');
  return kept.length === 0 ? 'Everyone' : `Everyone, but not your ${list(kept)}`;
}

/** What the choice means, in one or two plain sentences. */
export function privacyExplanation(value: PrivacySettings, { photo, count = 1 }: { photo: boolean; count?: number }): string {
  const these = count > 1 ? 'these sightings' : 'this sighting';
  if (value.visibility === 'private') {
    return `Only you will see ${these}, ${count > 1 ? 'their' : 'its'} notes and ${photo ? 'photo' : 'any photo'}. ${count > 1 ? 'They still count' : 'It still counts'} towards your collection.`;
  }
  const shown: string[] = [];
  const kept: string[] = [];
  (value.notesPrivate ? kept : shown).push('your notes');
  if (photo) (value.photoPrivate ? kept : shown).push('your photo');
  const others = `Other divers see the species, site and date${shown.length ? `, plus ${list(shown)}` : ''}.`;
  if (kept.length === 0) return others;
  const plural = kept.length > 1 || kept[0] === 'your notes';
  return `${others} ${list(kept).replace(/^y/, 'Y')} ${plural ? 'are' : 'is'} only for you.`;
}
