/**
 * A place's coordinates as a diver pastes them: what a maps app copies for a spot. Two numbers,
 * latitude first ("7.81, 98.54"), with a minus sign for south and west or the letters instead
 * ("7.81° N, 98.54° E", "N 7.81 E 98.54"). Decimal degrees only.
 */

// A number with its hemisphere letter before or after it (the degree sign is dropped before matching).
const PART = String.raw`(?:([NSEW])\s*)?(\d+(?:\.\d+)?)\s*([NSEW])?`;
const PAIR = new RegExp(`^([-+]?)${PART}(?:\\s*[,;]\\s*|\\s+)([-+]?)${PART}$`, 'i');

type Read = { lat: number; lng: number; problem?: undefined } | { problem: string; lat?: undefined; lng?: undefined };

/** The latitude and longitude in what was typed, or what is wrong with it, in words for the diver. */
export function readCoordinates(text: string): Read {
  const typed = text.replace(/[−–]/g, '-').replace(/[°º]/g, ' ').trim();
  if (!typed) return { problem: 'Add the coordinates, like 7.81, 98.54.' };
  const match = PAIR.exec(typed);
  if (!match) return { problem: 'Write the coordinates as two numbers, latitude first, like 7.81, 98.54.' };
  const [, minus1, before1, value1, after1, minus2, before2, value2, after2] = match;
  const first = { letter: (before1 ?? after1)?.toUpperCase(), value: Number(value1), negative: minus1 === '-' };
  const second = { letter: (before2 ?? after2)?.toUpperCase(), value: Number(value2), negative: minus2 === '-' };
  // Letters say which is which, even the wrong way round ("98.54 E, 7.81 N"); without them, latitude comes first.
  const [lat, lng] = [first, second].every((p) => p.letter) && 'EW'.includes(first.letter!) ? [second, first] : [first, second];
  if (lat.letter && !'NS'.includes(lat.letter)) return { problem: 'The first number is the latitude: north or south, not east or west.' };
  if (lng.letter && !'EW'.includes(lng.letter)) return { problem: 'The second number is the longitude: east or west, not north or south.' };
  const signed = (p: typeof first, negativeLetters: string) => (p.negative || (p.letter !== undefined && negativeLetters.includes(p.letter)) ? -p.value : p.value);
  const latitude = signed(lat, 'S');
  const longitude = signed(lng, 'W');
  if (Math.abs(latitude) > 90) return { problem: 'The latitude has to be between -90 and 90. Is it the other way round? Latitude comes first.' };
  if (Math.abs(longitude) > 180) return { problem: 'The longitude has to be between -180 and 180.' };
  return { lat: latitude, lng: longitude };
}

/** "7.81° N, 98.54° E": what was read, said back so a missed minus sign shows. */
export function describeCoordinates({ lat, lng }: { lat: number; lng: number }): string {
  return `${Math.abs(lat)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lng)}° ${lng < 0 ? 'W' : 'E'}`;
}
