# SplatCast Backlog

## In Progress
- [ ] Color-coded per-user annotations — assign consistent colors per userId

## Up Next
- [ ] Room system — URL-based room IDs (/room/<id>), each room is a separate Yjs doc
- [ ] Annotation persistence — save/load annotation state to server or localStorage
- [ ] Mobile touch controls — pinch to zoom, two-finger drag to orbit, tap to annotate
- [ ] Improved splat rendering — sort splats by depth, implement alpha blending for transparency
- [ ] Splat file format support — support .ply files in addition to .splat format
- [ ] Loading UI — progress bar for large splat files, drag-and-drop file loading
- [ ] Annotation labels — click a pin to add/edit a text label
- [ ] User presence sidebar — show connected users with their colors
- [ ] Undo/redo — Yjs undo manager for annotation changes

## Discovered

## Done
- [x] Freehand drawing annotations — draw on the scene with mouse, strokes synced via Yjs — PR https://github.com/bentonkt/SplatCast/pull/3
- [x] Annotation types — add arrow and text label annotations — PR https://github.com/bentonkt/SplatCast/pull/2
- [x] Multi-user cursor presence — PR https://github.com/bentonkt/SplatCast/pull/1
- [x] WebGPU Gaussian splat point renderer
- [x] Orbit/pan/zoom camera controls
- [x] Yjs WebSocket sync server
- [x] Click-to-place annotation pins with real-time sync
- [x] Playwright e2e test suite (smoke, camera, annotations, multi-user)
