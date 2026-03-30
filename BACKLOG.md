# SplatCast Backlog

## In Progress

## Up Next

## Discovered
- [ ] 4D timeline scrubber — load multiple splat captures of the same site taken on different dates and scrub through them on a timeline slider to visualize construction progress, with automatic alignment and the ability to flag areas behind schedule
- [ ] 2D drawing overlay registration — import 2D floor plans or elevation drawings (PDF/DXF) and pin-register them to the 3D splat scene so reviewers can cross-reference design intent against the as-built capture
- [ ] RFI/submittal workflow integration — extend spatial tasks into formal Request for Information workflows with numbered sequences, required-response fields, due dates, and exportable logs matching Procore/BIM 360 formats
- [ ] Multi-scene composite view — load and spatially register multiple separate splat files into a unified scene (e.g. combining scans from different trades or floors) with per-scene visibility toggles and spatial conflict detection
- [ ] glTF/SPZ import support — load Gaussian splats from glTF files using the KHR_gaussian_splatting extension and compressed SPZ format, enabling interoperability with the emerging Khronos standard and up to 90% smaller file sizes than PLY
- [ ] IFC model overlay — import IFC/BIM models and render them as transparent wireframe overlays aligned to the splat scene, allowing side-by-side comparison of design intent vs. as-built capture with per-element toggle and clash highlighting
- [ ] Offline-first sync with conflict resolution — cache Yjs document state in IndexedDB so users can annotate while disconnected, with automatic merge and visual conflict markers when reconnecting to the collaboration server
- [ ] Shareable public view links — generate read-only URLs with embedded camera position and active annotations that load without authentication, enabling stakeholders to review specific viewpoints without joining a live session
- [ ] Splat scene LOD streaming — progressive level-of-detail loading that fetches coarse splats first for instant preview, then streams higher-detail regions based on camera proximity, reducing initial load time for large construction site captures
- [ ] OpenUSD splat import/export — import and export Gaussian splat scenes using the OpenUSD v26.03 3DGS schema, enabling round-trip interoperability with Pixar/NVIDIA/Autodesk pipelines and preserving annotations as USD layer metadata
- [ ] Embeddable standalone HTML export — export the current scene view with baked-in annotations and camera position as a single self-contained HTML file (like SuperSplat's HTML Viewer export), hostable on any static server for stakeholder review without SplatCast access
- [ ] Geospatial coordinate anchoring — pin splat scenes to real-world WGS84/UTM coordinates using ground control points, enabling GIS integration, multi-site dashboards, and accurate distance/area measurements tied to surveyed positions
- [ ] In-browser splat editing tools — crop, delete, transform, and merge splat regions directly in the viewer using lasso and box selection, with undo support and collaborative sync so teams can clean up scan artifacts without leaving SplatCast
- [ ] Drone video direct-to-splat pipeline — upload raw drone footage or phone video and trigger server-side 3DGS training (via a configurable backend), with progress tracking and automatic scene loading on completion for rapid site capture-to-review workflows
- [ ] Natural language scene query — integrate language-embedded Gaussian splatting (LangSplat/Feature 3DGS) to enable text-driven search and highlighting of scene regions (e.g. type "find all windows" to highlight matching splats), bridging semantic understanding with spatial visualization
- [ ] Gamepad and spatial controller navigation — support standard gamepads and WebXR spatial controllers for scene navigation with configurable stick mapping, dead zones, and speed curves, making site walkthroughs more intuitive for field teams using handheld controllers
- [ ] Splat instancing and scene graph — implement a scene graph with instanced splat objects so the same captured element (e.g. a repeated column or fixture) can be placed multiple times without duplicating GPU memory, inspired by NVIDIA vkSplatting's multi-instance architecture
- [ ] Collaborative markup snapshots — capture the current viewport with all visible annotations, measurements, and overlays as a timestamped snapshot stored in the Yjs doc, creating an auditable visual history of review sessions that participants can browse and compare
- [ ] Real-time shadow estimation overlay — compute approximate shadow maps from splat geometry using screen-space ambient occlusion and directional light simulation, giving reviewers a sense of how structures cast shadows at configurable times of day for site planning
- [ ] WASM-accelerated splat processing — compile performance-critical splat operations (sorting, covariance computation, format conversion) to WebAssembly via Rust, bypassing WebGPU compute shader limitations for more consistent cross-device performance inspired by Gauzilla Pro's architecture
- [ ] Automatic splat segmentation and object isolation — apply SAM-based or density-clustering segmentation to decompose a splat scene into discrete objects, enabling per-object selection, visibility toggles, property panels, and trade-specific filtered views without manual lasso selection
- [ ] Live camera feed AR overlay — overlay a live device camera feed aligned to the splat scene using WebXR anchors or manual registration, enabling field workers to compare the as-built capture against current real-world site conditions in split-screen or blended view
- [ ] Hierarchical radix sort for WebGPU — replace the current depth-sorting approach with a wait-free hierarchical radix sort (as described in the WebSplatter paper) to enable deterministic, high-performance rendering across diverse GPU hardware without relying on global atomics
- [ ] Collaborative annotation templates — create reusable annotation template libraries (e.g. standard defect types, inspection checklists, safety hazard markers) that teams can share across projects, with drag-and-drop placement and auto-populated metadata fields for consistent reporting

## Done
- [x] Semantic region tagging — paint or lasso-select groups of splats and assign semantic labels (e.g. "structural column", "HVAC duct", "exterior wall") that persist across sessions, enabling filtered views by trade/discipline and searchable scene elements — PR https://github.com/bentonkt/SplatCast/pull/40
- [x] BCF issue export — export spatial tasks and annotations as BCF-format files (.bcfzip) with viewpoint snapshots and camera positions for integration with BIM coordination platforms — PR https://github.com/bentonkt/SplatCast/pull/39
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
