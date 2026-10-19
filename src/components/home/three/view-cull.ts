import type { Camera } from 'three';

/**
 * Whether anything within `x` and `z` units (and `y` up and down) of a point in the world can be on
 * screen for the scene's orthographic camera, as it last drew: the point's place on screen, with
 * those reaches as its margin. Out of view, the explorer lets the animals there rest (their
 * swimming, their skeletons and their drawing), and the Home card the ones still out of its frame.
 * (Plain arithmetic on the camera's matrices, so it costs next to nothing per animal.)
 */
export function onScreen(camera: Camera, at: { x: number; y: number; z: number }, x: number, z = x, y = 1) {
  const v = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  // Into the camera's frame, then onto the screen (an orthographic camera has no perspective divide).
  const cx = v[0] * at.x + v[4] * at.y + v[8] * at.z + v[12], cy = v[1] * at.x + v[5] * at.y + v[9] * at.z + v[13];
  const sx = p[0] * cx + p[12], sy = p[5] * cy + p[13];
  // How far one unit moves on screen (in screen halves) across, and in depth and height (the view is tilted).
  return Math.abs(sx) <= 1 + x * Math.abs(p[0]) && Math.abs(sy) <= 1 + (z + y) * Math.abs(p[5]);
}
