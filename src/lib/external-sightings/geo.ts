/** Small geography helpers: distance, and a search box around a site. */

const KM_PER_DEGREE_LAT = 111.32;
const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** A box in degrees. `west` can be below -180 or `east` above 180 when the box crosses the antimeridian. */
export interface GeoBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

/**
 * A box around a point, half a side of `radiusKm` each way. A degree of longitude shrinks with the
 * cosine of the latitude, so the east-west reach is scaled by it (clamped near the poles, where it
 * would blow up). The box holds the circle of the same radius and is about 27% larger in area.
 */
export function boxAround(lat: number, lng: number, radiusKm: number): GeoBox {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const dLng = Math.min(180, radiusKm / (KM_PER_DEGREE_LAT * Math.max(Math.cos(rad(lat)), 0.01)));
  return {
    south: Math.max(-90, lat - dLat),
    north: Math.min(90, lat + dLat),
    west: lng - dLng,
    east: lng + dLng,
  };
}

const round = (value: number) => String(Number(value.toFixed(4)));

function ring({ south, north, west, east }: GeoBox): string {
  const [w, e, s, n] = [round(west), round(east), round(south), round(north)];
  // Counter-clockwise, closed.
  return `(${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s})`;
}

/**
 * The box as WKT for OBIS: a POLYGON, or a MULTIPOLYGON of two boxes when it crosses the
 * antimeridian (longitude is wrapped into -180..180 on each side).
 */
export function boxToWkt(box: GeoBox): string {
  if (box.west < -180) {
    return `MULTIPOLYGON((${ring({ ...box, west: box.west + 360, east: 180 })}),(${ring({ ...box, west: -180 })}))`;
  }
  if (box.east > 180) {
    return `MULTIPOLYGON((${ring({ ...box, east: 180 })}),(${ring({ ...box, west: -180, east: box.east - 360 })}))`;
  }
  return `POLYGON(${ring(box)})`;
}
