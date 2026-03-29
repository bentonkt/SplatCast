# SplatCast

Multiplayer collaborative Gaussian splat viewer — orbit a 3D scene together and drop synced annotations in real time.

## Quick Start

```bash
npm install

# Terminal 1 — Vite dev server
npm run dev        # http://localhost:3000

# Terminal 2 — Yjs collaboration server
npm run server     # ws://localhost:4000
```

Open `http://localhost:3000` in two browser tabs to see real-time sync.

## Tests

```bash
npm test
```

Playwright starts both servers automatically and runs the full e2e suite.

## Architecture

- **WebGPU renderer** (`src/renderer/`) — Gaussian splat point cloud rendered with WGSL shaders, OrbitCamera for mouse-driven navigation
- **Yjs sync** (`src/collab/sync.ts`, `server/index.ts`) — room-based Yjs documents over WebSocket; all annotation state flows through `SyncManager`
- **Playwright e2e tests** (`tests/`) — simulate real mouse/keyboard input, including two-browser-context tests that verify cross-user sync
