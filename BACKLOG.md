# SplatCast Backlog

## In Progress
- [ ] Viewpoint bookmarks — save named camera positions that any user can snap to for referencing specific areas

## Up Next
- [ ] Real Gaussian splat test fixtures — replace synthetic sample.splat with a real .splat file from an actual 3DGS reconstruction (e.g., download a small scene like "bicycle" or "bonsai" from the original 3DGS paper datasets or Polycam). Keep it under 10MB for tests. Update the renderer to properly handle real covariances, opacity, and SH coefficients. Add a Playwright test that loads the real splat file and verifies the scene renders (canvas pixels should have varied colors, not just background). Keep the synthetic generator as a fallback.
- [ ] Measurement tool — click two points to measure distance with a synced line and label
- [ ] Screenshot export — capture the current viewport as PNG with annotations baked in
- [ ] Annotation threading — reply to pins to create comment threads for review discussions
- [ ] Clipping planes — interactive cross-section sliders to cut through the splat scene, synced across users

## Discovered

## Done
- [x] Undo/redo — Yjs undo manager for annotation changes — PR https://github.com/bentonkt/SplatCast/pull/13
- [x] User presence sidebar — show connected users with their colors — PR https://github.com/bentonkt/SplatCast/pull/12
- [x] Annotation labels — click a pin to add/edit a text label — PR https://github.com/bentonkt/SplatCast/pull/11
- [x] Loading UI — progress bar for large splat files, drag-and-drop file loading — PR https://github.com/bentonkt/SplatCast/pull/10
- [x] Splat file format support — support .ply files in addition to .splat format — PR https://github.com/bentonkt/SplatCast/pull/9
- [x] Improved splat rendering — sort splats by depth, implement alpha blending for transparency — PR https://github.com/bentonkt/SplatCast/pull/8
- [x] Mobile touch controls — pinch to zoom, two-finger drag to orbit, tap to annotate — PR https://github.com/bentonkt/SplatCast/pull/7
- [x] Annotation persistence — save/load Yjs doc state to disk on server — PR https://github.com/bentonkt/SplatCast/pull/6
- [x] Room system — URL-based room IDs (/room/<id>), each room is a separate Yjs doc — PR https://github.com/bentonkt/SplatCast/pull/5
- [x] Color-coded per-user annotations — assign consistent colors per userId — PR https://github.com/bentonkt/SplatCast/pull/4
- [x] Freehand drawing annotations — draw on the scene with mouse, strokes synced via Yjs — PR https://github.com/bentonkt/SplatCast/pull/3
- [x] Annotation types — add arrow and text label annotations — PR https://github.com/bentonkt/SplatCast/pull/2
- [x] Multi-user cursor presence — PR https://github.com/bentonkt/SplatCast/pull/1
- [x] WebGPU Gaussian splat point renderer
- [x] Orbit/pan/zoom camera controls
- [x] Yjs WebSocket sync server
- [x] Click-to-place annotation pins with real-time sync
- [x] Playwright e2e test suite (smoke, camera, annotations, multi-user)
