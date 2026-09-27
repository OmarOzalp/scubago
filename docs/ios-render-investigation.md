# iOS island: blank render and lag (investigation)

Branch `claude/fix-ios-island-render`. This file is also the draft PR description.

## Summary

On the iPhone 17 Pro / iOS 26.5 simulator, the "Your Sanctuary" card shows only
its teal background and the app lags. Web renders the island from the same code.
The simulator could not be run for this investigation, so the causes below come
from the Metro log and screenshots, the git history, and the Expo GL (57.0.2)
and React Three Fiber (9.7.0) sources in `node_modules`. **The iOS render has
not been confirmed fixed.** Each change says why it is expected to help.

The log shows the scene issuing draw calls and no shader or GL errors. The iOS
scene has 31 draw calls and web has 25: the iOS profile is level 2, which adds
two coral clusters (6 draws, 48 triangles). That is a data difference, not a
rendering one.

## Root causes, most likely first

### 1. Expo GL frames pile up without back-pressure, and the ocean made each frame too expensive

This is the regression, introduced by 468dfa3 (low-poly ocean).

- `gl.endFrameEXP()` adds the frame to a batch, dispatches an async flush to
  Expo GL's serial GL queue, and returns immediately (`EXWebGLMethodsDraw.cpp`,
  `EXGLContext.mm`). Nothing slows JS down when that queue falls behind. A
  frame is presented only after the queue has worked through everything
  submitted before it (`GLView.swift`: blit after flush, then present on the
  next display link).
- The simulator rasterizes OpenGL ES in software on the Mac's CPU. An earlier
  profile, recorded in `docs/island-performance.md` ("Simulator animation
  correction"), found the GL worker busy in software triangle rendering. The
  same doc notes that an earlier per-pixel wave shader "stalled the simulator
  software renderer".
- 468dfa3 added two full-card custom-shader passes. The seabed is drawn first
  with depth testing off, and the water is blended on top. Both compute a
  derivative-based facet normal and sample a depth map in every pixel. The doc
  records that the ocean was never measured on the simulator. 16b0b8a, the
  version with simple water, was verified to render and animate there.
- Once a frame costs more than the 50ms simulator timer, queued frames grow
  without bound. The view falls further and further behind, which reads as
  blank or frozen, while CPU and memory use climb. That fits both "nothing
  renders" and "laggy".
- The telemetry could not show this. "120 frames over 25ms" is guaranteed by
  the 50ms timer. The 15fps figure is close to the roughly 17fps that a 50ms
  timer allows after waiting for the next display frame. JS was not the
  bottleneck.

**Fixed in this PR:** the simulator frame timer now calls `gl.flushEXP()` before
each frame. That call blocks until Expo GL's queue has run everything submitted
so far. The timer then stretches the interval by however long it waited: a
frame every 50ms to 2s, with at most one frame in flight. The view should
always show a recent frame, even if the software renderer is slow. The pacing
never blocks while the app is not active, because Expo GL stops draining its
queue then. Physical devices are unchanged.

### 2. The native GL canvas was 3 times taller than intended (since 16b0b8a)

- `SceneCanvas` lowers native resolution by laying the canvas out at 1/3 size
  (on a @3x simulator) and scaling it back up with a transform. Fiber's native
  Canvas applies `{ flex: 1, ...style }` to its root view. In Yoga, `flex: 1`
  sets the flex basis to 0 and lets the view grow, so the reduced `height` was
  ignored and the canvas filled the card's full height (`Node.cpp`
  `processFlexBasis`).
- The result was a GL buffer 3 times the intended size on the simulator (1.5
  times on a @3x device). After the scale-up, two-thirds of it lay outside the
  card and was clipped, but it was still drawn in software.
- **Fixed in this PR:** `flex: 0` on the Fiber canvas style. This also makes
  the camera fit the card's short side, as on web, so the home card zooms out
  about 7% and now matches web framing. The close-up screen is visually
  unchanged.

### 3. 4x MSAA is still on for iOS, despite `antialias: false`

- Fiber's native Canvas keeps `antialias` in state initialized to `true`, so
  `GLView` mounts with `msaaSamples={4}`. It switches to 0 only after the
  renderer calls `getContext({ antialias: false })`. Expo GL's iOS view
  allocates its multisample buffers once, at first layout, and ignores later
  `msaaSamples` changes (`GLView.swift`). A software renderer then pays for 4x
  multisampling on every frame.
- **Not fixed.** It needs a change inside `@react-three/fiber`. Proposed fix:
  patch `node_modules/@react-three/fiber/native/dist/*.js` with patch-package
  so the state starts from the prop, e.g.
  `useState(gl?.antialias ?? true)`, and report it upstream. It is JS-only, so
  no native rebuild. Effort: small, but it adds patch tooling. The
  alternative, owning the `GLView` and using Fiber's `createRoot`, is larger.

