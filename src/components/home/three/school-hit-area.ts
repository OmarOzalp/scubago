import { CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, Vector3, type Camera } from 'three';
import type { TunaSchool } from '@/lib/tuna-school';

/**
 * How deep the school's tap target lies: far below every animal (a dive bottoms out at y -2.57, see
 * ocean-depth.ts, and no animal's body reaches much more than 2 units below its middle; checked by
 * `npm run verify:underwater`), so an animal over the school is always nearer the camera and is
 * picked first.
 */
export const SCHOOL_HIT_DEPTH = -8;

/**
 * The tuna school's one tap target: a flat oval (24 triangles) laid over the school's hit area
 * (`TunaSchool.hitArea`). It is never drawn (the renderer skips invisible objects; raycasts still
 * find them). The camera is orthographic, so sliding the oval along the view direction does not
 * move it on screen: it lies at SCHOOL_HIT_DEPTH, straight below the school as the camera sees it.
 * Updated in place each frame, with no allocation.
 */
export function createSchoolHitArea() {
  const geometry = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'tuna-school-hit-area';
  mesh.visible = false;
  const view = new Vector3();
  return {
    mesh,
    /** Lay the oval over `area` as `camera` sees it. */
    update(area: TunaSchool['hitArea'], camera: Camera) {
      camera.getWorldDirection(view);
      const slide = (SCHOOL_HIT_DEPTH - area.y) / Math.min(view.y, -.1);
      mesh.position.set(area.x + view.x * slide, SCHOOL_HIT_DEPTH, area.z + view.z * slide);
      mesh.rotation.set(0, area.heading, 0);
      mesh.scale.set(area.across, 1, area.along);
      mesh.updateMatrixWorld();
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
