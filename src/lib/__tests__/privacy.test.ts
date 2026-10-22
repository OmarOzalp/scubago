import { describe, expect, it } from '@jest/globals';

import {
  asSeenBy,
  isLocalPhoto,
  keepsSomethingPrivate,
  privacySummary,
  privatePhotoPath,
  sharesNotes,
  sharesPhoto,
} from '@/lib/privacy';
import { privacyChoice } from '@/lib/sighting-edit';
import { privateDetailsRow, remoteRowToSighting, sightingFacts, sightingToRemoteRow, storedPhoto, withPrivateDetails } from '@/lib/sync';
import type { Sighting } from '@/lib/types';

const UID = 'uid-1';
const PUBLIC_URL = `https://x.supabase.co/storage/v1/object/public/sighting-photos/${UID}/s-1-a.jpg`;

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: 's-1', userId: UID, username: 'me', speciesId: 'reef-manta', siteId: 'blue-corner', sightedOn: '2026-09-01',
    isDemo: false, synced: false, createdAt: '2026-09-01T00:00:00.000Z', ...overrides,
  };
}

describe('who can see what', () => {
  it('a private sighting keeps everything private; a shared one shares what was not kept back', () => {
    expect(sharesNotes({})).toBe(true);
    expect(sharesPhoto({ visibility: 'public' })).toBe(true);
    expect(sharesNotes({ visibility: 'public', notesPrivate: true })).toBe(false);
    expect(sharesPhoto({ visibility: 'public', notesPrivate: true })).toBe(true);
    expect(sharesNotes({ visibility: 'private' })).toBe(false);
    expect(sharesPhoto({ visibility: 'private', photoPrivate: false })).toBe(false);
  });

  it('only counts private notes or a private photo that exist', () => {
    expect(keepsSomethingPrivate(sighting({ notesPrivate: true }))).toBe(false);
    expect(keepsSomethingPrivate(sighting({ notesPrivate: true, notes: 'x' }))).toBe(true);
    expect(keepsSomethingPrivate(sighting({ visibility: 'private' }))).toBe(true);
  });

  it('sums the choice up in a few words', () => {
    expect(privacySummary(sighting())).toBe('Everyone');
    expect(privacySummary(sighting({ visibility: 'private', notes: 'x' }))).toBe('Only you');
    expect(privacySummary(sighting({ notes: 'x', notesPrivate: true }))).toBe('Everyone, except your notes');
    expect(privacySummary(sighting({ notes: 'x', notesPrivate: true, photoUri: 'file:///a.jpg', photoPrivate: true })))
      .toBe('Everyone, except your notes and photo');
    // Nothing to keep back: a remembered choice for notes that were never written doesn't count.
    expect(privacySummary(sighting({ notesPrivate: true }))).toBe('Everyone');
  });
});

describe('the public row', () => {
  it('never carries notes or a photo the diver keeps private, whatever it is given', () => {
    const row = sightingToRemoteRow(sighting({ notes: 'secret', notesPrivate: true, photoUri: PUBLIC_URL, photoPrivate: true }), PUBLIC_URL);
    expect(row).toMatchObject({ notes: null, photo_url: null });
    const hidden = sightingToRemoteRow(sighting({ visibility: 'private', notes: 'secret', photoUri: PUBLIC_URL }), PUBLIC_URL);
    expect(hidden).toMatchObject({ notes: null, photo_url: null, visibility: 'private' });
    expect(sightingFacts(hidden)).toMatchObject({ notes: null, photo_url: null, visibility: 'private' });
  });

  it('never points at a private photo', () => {
    const row = sightingToRemoteRow(sighting({ photoUri: `private:${UID}/s-1-a.jpg` }), `private:${UID}/s-1-a.jpg`);
    expect(row.photo_url).toBeNull();
  });

  it('leaves visibility out for sightings from before privacy, so older servers keep syncing them', () => {
    expect(sightingToRemoteRow(sighting({ notes: 'shared' }), null)).not.toHaveProperty('visibility');
    expect(sightingToRemoteRow(sighting({ notes: 'shared' }), null).notes).toBe('shared');
  });
});