### 4. Supabase token refresh retry loop (minor, not a render cause)

- The stored session's project hostname returns NXDOMAIN. supabase-js
  auto-refresh runs a tick every 30s and retries network failures with
  backoff, which matches the roughly 80 failures in 15 minutes seen in the iOS
  log. Each attempt is one failed fetch and occasionally a warning, a
  negligible JS cost. It adds log noise and LogBox toasts, not frame cost.
- **Not changed** (account decision). Options: restore or unpause the Supabase
  project, or sign out to clear the stored session. A client-side option is to
  call `auth.stopAutoRefresh()` after a few consecutive
  `AuthRetryableFetchError`s until the next foreground. Effort: quick.

### 5. Harmless log lines

- `THREE.Clock ... deprecated`: Fiber 9.7 still creates a `THREE.Clock`
  against three r186. Goes away with a later Fiber release.
- `EXT_color_buffer_float extension not supported`: three looks the extension
  up when it uploads the float bone textures of the skinned animals. Those
  textures are only sampled, never rendered into.
- `EXGL: gl.pixelStorei() doesn't support this parameter yet!` (twice): three
  sets two unpack parameters that Expo GL does not implement
  (premultiply-alpha, colorspace conversion) to their defaults on the first
  texture upload. No effect on the depth map or bone textures.

Not a cause either: per-frame JS work is small. There are 2 to 8 swimmers, a
few small objects allocated per frame, and no React re-renders driven by frames.

## What this PR changes

- `src/components/home/three/scene-canvas.native.tsx`: `flex: 0` on the Fiber
  canvas, plus the completion-paced simulator frame timer (`flushEXP`
  back-pressure, 50ms to 2s). In development it logs the settled pacing once.
- `src/components/home/three/scene-performance.tsx`: the `[island]` line now
  reports JS milliseconds per frame, from the first frame callback until
  three.js has issued its draw calls, instead of "frames over 25ms".
- `src/components/home/__tests__/scene-canvas.test.js`: covers the flex
  override, the flush before each frame, no blocking while inactive, and the
  pacing back-off and recovery.
- `docs/island-performance.md`: a short record of the findings.

## What's left (proposed)

| Item | Proposal | Effort |
| --- | --- | --- |
| 4x MSAA stays on for iOS | Patch Fiber's native Canvas to start `antialias` from `gl.antialias` (patch-package), then upstream it | Small; adds patch tooling |
| Simulator still slow after this PR | If the pacing log shows hundreds of ms, add a simulator-only lighter ocean: larger `facetSize`, per-vertex seabed shading, or seabed colors baked into vertex colors | Medium |
| Device path has no back-pressure either | Measure on a physical iPhone. If it falls behind, apply the same pacing with a 16ms floor | Small |
| Supabase refresh loop | Restore the project or sign out; optionally stop auto-refresh after repeated network failures | Quick |
| `THREE.Clock` warning | Update `@react-three/fiber` when a release moves to `THREE.Timer` | Quick |

## Verification

Run on the Mac, in the branch's worktree, after `npm ci`:

- `npx tsc --noEmit`: pass (exit 0). This needs the generated, gitignored
  `expo-env.d.ts` that `expo start` creates. Without it, main shows the same 2
  CSS-module errors.
- `npx jest`: `Test Suites: 20 passed, 20 total`, `Tests: 108 passed, 108 total`
  (106 on main, plus 2 new tests).
- `npx expo lint` on the three changed source and test files: no findings.
- `npx expo export --platform web`: success. `npx expo export --platform ios`:
  success, and the Hermes bundle contains the `flushEXP` pacing while the web
  bundle does not.
- Against the old `scene-canvas.native.tsx`, the updated test fails on the flex
  assertion (expected 0, received 1).
- **Not verified:** rendering on the iOS simulator or on a device.

## Simulator checklist

1. `git fetch && git checkout claude/fix-ios-island-render`. JS-only: no native
   rebuild or `pod install` needed.
2. `npx expo start --clear`, then reload the app in the simulator (`r` in Metro).
3. Open My Home. Check that the island, palms, ocean and swimming animals draw
   in "Your Sanctuary", and that the framing matches web (localhost:8081).
4. Read the Metro lines:
   - `[island] simulator GL pacing: a frame every Nms; longest wait for the GL queue Mms`.
     N near 50 means the software renderer keeps up. N in the hundreds means
     it is GL-bound: apply the MSAA patch next, then the lighter simulator ocean.
   - `[island] 120 JS frames: ... JS Xms avg, Yms max per frame; ...`. This is
     JS-thread cost per frame. The scheduled fps is low on the simulator by
     design.
5. Scroll Home and switch tabs to confirm the lag is gone or reduced. Pause and
   Play should still stop and restart the animation.
6. If the card is still blank, send the two `[island]` lines and any new
   warnings or errors. Note whether toggling Pause changes anything.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
