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
import { LassoPanel } from './collab/lasso';
import { ComparePanel } from './collab/compare';
import { VersionDiffPanel } from './collab/version-diff';
import { RoleManager } from './collab/roles';
import { TaskManager } from './collab/tasks';
import { HeatmapOverlay } from './annotations/heatmap';
import { SplatInspector } from './renderer/inspector';
import { TimelinePanel } from './collab/timeline';
import { CrossSectionExporter } from './collab/cross-section';
import { DefectDetector } from './collab/defect-detection';
import { DeviationColormapPanel } from './collab/deviation-colormap';
import { FlythroughPanel } from './collab/flythrough';
import { WebXRManager } from './collab/webxr';
import { SpatialSubscriptionPanel } from './collab/spatial-subscriptions';
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
  (window as Record<string, unknown>)['__renderer'] = renderer;

  // Collaboration works regardless of WebGPU availability
  const sync = new SyncManager(roomId);
  (window as Record<string, unknown>)['__syncManager'] = sync;
  const pins = new PinManager(canvas, sync);
  const cursors = new CursorManager(canvas, sync);
  const draw = new DrawManager(canvas, sync);
  const presence = new PresenceSidebar(sync);
  const roleManager = new RoleManager(sync, presence.userId);
  (window as Record<string, unknown>)['__roleManager'] = roleManager;
  presence.setRoleManager(roleManager);
  const undoRedo = new UndoRedoToolbar(sync);
  const bookmarkPanel = new BookmarkPanel(sync, camera);
  const tourPanel = new TourPanel(sync, camera);

  // Follow mode: apply remote camera when following
  let followingUserId: string | null = null;

  presence.setFollowChangeHandler((userId) => {
    followingUserId = userId;
  });

  // Unfollow on local camera interaction
  const unfollowOnInteraction = () => {
    if (followingUserId) {
      presence.unfollow();
    }
  };
  canvas.addEventListener('mousedown', unfollowOnInteraction);
  canvas.addEventListener('wheel', unfollowOnInteraction);
  canvas.addEventListener('touchstart', unfollowOnInteraction);

  const heatmap = new HeatmapOverlay(canvas, sync);
  const taskManager = new TaskManager(canvas, sync);
  const timelinePanel = new TimelinePanel(sync, pins, draw);
  const spatialSubs = new SpatialSubscriptionPanel(canvas, sync);

  // Suppress unused variable warnings — managers attach event listeners
  void pins;
  void cursors;
  void draw;
  void undoRedo;
  void bookmarkPanel;
  void tourPanel;
  void roleManager;
  void heatmap;
  void taskManager;
  void timelinePanel;
  void spatialSubs;

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

  const crossSectionExporter = new CrossSectionExporter(sync, renderer);
  void crossSectionExporter;

  const defectDetector = new DefectDetector(sync, renderer);
  void defectDetector;

  const deviationColormap = new DeviationColormapPanel(sync, renderer);
  void deviationColormap;

  const flythroughPanel = new FlythroughPanel(canvas, sync, camera);
  void flythroughPanel;

  const webxrManager = new WebXRManager(canvas, sync, camera, renderer);
  void webxrManager;

  const lassoPanel = new LassoPanel(canvas, sync, renderer, camera);
  void lassoPanel;

  const comparePanel = new ComparePanel(canvas, camera, renderer);
  const diffPanel = new VersionDiffPanel(canvas, camera, renderer);

  const splatInspector = new SplatInspector(canvas, renderer, camera);
  void splatInspector;

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
    crossSectionExporter.setRange(bounds.extent * 1.5);
  } finally {
    hideLoading();
  }

  let animating = false;
  let lastBroadcastTime = 0;
  let lastBroadcastState: { theta: number; phi: number; radius: number; target: [number, number, number] } | null = null;
  function startRenderLoop() {
    if (animating) return;
    animating = true;
    function frame() {
      // Apply followed user's camera
      if (followingUserId) {
        const remoteCam = sync.getCameraForUser(followingUserId);
        if (remoteCam) {
          camera.setOrbitalState(remoteCam);
        }
      }

      if (!comparePanel.isActive() && !diffPanel.isActive()) {
        renderer.render();
      }

      // Broadcast local camera state at ~10fps, only when changed
      const now = performance.now();
      if (now - lastBroadcastTime > 100) {
        const currentState = camera.getOrbitalState();
        const changed = !lastBroadcastState
          || currentState.theta !== lastBroadcastState.theta
          || currentState.phi !== lastBroadcastState.phi
          || currentState.radius !== lastBroadcastState.radius
          || currentState.target[0] !== lastBroadcastState.target[0]
          || currentState.target[1] !== lastBroadcastState.target[1]
          || currentState.target[2] !== lastBroadcastState.target[2];
        if (changed) {
          lastBroadcastTime = now;
          lastBroadcastState = currentState;
          sync.setLocalCamera(currentState);
        }
      }

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
      crossSectionExporter.setRange(droppedBounds.extent * 1.5);
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
