/**
 * Inflate (RFC 1951, raw deflate), written for the app: no native zlib in Expo Go and none in Hermes, so the packs of numbers shipped with the
 * app (ocean-pack.ts) are read back by this. Table driven and with no allocation in its loops, as a phone's interpreter wants; `size` is the
 * length the bytes inflate to (the pack's header says), which sizes the result once. Throws on anything that is not a deflate stream of that size.
 */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A decoding table for canonical codes of these lengths: indexed by the next `bits` bits (first bit lowest), each entry `symbol << 4 | length`. */
type Table = { bits: number; entries: Uint16Array };

function buildTable(lengths: ArrayLike<number>, count: number): Table {
  let bits = 0;
  const perLength = new Uint16Array(16);
  for (let s = 0; s < count; s++) { perLength[lengths[s]]++; if (lengths[s] > bits) bits = lengths[s]; }
  perLength[0] = 0;
  if (bits === 0) return { bits: 1, entries: new Uint16Array(2) };
  // The first code of each length, as canonical codes count up.
  const first = new Uint16Array(16);
  for (let l = 1, code = 0; l <= 15; l++) { code = (code + perLength[l - 1]) << 1; first[l] = code; }
  const entries = new Uint16Array(1 << bits);
  for (let s = 0; s < count; s++) {
    const length = lengths[s];
    if (!length) continue;
    let code = first[length]++, reversed = 0;
    // (codes are sent most significant bit first, read here least significant first)
    for (let i = 0; i < length; i++) { reversed = (reversed << 1) | (code & 1); code >>= 1; }
    const entry = (s << 4) | length;
    for (let at = reversed; at < entries.length; at += 1 << length) entries[at] = entry;
  }
  return { bits, entries };
}

let fixedTables: { literals: Table; distances: Table } | undefined;
function fixed() {
  if (!fixedTables) {
    const lengths = new Uint8Array(288);
    lengths.fill(8, 0, 144); lengths.fill(9, 144, 256); lengths.fill(7, 256, 280); lengths.fill(8, 280, 288);
    fixedTables = { literals: buildTable(lengths, 288), distances: buildTable(new Uint8Array(30).fill(5), 30) };
  }
  return fixedTables;
}

