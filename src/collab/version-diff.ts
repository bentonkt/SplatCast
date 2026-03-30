import { SplatRenderer, loadSplatScene, parseSplatBuffer, parsePlyBuffer, computeBounds } from '../renderer/splat-renderer';
import { OrbitCamera } from '../renderer/camera';
import { SplatData } from '../types';

/**
 * Version diffing panel — overlay two scene versions with a blend slider
 * to highlight geometric differences. Version A is tinted green, version B
 * is tinted red; overlapping regions appear blended while differences
 * stand out by colour.
 */
export class VersionDiffPanel {
  private toggleBtn: HTMLButtonElement;
  private active = false;
  private container: HTMLDivElement | null = null;
  private diffCanvas: HTMLCanvasElement | null = null;
  private diffCamera: OrbitCamera | null = null;
  private rendererA: SplatRenderer | null = null;
  private rendererB: SplatRenderer | null = null;
  private canvasA: HTMLCanvasElement | null = null;
  private canvasB: HTMLCanvasElement | null = null;
  private cameraA: OrbitCamera | null = null;
  private cameraB: OrbitCamera | null = null;
  private animating = false;
  private blendValue = 0.5;
  private labelA = 'sample.splat';
  private labelB = '(drop version B)';
  private labelAEl: HTMLDivElement | null = null;
  private labelBEl: HTMLDivElement | null = null;
  private dataA: SplatData | null = null;
  private dataB: SplatData | null = null;
  private toolbar: HTMLDivElement | null = null;
  private compositeCtx: CanvasRenderingContext2D | null = null;

