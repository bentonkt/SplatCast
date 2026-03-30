import { OrbitCamera } from './renderer/camera';
import { SplatRenderer, loadSplatFile } from './renderer/splat-renderer';
import { SyncManager } from './collab/sync';
import { PinManager } from './annotations/pins';
import { CursorManager } from './collab/cursors';
import { DrawManager } from './annotations/draw';

async function init() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  const camera = new OrbitCamera(canvas);
  const renderer = new SplatRenderer(canvas, camera);

  // Collaboration works regardless of WebGPU availability
  const roomId = new URLSearchParams(window.location.search).get('room') || 'default-room';
  const sync = new SyncManager(roomId);
  const pins = new PinManager(canvas, sync);
  const cursors = new CursorManager(canvas, sync);
  const draw = new DrawManager(canvas, sync);

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

  const splatData = await loadSplatFile('/sample.splat');
  renderer.loadSplats(splatData);

  function frame() {
    renderer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

init();
