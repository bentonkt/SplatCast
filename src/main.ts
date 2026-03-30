import { OrbitCamera } from './renderer/camera';
import { SplatRenderer, loadSplatScene, parseSplatBuffer, parsePlyBuffer, computeBounds } from './renderer/splat-renderer';
import { SyncManager } from './collab/sync';
import { PinManager } from './annotations/pins';
import { CursorManager } from './collab/cursors';
import { DrawManager } from './annotations/draw';
import { PresenceSidebar } from './collab/presence-sidebar';
import { UndoRedoToolbar } from './collab/undo-redo';
import { BookmarkPanel } from './collab/bookmarks';
import { ClipPlanesPanel } from './collab/clip-planes';
import { TourPanel } from './collab/tour';
import { parseRoute, generateRoomId, navigateToRoom } from './router';

function showLobby() {
  const lobby = document.getElementById('lobby')!;
  lobby.classList.add('active');

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.style.display = 'none';

  document.getElementById('create-room-btn')!.addEventListener('click', () => {
    navigateToRoom(generateRoomId());
  });

  const joinBtn = document.getElementById('join-room-btn')!;
  const roomInput = document.getElementById('room-id-input') as HTMLInputElement;

  joinBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (roomId) {
      navigateToRoom(roomId);
    }
  });

  roomInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const roomId = roomInput.value.trim();
      if (roomId) {
        navigateToRoom(roomId);
      }
    }
  });
}

async function startViewer(roomId: string) {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  const camera = new OrbitCamera(canvas);
  (window as Record<string, unknown>)['__camera'] = camera;
  const renderer = new SplatRenderer(canvas, camera);

  // Collaboration works regardless of WebGPU availability
  const sync = new SyncManager(roomId);
  const pins = new PinManager(canvas, sync);
  const cursors = new CursorManager(canvas, sync);
  const draw = new DrawManager(canvas, sync);
  const presence = new PresenceSidebar(sync);
  const undoRedo = new UndoRedoToolbar(sync);
  const bookmarkPanel = new BookmarkPanel(sync, camera);
  const tourPanel = new TourPanel(sync, camera);

  // Suppress unused variable warnings — managers attach event listeners
  void pins;
  void cursors;
  void draw;
  void presence;
  void undoRedo;
  void bookmarkPanel;
  void tourPanel;

  const gpuAvailable = await renderer.init();
  if (!gpuAvailable) {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f00';
    ctx.font = '20px monospace';
    ctx.fillText('WebGPU not available in this browser', 40, 60);
    return;
  }

  // Clip planes panel — must be created after renderer.init() so the GPU
  // device/buffers exist when initial synced state is applied.
  const clipPlanesPanel = new ClipPlanesPanel(sync, renderer);
  void clipPlanesPanel;

  // Loading overlay helpers
  const loadingOverlay = document.getElementById('loading-overlay')!;
  const progressBar = document.getElementById('loading-progress-bar')!;
  const progressText = document.getElementById('loading-progress-text')!;

  function showLoading() {
    loadingOverlay.classList.add('active');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
  }

  function updateProgress(fraction: number) {
    const pct = Math.round(fraction * 100);
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }

  // Load default sample
  showLoading();
  try {
    const splatData = await loadSplatScene('/sample.splat', updateProgress);
    renderer.loadSplats(splatData);
    const bounds = computeBounds(splatData);
    camera.frameBounds(bounds.center, bounds.extent);
    clipPlanesPanel.setRange(bounds.extent * 1.5);
  } finally {
    hideLoading();
  }

  let animating = false;
  function startRenderLoop() {
    if (animating) return;
    animating = true;
    function frame() {
      renderer.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  startRenderLoop();

  // Drag-and-drop support
  const dropOverlay = document.getElementById('drop-overlay')!;
  let dragCounter = 0;

  document.addEventListener('dragenter', (e: DragEvent) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dropOverlay.classList.add('active');
    }
  });

  document.addEventListener('dragleave', (e: DragEvent) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.remove('active');
    }
  });

  document.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
  });

  document.addEventListener('drop', async (e: DragEvent) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.remove('active');

    const file = e.dataTransfer?.files[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith('.splat') && !name.endsWith('.ply')) return;

    showLoading();
    try {
      const buffer = await file.arrayBuffer();
      updateProgress(1);

      const data = name.endsWith('.ply')
        ? parsePlyBuffer(buffer)
        : parseSplatBuffer(buffer);

      renderer.loadSplats(data);
      const droppedBounds = computeBounds(data);
      camera.frameBounds(droppedBounds.center, droppedBounds.extent);
      clipPlanesPanel.setRange(droppedBounds.extent * 1.5);
    } finally {
      hideLoading();
    }
  });
}

function init() {
  const route = parseRoute();

  if (route.type === 'room' && route.roomId) {
    startViewer(route.roomId);
  } else {
    showLobby();
  }
}

init();