describe('private details', () => {
  it('holds only what the public row leaves out, and nothing when nothing is kept back', () => {
    expect(privateDetailsRow(sighting({ notes: 'shared' }), PUBLIC_URL)).toBeNull();
    expect(privateDetailsRow(sighting({ notes: 'mine', notesPrivate: true }), null))
      .toEqual({ sighting_id: 's-1', user_id: UID, notes: 'mine', photo_path: null });
    expect(privateDetailsRow(sighting({ visibility: 'private', photoUri: 'x' }), `private:${UID}/s-1-a.jpg`))
      .toEqual({ sighting_id: 's-1', user_id: UID, notes: null, photo_path: `${UID}/s-1-a.jpg` });
  });

  it('come back on a pull, and stay private', () => {
    const row = {
      id: 's-1', user_id: UID, species_id: 'reef-manta', site_id: 'blue-corner', sighted_on: '2026-09-01', notes: null,
      photo_url: null, created_at: '2026-09-01T00:00:00Z', profiles: { username: 'me' }, visibility: 'public' as const,
    };
    const pulled = remoteRowToSighting(row);
    const restored = withPrivateDetails(pulled, { sighting_id: 's-1', user_id: UID, notes: 'mine', photo_path: `${UID}/s-1-a.jpg` });
    expect(restored).toMatchObject({
      visibility: 'public', notes: 'mine', notesPrivate: true, photoUri: `private:${UID}/s-1-a.jpg`, photoPrivate: true,
    });
    // Notes and a photo on the public row were shared.
    expect(withPrivateDetails(remoteRowToSighting({ ...row, notes: 'look', photo_url: PUBLIC_URL }), undefined))
      .toMatchObject({ notesPrivate: false, photoPrivate: false });
    // Neither kept back nor shared: the pull can't say what the diver chose, so it leaves the choice out.
    const unsaid = withPrivateDetails(pulled, undefined);
    expect(unsaid.notesPrivate).toBeUndefined();
    expect(unsaid.photoPrivate).toBeUndefined();
  });
});

describe('what another diver sees on the same device', () => {
  it('nothing private: not the sighting, not its kept-back notes or photo', () => {
    const photo = 'file:///kept/a.jpg';
    expect(asSeenBy(sighting({ visibility: 'private', notes: 'n' }), UID)).toMatchObject({ notes: 'n' });
    expect(asSeenBy(sighting({ visibility: 'private', notes: 'n' }), 'uid-2')).toBeNull();
    const kept = asSeenBy(sighting({ visibility: 'public', notes: 'n', notesPrivate: true, photoUri: photo, photoPrivate: true }), 'uid-2');
    expect(kept).toMatchObject({ speciesId: 'reef-manta', notes: undefined, photoUri: undefined });
    expect(asSeenBy(sighting({ visibility: 'public', notes: 'n', photoUri: photo, photoPrivate: true }), 'uid-2'))
      .toMatchObject({ notes: 'n', photoUri: undefined });
    const shared = sighting({ visibility: 'public', notes: 'n', photoUri: PUBLIC_URL });
    expect(asSeenBy(shared, 'uid-2')).toBe(shared);
  });
});

describe('private photos', () => {
  it('are only ever the owner\'s own files', () => {
    expect(privatePhotoPath(`private:${UID}/s-1-a.jpg`, UID)).toBe(`${UID}/s-1-a.jpg`);
    expect(privatePhotoPath('private:uid-2/s-1-a.jpg', UID)).toBeNull();
    expect(privatePhotoPath(`private:${UID}/nested/s-1.jpg`, UID)).toBeNull();
    expect(privatePhotoPath(`private:${UID}/.hidden`, UID)).toBeNull();
    expect(privatePhotoPath(PUBLIC_URL, UID)).toBeNull();
  });

  it('are told apart from public ones and from files still on the device', () => {
    expect(storedPhoto(`private:${UID}/a.jpg`, UID)).toEqual({ bucket: 'sighting-photos-private', path: `${UID}/a.jpg` });
    expect(storedPhoto(PUBLIC_URL, UID)).toEqual({ bucket: 'sighting-photos', path: `${UID}/s-1-a.jpg` });
    expect(storedPhoto('file:///a.jpg', UID)).toBeNull();
    expect(isLocalPhoto('file:///a.jpg')).toBe(true);
    expect(isLocalPhoto('blob:http://localhost/1')).toBe(true);
    expect(isLocalPhoto(`private:${UID}/a.jpg`)).toBe(false);
    expect(isLocalPhoto(PUBLIC_URL)).toBe(false);
  });
});

describe('editing the choice', () => {
  it('keeps what an edit leaves out, and drops false flags', () => {
    expect(privacyChoice({}, { visibility: 'private', notesPrivate: true })).toEqual({ visibility: 'private', notesPrivate: true, photoPrivate: undefined });
    expect(privacyChoice({ visibility: 'public', notesPrivate: false }, { visibility: 'private', notesPrivate: true }))
      .toEqual({ visibility: 'public', notesPrivate: undefined, photoPrivate: undefined });
  });
});