  constructor(
    private mainCanvas: HTMLCanvasElement,
    private mainCamera: OrbitCamera,
    private mainRenderer: SplatRenderer,
  ) {
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'diff-toggle';
    this.toggleBtn.textContent = 'Diff';
    this.toggleBtn.style.cssText = `
      position:absolute;bottom:12px;left:500px;
      background:rgba(255,255,255,0.12);
      border:1px solid rgba(255,255,255,0.2);border-radius:6px;
      color:#fff;font-family:monospace;font-size:13px;
      padding:6px 14px;cursor:pointer;z-index:100;
    `;
    this.toggleBtn.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.toggleBtn);

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        this.toggle();
      }
    });
  }

  private toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  private async activate() {
    this.active = true;
    this.toggleBtn.style.background = '#e87461';
    this.toggleBtn.style.color = '#1a1a2e';

    document.dispatchEvent(new CustomEvent('diff-mode-change', { detail: { active: true } }));

    this.mainCanvas.style.display = 'none';

    // Full-screen container
    this.container = document.createElement('div');
    this.container.id = 'diff-container';
    this.container.style.cssText = `
      position:fixed;inset:0;z-index:1;background:#000;
    `;

    // Visible composite canvas (user interacts here)
    this.diffCanvas = document.createElement('canvas');
    this.diffCanvas.id = 'diff-canvas';
    this.diffCanvas.style.cssText = `display:block;width:100%;height:100%;touch-action:none;`;
    this.container.appendChild(this.diffCanvas);

    // Drop zones — left half for A, right half for B
    const dropA = this.createDropZone('a');
    const dropB = this.createDropZone('b');
    this.container.appendChild(dropA);
    this.container.appendChild(dropB);

    // Labels
    this.labelAEl = document.createElement('div');
    this.labelAEl.id = 'diff-label-a';
    this.labelAEl.style.cssText = `
      position:absolute;top:8px;left:12px;
      background:rgba(30,30,50,0.85);border:1px solid rgba(78,205,130,0.4);
      border-radius:6px;padding:4px 12px;
      font-family:monospace;font-size:12px;color:#4ecd82;
      pointer-events:none;white-space:nowrap;z-index:3;
    `;
    this.labelAEl.textContent = `A: ${this.labelA}`;
    this.container.appendChild(this.labelAEl);

    this.labelBEl = document.createElement('div');
    this.labelBEl.id = 'diff-label-b';
    this.labelBEl.style.cssText = `
      position:absolute;top:8px;right:12px;
      background:rgba(30,30,50,0.85);border:1px solid rgba(232,116,97,0.4);
      border-radius:6px;padding:4px 12px;
      font-family:monospace;font-size:12px;color:#e87461;
      pointer-events:none;white-space:nowrap;z-index:3;
    `;
    this.labelBEl.textContent = `B: ${this.labelB}`;
    this.container.appendChild(this.labelBEl);

    document.body.appendChild(this.container);

    // Toolbar with blend slider
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'diff-toolbar';
    this.toolbar.style.cssText = `
      position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
      background:rgba(30,30,50,0.9);border:1px solid rgba(255,255,255,0.15);
      border-radius:8px;padding:8px 18px;z-index:3000;
      display:flex;gap:12px;align-items:center;
      font-family:monospace;font-size:13px;color:#fff;
    `;

    const labelATag = document.createElement('span');
    labelATag.textContent = 'A';
    labelATag.style.color = '#4ecd82';
    this.toolbar.appendChild(labelATag);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'diff-blend-slider';
    slider.min = '0';
    slider.max = '100';
    slider.value = '50';
    slider.style.cssText = `width:200px;accent-color:#e87461;cursor:pointer;`;
    slider.addEventListener('input', () => {
      this.blendValue = parseInt(slider.value, 10) / 100;
    });
    this.toolbar.appendChild(slider);

    const labelBTag = document.createElement('span');
    labelBTag.textContent = 'B';
    labelBTag.style.color = '#e87461';
    this.toolbar.appendChild(labelBTag);

    const pctLabel = document.createElement('span');
    pctLabel.id = 'diff-blend-pct';
    pctLabel.style.cssText = `min-width:40px;text-align:center;`;
    pctLabel.textContent = '50%';
    this.toolbar.appendChild(pctLabel);

    slider.addEventListener('input', () => {
      pctLabel.textContent = `${slider.value}%`;
    });

    document.body.appendChild(this.toolbar);

    // Size the composite canvas
    this.sizeCanvas();
    window.addEventListener('resize', this.onResize);

    // Create the interactive camera on the composite canvas
    this.diffCamera = new OrbitCamera(this.diffCanvas);

    const camState = this.mainCamera.getOrbitalState();
    this.diffCamera.setOrbitalState(camState);

    // Hidden offscreen canvases for the two renderers
    this.canvasA = document.createElement('canvas');
    this.canvasA.id = 'diff-canvas-a';
    this.canvasA.style.cssText = `position:absolute;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;`;
    this.container.appendChild(this.canvasA);

    this.canvasB = document.createElement('canvas');
    this.canvasB.id = 'diff-canvas-b';
    this.canvasB.style.cssText = `position:absolute;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;`;
    this.container.appendChild(this.canvasB);

    this.sizeOffscreenCanvases();

    this.cameraA = new OrbitCamera(this.canvasA);
    this.cameraB = new OrbitCamera(this.canvasB);
    this.cameraA.setOrbitalState(camState);
    this.cameraB.setOrbitalState(camState);

    this.rendererA = new SplatRenderer(this.canvasA, this.cameraA);
    this.rendererB = new SplatRenderer(this.canvasB, this.cameraB);

    const okA = await this.rendererA.init();
    if (!this.active) { this.deactivate(); return; }
    const okB = await this.rendererB.init();
    if (!okA || !okB || !this.active) { this.deactivate(); return; }

    // 2D composite context on the visible canvas
    this.compositeCtx = this.diffCanvas.getContext('2d');

    // Load current scene into version A
    try {
      const splatData = await loadSplatScene('/sample.splat');
      this.dataA = splatData;
      this.rendererA.loadSplats(splatData);
      const bounds = computeBounds(splatData);
      this.diffCamera.setOrbitalState({
        ...camState,
      });
      this.cameraA.frameBounds(bounds.center, bounds.extent);
      this.cameraB.setOrbitalState(this.cameraA.getOrbitalState());
      this.diffCamera.setOrbitalState(this.cameraA.getOrbitalState());
    } catch {
      // Scene may not be available in tests
    }

    this.updateLabels();
    this.startRenderLoop();
  }

  private deactivate() {
    this.active = false;
    this.animating = false;
    this.toggleBtn.style.background = 'rgba(255,255,255,0.12)';
    this.toggleBtn.style.color = '#fff';

    document.dispatchEvent(new CustomEvent('diff-mode-change', { detail: { active: false } }));
    window.removeEventListener('resize', this.onResize);

    if (this.diffCamera) {
      this.mainCamera.setOrbitalState(this.diffCamera.getOrbitalState());
    }

    this.diffCamera?.destroy();
    this.cameraA?.destroy();
    this.cameraB?.destroy();
    this.rendererA?.destroy();
    this.rendererB?.destroy();
    this.diffCamera = null;
    this.cameraA = null;
    this.cameraB = null;
    this.rendererA = null;
    this.rendererB = null;
    this.diffCanvas = null;
    this.canvasA = null;
    this.canvasB = null;
    this.labelAEl = null;
    this.labelBEl = null;
    this.compositeCtx = null;

    this.container?.remove();
    this.container = null;
    this.toolbar?.remove();
    this.toolbar = null;

    this.mainCanvas.style.display = 'block';
  }

  private createDropZone(side: 'a' | 'b'): HTMLDivElement {
    const zone = document.createElement('div');
    zone.className = `diff-drop-zone diff-drop-${side}`;
    zone.style.cssText = `
      position:absolute;top:0;${side === 'a' ? 'left:0' : 'right:0'};
      width:50%;height:100%;z-index:2;
    `;

    let dragCounter = 0;
    zone.addEventListener('dragenter', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (dragCounter === 1) {
        zone.style.background = side === 'a'
          ? 'rgba(78,205,130,0.08)'
          : 'rgba(232,116,97,0.08)';
        zone.style.outline = `2px solid ${side === 'a' ? '#4ecd82' : '#e87461'}`;
        zone.style.outlineOffset = '-2px';
      }
    });

    zone.addEventListener('dragleave', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        zone.style.background = 'transparent';
        zone.style.outline = 'none';
      }
    });

    zone.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    zone.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      zone.style.background = 'transparent';
      zone.style.outline = 'none';

      const file = e.dataTransfer?.files[0];
      if (!file) return;

      const name = file.name.toLowerCase();
      if (!name.endsWith('.splat') && !name.endsWith('.ply')) return;

      const buffer = await file.arrayBuffer();
      const data = name.endsWith('.ply')
        ? parsePlyBuffer(buffer)
        : parseSplatBuffer(buffer);

      const renderer = side === 'a' ? this.rendererA : this.rendererB;
      const camera = side === 'a' ? this.cameraA : this.cameraB;
      if (!renderer || !camera) return;

      renderer.loadSplats(data);
      const bounds = computeBounds(data);
      camera.frameBounds(bounds.center, bounds.extent);

      if (side === 'a') {
        this.labelA = file.name;
        this.dataA = data;
      } else {
        this.labelB = file.name;
        this.dataB = data;
      }
      this.updateLabels();

      // Sync all cameras
      if (this.diffCamera && this.cameraA && this.cameraB) {
        const state = camera.getOrbitalState();
        this.diffCamera.setOrbitalState(state);
        (side === 'a' ? this.cameraB : this.cameraA).setOrbitalState(state);
      }
    });

    return zone;
  }

  private sizeCanvas() {
    if (!this.diffCanvas) return;
    this.diffCanvas.width = window.innerWidth;
    this.diffCanvas.height = window.innerHeight;
  }

  private sizeOffscreenCanvases() {
    if (!this.canvasA || !this.canvasB) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvasA.width = w;
    this.canvasA.height = h;
    this.canvasB.width = w;
    this.canvasB.height = h;
  }

  private onResize = () => {
    this.sizeCanvas();
    this.sizeOffscreenCanvases();
  };

  private updateLabels() {
    if (this.labelAEl) this.labelAEl.textContent = `A: ${this.labelA}`;
    if (this.labelBEl) this.labelBEl.textContent = `B: ${this.labelB}`;
  }

  private startRenderLoop() {
    if (this.animating) return;
    this.animating = true;

    const frame = () => {
      if (!this.animating) return;

      // Sync the interactive camera to both offscreen cameras
      if (this.diffCamera && this.cameraA && this.cameraB) {
        const state = this.diffCamera.getOrbitalState();
        this.cameraA.setOrbitalState(state);
        this.cameraB.setOrbitalState(state);
      }

      // Render both scenes
      this.rendererA?.render();
      this.rendererB?.render();

      // Composite onto visible canvas
      this.composite();

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private composite() {
    const ctx = this.compositeCtx;
    if (!ctx || !this.diffCanvas || !this.canvasA || !this.canvasB) return;

    const w = this.diffCanvas.width;
    const h = this.diffCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Draw version A with (1 - blend) opacity
    ctx.globalAlpha = 1 - this.blendValue;
    ctx.drawImage(this.canvasA, 0, 0, w, h);

    // Draw version B with blend opacity on top
    ctx.globalAlpha = this.blendValue;
    ctx.drawImage(this.canvasB, 0, 0, w, h);

    ctx.globalAlpha = 1;
  }

  isActive(): boolean {
    return this.active;
  }
}
