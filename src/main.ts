import { OrbitCamera } from './renderer/camera';
import { SplatRenderer, loadSplatFile } from './renderer/splat-renderer';
import { SyncManager } from './collab/sync';
import { PinManager } from './annotations/pins';

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

  // Collaboration
  const sync = new SyncManager('default-room');
  const pins = new PinManager(canvas, sync);
}

init();
