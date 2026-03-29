# CLAUDE.md — SplatCast

## What Is SplatCast
SplatCast is a multiplayer collaborative Gaussian splat viewer. Multiple users connect to the same room, orbit/pan/zoom a shared 3D splat scene, and place real-time synced annotations. Built for the browser using WebGPU.

## Tech Stack
| Layer | Technology |
|---|---|
| Language | TypeScript (strict) |
| Build | Vite (dev server :3000) |
| Renderer | WebGPU + WGSL shaders |
| Sync | Yjs + y-websocket |
| Collab server | ws (custom Yjs WS server, :4000) |
| Tests | Playwright |

## Project Structure
```
src/
  main.ts               — entry point, wires renderer + collab
  types.ts              — shared TypeScript types (Annotation, SplatData, etc.)
  renderer/
    splat-renderer.ts   — WebGPU Gaussian splat point renderer
    camera.ts           — OrbitCamera (orbit/pan/zoom)
  collab/
    sync.ts             — SyncManager: wraps Yjs doc + WebsocketProvider
  annotations/
    pins.ts             — PinManager: places/renders annotation pins via SyncManager
server/
  index.ts              — Yjs WebSocket server (room-based, port 4000)
tests/
  playwright.config.ts  — Playwright config with WebGPU launch flags
  smoke.spec.ts         — e2e tests: smoke, camera, annotations, multi-user sync
public/                 — static assets
```

## Development Commands
```bash
npm run dev       # Vite dev server → http://localhost:3000
npm run server    # Yjs WebSocket server → ws://localhost:4000
npm test          # Playwright e2e suite (starts both servers automatically)
npm run build     # Production build → dist/
```

Both servers must be running for full functionality. `npm test` starts them automatically via `webServer` in `playwright.config.ts`.

## Conventions

### Code
- **TypeScript strict** — no `any`, no implicit types
- **WGSL shaders** inline in renderer files using tagged template literals (`/* wgsl */`)
- All annotations go through **SyncManager** (`src/collab/sync.ts`) — never write directly to Yjs doc
- Renderer is WebGPU-only; graceful fallback text displayed if adapter unavailable

### Features
- **All new features MUST include a Playwright e2e test** simulating real user interaction
- Multi-user features require a two-browser-context test verifying sync (see `smoke.spec.ts` `'two users see synced annotations'`)

### Commit Messages
Use prefixes:
- `feat:` — new feature
- `fix:` — bug fix
- `test:` — test-only changes
- `refactor:` — structural changes, no behavior change
- `docs:` — documentation only

## Testing

### How Playwright Tests Work
- Tests simulate mouse/keyboard: `page.mouse.move/down/up/wheel/dblclick`, `page.keyboard.press`
- `waitForAppReady()` helper waits for `canvas#canvas` to be visible and sized before interacting
- Two-browser-context tests: `browser.newContext()` × 2, verify state propagates between pages
- Annotation pins render into `#pin-overlay` — assert child count after interaction

### WebGPU in Headless Chromium
Playwright config passes these flags:
```
--enable-unsafe-webgpu
--enable-features=Vulkan
--use-angle=swiftshader
```
SwiftShader provides software WebGPU — tests run headless without a GPU.

### Running a Single Test
```bash
npx playwright test --config tests/playwright.config.ts -g "two users"
```

## Autonomous Dev Loop
**BACKLOG.md drives the loop.** Work top-down through "Up Next":
1. Pick the first unchecked item in **Up Next**
2. Move it to **In Progress**
3. Implement (feature + Playwright test)
4. Move to **Done** once tests pass
5. Commit with appropriate prefix and push
