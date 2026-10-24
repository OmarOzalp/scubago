import { describe, expect, it } from '@jest/globals';

import { describeCoordinates, readCoordinates } from '@/lib/coordinates';

describe('coordinates as a diver pastes them', () => {
  it('reads what a maps app copies: latitude, a comma, longitude', () => {
    expect(readCoordinates('7.81, 98.54')).toEqual({ lat: 7.81, lng: 98.54 });
    expect(readCoordinates('7.812345,98.541234')).toEqual({ lat: 7.812345, lng: 98.541234 });
    expect(readCoordinates('  -0.5917, 130.4932  ')).toEqual({ lat: -0.5917, lng: 130.4932 });
    expect(readCoordinates('-16.92, -145.61')).toEqual({ lat: -16.92, lng: -145.61 });
    expect(readCoordinates('+7.81; +98.54')).toEqual({ lat: 7.81, lng: 98.54 });
  });

  it('takes a space between the numbers, and the minus sign a phone keyboard or a web page gives', () => {
    expect(readCoordinates('7.81 98.54')).toEqual({ lat: 7.81, lng: 98.54 });
    expect(readCoordinates('−0.59, −130.49')).toEqual({ lat: -0.59, lng: -130.49 });
  });

  it('takes degree signs and hemisphere letters, in either order', () => {
    expect(readCoordinates('7.81° N, 98.54° E')).toEqual({ lat: 7.81, lng: 98.54 });
    expect(readCoordinates('7.81°S, 145.61°W')).toEqual({ lat: -7.81, lng: -145.61 });
    expect(readCoordinates('N 7.81 E 98.54')).toEqual({ lat: 7.81, lng: 98.54 });
    expect(readCoordinates('s 7.81, w 145.61')).toEqual({ lat: -7.81, lng: -145.61 });
    // Letters say which is which.
    expect(readCoordinates('98.54 E, 7.81 N')).toEqual({ lat: 7.81, lng: 98.54 });
  });

  it('says what is wrong when it is not two numbers', () => {
    expect(readCoordinates('')).toEqual({ problem: 'Add the coordinates, like 7.81, 98.54.' });
    expect(readCoordinates('   ')).toEqual({ problem: 'Add the coordinates, like 7.81, 98.54.' });
    for (const typed of ['7.81', 'Shark Point', '7.81, 98.54, 12', '7.8198.54', '7.81, east', '7°48\'41"N 98°32\'E']) {
      expect([typed, readCoordinates(typed).problem]).toEqual([typed, 'Write the coordinates as two numbers, latitude first, like 7.81, 98.54.']);
    }
  });

  it('says when a number is out of range, and when the letters are the wrong way', () => {
    expect(readCoordinates('98.54, 7.81').problem).toMatch(/latitude has to be between -90 and 90/);
    expect(readCoordinates('7.81, 198.54').problem).toBe('The longitude has to be between -180 and 180.');
    // Both lettered, so the letters decide: 98.54 N is no latitude.
    expect(readCoordinates('7.81 E, 98.54 N').problem).toMatch(/latitude has to be between -90 and 90/);
    expect(readCoordinates('7.81 E, 98.54').problem).toMatch(/first number is the latitude/);
    expect(readCoordinates('7.81, 98.54 N').problem).toMatch(/second number is the longitude/);
  });

  it('says it back in words, so a missed minus sign shows', () => {
    expect(describeCoordinates({ lat: 7.81, lng: 98.54 })).toBe('7.81° N, 98.54° E');
    expect(describeCoordinates({ lat: -0.59, lng: -130.49 })).toBe('0.59° S, 130.49° W');
  });
});
