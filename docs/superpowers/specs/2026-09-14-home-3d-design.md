# Stylized 3D sanctuary

User selected stylized 3D with natural swimming after reviewing the concept image
and the proposed shark-and-ray quality pass. Preserve the existing home, collection,
habitat choices, ranks, and persistence. Replace the scene with a single 3D renderer.

Use artist-authored CC0 source models with real skeletons and swim clips, refine
shading and geometry in Blender, and export bundled GLB assets. The first quality
benchmark is shark and manta swimming; use family-level representation for species
without exact assets. Do not present demo animals as discoveries: a clearly labeled
preview lets a new user inspect the shark and ray without changing their collection.

Use an orthographic oblique camera, sculpted sand and rocks, soft aquatic colors,
subtle light and depth, varied curved paths, and continuous heading (no sprite flips).
Pause freezes animation time, respects reduced motion and app/tab visibility. Keep
the existing illustrated scene as a fallback for unavailable graphics. Use bounded
resident counts and an inspect view for a closer look at the two benchmark animals.

Status (2026-09-15): implemented per docs/superpowers/plans/2026-09-14-home-3d.md;
shark, ray and fish families have rigs, other categories stay in the collection list.

Validate imported asset licenses, animation clips, skinning, finite geometry, and
export sizes. Test motion continuity, pause/resume timing, deterministic lanes and
asset mapping. Run TypeScript, Jest, web and native bundles, and inspect rendered
frames plus an animated preview. Native runtime remains a device check if unavailable.
