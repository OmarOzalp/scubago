import type { Camera } from 'three';

/**
 * Where a world point appears in the camera's view, as normalized device coordinates (-1 to 1 across
 * and up the canvas), as three's Vector3.project() gives, without allocating (it runs every frame).
 */
export function projectPoint(camera: Camera, x: number, y: number, z: number, out: { x: number; y: number }) {
  const v = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
  const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
  const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
  const vw = v[3] * x + v[7] * y + v[11] * z + v[15];
  const w = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw || 1;
  out.x = (p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw) / w;
  out.y = (p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw) / w;
  return out;
}
