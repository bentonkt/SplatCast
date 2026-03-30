# SplatCast Backlog

## In Progress
- [ ] BCF issue export — export spatial tasks and annotations as BCF-format files (.bcfzip) with viewpoint snapshots and camera positions for integration with BIM coordination platforms

## Up Next

## Discovered

## Done
- [x] Spatial notification subscriptions — draw a 3D bounding box to "watch" a region and receive in-app notifications when other users add annotations, tasks, or measurements inside that volume — PR https://github.com/bentonkt/SplatCast/pull/38
- [x] WebXR immersive viewing — enter the shared splat scene in AR or VR via the WebXR Device API, with annotations and presence synced across flat-screen and immersive users — PR https://github.com/bentonkt/SplatCast/pull/37
- [x] Camera flythrough video export — keyframe-based camera animation timeline with smooth interpolation and WebM export, annotations baked into the flythrough for stakeholder presentations — PR https://github.com/bentonkt/SplatCast/pull/36
- [x] Deviation colormap overlay — compute per-splat geometric deviation between two loaded scenes and render a continuous color gradient (green/yellow/red) with adjustable tolerance, for construction verification workflows — PR https://github.com/bentonkt/SplatCast/pull/35
- [x] AI-assisted defect detection — run anomaly detection over splat density/color to automatically flag regions deviating from a reference model — PR https://github.com/bentonkt/SplatCast/pull/34
- [x] Cross-section 2D export — define arbitrary slice planes and export the resulting cross-section as a dimensioned 2D SVG for architects and engineers — PR https://github.com/bentonkt/SplatCast/pull/33
- [x] Spatial anchored tasks — attach to-do items to 3D regions with assignee, priority, and status fields, turning review comments into tracked work items — PR https://github.com/bentonkt/SplatCast/pull/32
- [x] Role-based permissions — assign viewer, commenter, or editor roles per user so stakeholders can review without accidentally modifying scene state — PR https://github.com/bentonkt/SplatCast/pull/31
- [x] Version diffing — overlay two versions of the same scene with a slider to highlight geometric differences, letting teams track progress or spot regressions between scans — PR https://github.com/bentonkt/SplatCast/pull/30
- [x] Spatial audio notes — record short audio clips attached to 3D positions, click speaker icon to play back — PR https://github.com/bentonkt/SplatCast/pull/29
- [x] Time-travel annotation playback — timeline scrubber replaying annotation history chronologically with optional camera follow — PR https://github.com/bentonkt/SplatCast/pull/28
- [x] Splat point inspector — click any point to see raw Gaussian splat properties (XYZ, RGB, opacity, scale) in a popover tooltip — PR https://github.com/bentonkt/SplatCast/pull/27
- [x] Annotation heatmap overlay — 2D density visualization projecting annotation clusters onto the viewport to surface feedback hotspots — PR https://github.com/bentonkt/SplatCast/pull/26
- [x] Annotation resolve/unresolve — mark annotations as resolved with filtering toggle, synced across users for review workflows — PR https://github.com/bentonkt/SplatCast/pull/25
- [x] Annotation export to JSON/CSV — export all annotations, measurements, threads, and bookmarks as structured data with 3D coordinates for external tools — PR https://github.com/bentonkt/SplatCast/pull/24
- [x] Side-by-side scene comparison — load two splat files into split or overlay viewports with synced camera controls for reviewing changes between captures — PR https://github.com/bentonkt/SplatCast/pull/23
- [x] Viewport follow mode — click a user's avatar to lock your camera to theirs in real time, with one-click unfollow — PR https://github.com/bentonkt/SplatCast/pull/22
- [x] Splat isolation/hiding — lasso-select to hide or isolate splat regions, synced across users — PR https://github.com/bentonkt/SplatCast/pull/21
- [x] Guided tour playback — cinematic walkthrough of bookmarks synced across users — PR https://github.com/bentonkt/SplatCast/pull/20
- [x] Clipping planes — interactive cross-section sliders to cut through the splat scene, synced across users — PR https://github.com/bentonkt/SplatCast/pull/19
- [x] Annotation threading — reply to pins to create comment threads for review discussions — PR https://github.com/bentonkt/SplatCast/pull/18
- [x] Screenshot export — capture the current viewport as PNG with annotations baked in — PR https://github.com/bentonkt/SplatCast/pull/17
- [x] Measurement tool — click two points to measure distance with a synced line and label — PR https://github.com/bentonkt/SplatCast/pull/16
- [x] Real Gaussian splat test fixtures — real 3DGS ChristmasTree scene (10K splats), full covariance from rotation quaternions, camera auto-framing — PR https://github.com/bentonkt/SplatCast/pull/15
- [x] Viewpoint bookmarks — save named camera positions that any user can snap to — PR https://github.com/bentonkt/SplatCast/pull/14
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