export function inflate(source: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let pos = 0, buffer = 0, held = 0, o = 0, last = 0;
  while (!last) {
    while (held < 3) { if (pos >= source.length) throw new Error('inflate: ran out of bytes'); buffer |= source[pos++] << held; held += 8; }
    last = buffer & 1;
    const type = (buffer >>> 1) & 3;
    buffer >>>= 3; held -= 3;
    if (type === 0) {
      // Stored: to a byte boundary (whole bytes read ahead are given back), a length and its complement, then the bytes themselves.
      pos -= held >> 3; buffer = 0; held = 0;
      if (pos + 4 > source.length) throw new Error('inflate: ran out of bytes');
      const length = source[pos] | (source[pos + 1] << 8);
      if ((length ^ 0xffff) !== (source[pos + 2] | (source[pos + 3] << 8))) throw new Error('inflate: bad stored block');
      pos += 4;
      if (pos + length > source.length || o + length > size) throw new Error('inflate: stored block too long');
      out.set(source.subarray(pos, pos + length), o);
      pos += length; o += length;
      continue;
    }
    if (type === 3) throw new Error('inflate: bad block type');
    let literals: Table, distances: Table;
    if (type === 1) ({ literals, distances } = fixed());
    else {
      while (held < 14) { if (pos >= source.length) throw new Error('inflate: ran out of bytes'); buffer |= source[pos++] << held; held += 8; }
      const nLiterals = (buffer & 31) + 257, nDistances = ((buffer >>> 5) & 31) + 1, nCodes = ((buffer >>> 10) & 15) + 4;
      buffer >>>= 14; held -= 14;
      const codeLengths = new Uint8Array(19);
      for (let i = 0; i < nCodes; i++) {
        while (held < 3) { if (pos >= source.length) throw new Error('inflate: ran out of bytes'); buffer |= source[pos++] << held; held += 8; }
        codeLengths[CODE_LENGTH_ORDER[i]] = buffer & 7;
        buffer >>>= 3; held -= 3;
      }
      const lengthTable = buildTable(codeLengths, 19), lengths = new Uint8Array(nLiterals + nDistances);
      for (let i = 0; i < lengths.length;) {
        while (held < lengthTable.bits + 7) { buffer |= (pos < source.length ? source[pos] : 0) << held; pos++; held += 8; }
        const entry = lengthTable.entries[buffer & ((1 << lengthTable.bits) - 1)], used = entry & 15, symbol = entry >> 4;
        if (!used) throw new Error('inflate: bad code length code');
        buffer >>>= used; held -= used;
        if (symbol < 16) { lengths[i++] = symbol; continue; }
        let repeat: number, value = 0;
        if (symbol === 16) { if (!i) throw new Error('inflate: nothing to repeat'); value = lengths[i - 1]; repeat = 3 + (buffer & 3); buffer >>>= 2; held -= 2; }
        else if (symbol === 17) { repeat = 3 + (buffer & 7); buffer >>>= 3; held -= 3; }
        else { repeat = 11 + (buffer & 127); buffer >>>= 7; held -= 7; }
        if (i + repeat > lengths.length) throw new Error('inflate: too many code lengths');
        while (repeat--) lengths[i++] = value;
      }
      literals = buildTable(lengths.subarray(0, nLiterals), nLiterals);
      distances = buildTable(lengths.subarray(nLiterals), nDistances);
    }
    const literalBits = literals.bits, literalEntries = literals.entries, distanceBits = distances.bits, distanceEntries = distances.entries;
    const literalMask = (1 << literalBits) - 1, distanceMask = (1 << distanceBits) - 1;
    for (;;) {
      // (at most 15 bits of code and 5 of extra; then 15 and 13: refilled before each, so that no more than 32 bits are ever held)
      while (held < 20) { buffer |= (pos < source.length ? source[pos] : 0) << held; pos++; held += 8; }
      const entry = literalEntries[buffer & literalMask], used = entry & 15;
      if (!used) throw new Error('inflate: bad code');
      buffer >>>= used; held -= used;
      const symbol = entry >> 4;
      if (symbol < 256) {
        if (o >= size) throw new Error('inflate: longer than said');
        out[o++] = symbol;
        continue;
      }
      if (symbol === 256) break;
      const lengthSymbol = symbol - 257;
      if (lengthSymbol >= 29) throw new Error('inflate: bad length');
      const extraBits = LENGTH_EXTRA[lengthSymbol];
      const length = LENGTH_BASE[lengthSymbol] + (buffer & ((1 << extraBits) - 1));
      buffer >>>= extraBits; held -= extraBits;
      while (held < 15) { buffer |= (pos < source.length ? source[pos] : 0) << held; pos++; held += 8; }
      const distanceEntry = distanceEntries[buffer & distanceMask], distanceUsed = distanceEntry & 15;
      if (!distanceUsed) throw new Error('inflate: bad distance code');
      buffer >>>= distanceUsed; held -= distanceUsed;
      const distanceSymbol = distanceEntry >> 4;
      if (distanceSymbol >= 30) throw new Error('inflate: bad distance');
      const distanceExtra = DISTANCE_EXTRA[distanceSymbol];
      while (held < distanceExtra) { buffer |= (pos < source.length ? source[pos] : 0) << held; pos++; held += 8; }
      const distance = DISTANCE_BASE[distanceSymbol] + (buffer & ((1 << distanceExtra) - 1));
      buffer >>>= distanceExtra; held -= distanceExtra;
      if (distance > o || o + length > size) throw new Error('inflate: bad match');
      // (a match may overlap what it copies: byte by byte)
      for (let end = o + length, from = o - distance; o < end;) out[o++] = out[from++];
    }
    if (pos - (held >> 3) > source.length) throw new Error('inflate: ran out of bytes');
  }
  if (o !== size) throw new Error('inflate: shorter than said');
  return out;
}
