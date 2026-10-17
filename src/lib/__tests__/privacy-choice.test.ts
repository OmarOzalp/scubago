import { describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_PRIVACY, lastPrivacyChoice, privacyExplanation, rememberPrivacyChoice } from '@/lib/privacy-choice';

describe('privacy choice', () => {
  it('shares the sighting and photo, and keeps notes with the diver, until they choose otherwise', () => {
    expect(DEFAULT_PRIVACY).toEqual({ visibility: 'public', notesPrivate: true, photoPrivate: false });
  });

  it('remembers the last choice, and ignores anything it does not recognise', async () => {
    await rememberPrivacyChoice({ visibility: 'private', notesPrivate: false, photoPrivate: true });
    expect(await lastPrivacyChoice()).toEqual({ visibility: 'private', notesPrivate: false, photoPrivate: true });
    await AsyncStorage.setItem('scubago.privacyChoice', JSON.stringify({ visibility: 'friends', notesPrivate: true, photoPrivate: true }));
    expect(await lastPrivacyChoice()).toBeNull();
    await AsyncStorage.setItem('scubago.privacyChoice', 'not json');
    expect(await lastPrivacyChoice()).toBeNull();
  });

  it('says plainly what other divers will see', () => {
    expect(privacyExplanation(DEFAULT_PRIVACY, { photo: true }))
      .toBe('Other divers see the species, site and date, plus your photo. Your notes are only for you.');
    expect(privacyExplanation({ visibility: 'public', notesPrivate: false, photoPrivate: false }, { photo: true }))
      .toBe('Other divers see the species, site and date, plus your notes and your photo.');
    expect(privacyExplanation({ visibility: 'public', notesPrivate: true, photoPrivate: true }, { photo: true }))
      .toBe('Other divers see the species, site and date. Your notes and your photo are only for you.');
    expect(privacyExplanation({ visibility: 'public', notesPrivate: false, photoPrivate: true }, { photo: true }))
      .toBe('Other divers see the species, site and date, plus your notes. Your photo is only for you.');
    expect(privacyExplanation({ visibility: 'public', notesPrivate: false, photoPrivate: true }, { photo: false }))
      .toBe('Other divers see the species, site and date, plus your notes.');
    expect(privacyExplanation({ ...DEFAULT_PRIVACY, visibility: 'private' }, { photo: true }))
      .toBe('Only you will see this sighting, its notes and photo. It still counts towards your collection.');
    expect(privacyExplanation({ ...DEFAULT_PRIVACY, visibility: 'private' }, { photo: false, count: 3 }))
      .toBe('Only you will see these sightings, their notes and any photo. They still count towards your collection.');
  });
});
