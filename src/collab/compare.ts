import { SplatRenderer, loadSplatScene, parseSplatBuffer, parsePlyBuffer, computeBounds } from '../renderer/splat-renderer';
import { OrbitCamera } from '../renderer/camera';
import { SplatData } from '../types';

export class ComparePanel {
  private toggleBtn: HTMLButtonElement;
  private active = false;
  private container: HTMLDivElement | null = null;
  private leftCanvas: HTMLCanvasElement | null = null;
  private rightCanvas: HTMLCanvasElement | null = null;
  private leftCamera: OrbitCamera | null = null;
  private rightCamera: OrbitCamera | null = null;
  private leftRenderer: SplatRenderer | null = null;
  private rightRenderer: SplatRenderer | null = null;
  private syncCameras = true;
  private animating = false;
  private leftLabel = 'sample.splat';
  private rightLabel = '(drop file)';
  private leftLabelEl: HTMLDivElement | null = null;
  private rightLabelEl: HTMLDivElement | null = null;
  private leftData: SplatData | null = null;
  private rightData: SplatData | null = null;
  private toolbar: HTMLDivElement | null = null;

  constructor(
    private mainCanvas: HTMLCanvasElement,
    private mainCamera: OrbitCamera,
    private mainRenderer: SplatRenderer,
  ) {
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'compare-toggle';
    this.toggleBtn.textContent = 'Compare';
    this.toggleBtn.style.cssText = `
      position:absolute;bottom:12px;left:340px;
      background:rgba(255,255,255,0.12);
      border:1px solid rgba(255,255,255,0.2);border-radius:6px;
      color:#fff;font-family:monospace;font-size:13px;
      padding:6px 14px;cursor:pointer;z-index:100;
    `;
    this.toggleBtn.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.toggleBtn);

    // Keyboard shortcut: C key
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
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
    this.toggleBtn.style.background = '#4ecdc4';
    this.toggleBtn.style.color = '#1a1a2e';

    document.dispatchEvent(new CustomEvent('compare-mode-change', { detail: { active: true } }));

    // Hide main canvas
    this.mainCanvas.style.display = 'none';

    // Create split container
    this.container = document.createElement('div');
    this.container.id = 'compare-container';
    this.container.style.cssText = `
      position:fixed;inset:0;display:flex;z-index:1;
      background:#000;
    `;

    // Left pane
    const leftPane = this.createPane('left');
    this.container.appendChild(leftPane);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `width:2px;background:rgba(255,255,255,0.3);flex-shrink:0;`;
    this.container.appendChild(divider);

    // Right pane
    const rightPane = this.createPane('right');
    this.container.appendChild(rightPane);

    document.body.appendChild(this.container);

    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'compare-toolbar';
    toolbar.style.cssText = `
      position:fixed;top:12px;left:50%;transform:translateX(-50%);
      background:rgba(30,30,50,0.9);border:1px solid rgba(255,255,255,0.15);
      border-radius:8px;padding:6px 14px;z-index:3000;
      display:flex;gap:12px;align-items:center;
      font-family:monospace;font-size:13px;color:#fff;
    `;

    const syncLabel = document.createElement('label');
    syncLabel.style.cssText = `display:flex;align-items:center;gap:6px;cursor:pointer;`;
    const syncCheckbox = document.createElement('input');
    syncCheckbox.type = 'checkbox';
    syncCheckbox.checked = this.syncCameras;
    syncCheckbox.id = 'compare-sync-toggle';
    syncCheckbox.addEventListener('change', () => {
      this.syncCameras = syncCheckbox.checked;
    });
    syncLabel.appendChild(syncCheckbox);
    syncLabel.appendChild(document.createTextNode('Sync cameras'));
    toolbar.appendChild(syncLabel);

    const swapBtn = document.createElement('button');
    swapBtn.id = 'compare-swap';
    swapBtn.textContent = 'Swap';
    swapBtn.style.cssText = `
      background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);
      border-radius:4px;color:#fff;font-family:monospace;font-size:12px;
      padding:3px 10px;cursor:pointer;
    `;
    swapBtn.addEventListener('click', () => this.swap());
    toolbar.appendChild(swapBtn);

    document.body.appendChild(toolbar);
    this.toolbar = toolbar;

    // Initialize renderers
    this.leftCanvas = leftPane.querySelector('canvas')!;
    this.rightCanvas = rightPane.querySelector('canvas')!;
    this.leftLabelEl = leftPane.querySelector('.compare-label') as HTMLDivElement;
    this.rightLabelEl = rightPane.querySelector('.compare-label') as HTMLDivElement;

    this.sizeCanvases();
    window.addEventListener('resize', this.onResize);

    this.leftCamera = new OrbitCamera(this.leftCanvas);
    this.rightCamera = new OrbitCamera(this.rightCanvas);

    // Copy current main camera state to both
    const camState = this.mainCamera.getOrbitalState();
    this.leftCamera.setOrbitalState(camState);
    this.rightCamera.setOrbitalState(camState);

    this.leftRenderer = new SplatRenderer(this.leftCanvas, this.leftCamera);
    this.rightRenderer = new SplatRenderer(this.rightCanvas, this.rightCamera);

    if (!this.leftRenderer || !this.rightRenderer) { this.deactivate(); return; }
    const leftOk = await this.leftRenderer.init();
    if (!this.active || !this.rightRenderer) { this.deactivate(); return; }
    const rightOk = await this.rightRenderer.init();

    if (!leftOk || !rightOk || !this.active) { this.deactivate(); return; }

    // Load current scene data into left pane by re-fetching the default sample
    try {
      const splatData = await loadSplatScene('/sample.splat');
      this.leftData = splatData;
      this.leftRenderer.loadSplats(splatData);
      const bounds = computeBounds(splatData);
      this.leftCamera.frameBounds(bounds.center, bounds.extent);
      if (this.syncCameras) {
        this.rightCamera.setOrbitalState(this.leftCamera.getOrbitalState());
      }
    } catch {
      // Scene may not be available in tests
    }

    this.updateLabels();

    // Set up drag-and-drop for each pane
    this.setupPaneDrop(leftPane, 'left');
    this.setupPaneDrop(rightPane, 'right');

    // Start render loop
    this.startRenderLoop();
  }

  private deactivate() {
    this.active = false;
    this.toggleBtn.style.background = 'rgba(255,255,255,0.12)';
    this.toggleBtn.style.color = '#fff';
    this.animating = false;

    document.dispatchEvent(new CustomEvent('compare-mode-change', { detail: { active: false } }));

    window.removeEventListener('resize', this.onResize);

    // Copy camera state back to main
    if (this.leftCamera) {
      this.mainCamera.setOrbitalState(this.leftCamera.getOrbitalState());
    }

    // Cleanup
    this.leftCamera?.destroy();
    this.rightCamera?.destroy();
    this.leftRenderer?.destroy();
    this.rightRenderer?.destroy();
    this.leftCamera = null;
    this.rightCamera = null;
    this.leftRenderer = null;
    this.rightRenderer = null;
    this.leftCanvas = null;
    this.rightCanvas = null;
    this.leftLabelEl = null;
    this.rightLabelEl = null;

    this.container?.remove();
    this.container = null;
    this.toolbar?.remove();
    this.toolbar = null;

    // Restore main canvas
    this.mainCanvas.style.display = 'block';
  }

  private createPane(side: 'left' | 'right'): HTMLDivElement {
    const pane = document.createElement('div');
    pane.className = `compare-pane compare-pane-${side}`;
    pane.style.cssText = `
      flex:1;position:relative;overflow:hidden;
    `;

    const canvas = document.createElement('canvas');
    canvas.id = `compare-canvas-${side}`;
    canvas.style.cssText = `display:block;width:100%;height:100%;touch-action:none;`;
    pane.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'compare-label';
    label.style.cssText = `
      position:absolute;top:8px;left:50%;transform:translateX(-50%);
      background:rgba(30,30,50,0.85);border:1px solid rgba(255,255,255,0.15);
      border-radius:6px;padding:4px 12px;
      font-family:monospace;font-size:12px;color:#aaa;
      pointer-events:none;white-space:nowrap;
    `;
    label.textContent = side === 'left' ? this.leftLabel : this.rightLabel;
    pane.appendChild(label);

    // Drop zone hint (shown when no data loaded on right side)
    if (side === 'right') {
      const dropHint = document.createElement('div');
      dropHint.className = 'compare-drop-hint';
      dropHint.style.cssText = `
        position:absolute;inset:0;display:flex;
        align-items:center;justify-content:center;
        pointer-events:none;
      `;
      const dropText = document.createElement('div');
      dropText.style.cssText = `
        border:2px dashed rgba(255,255,255,0.2);border-radius:12px;
        padding:32px 40px;text-align:center;
        font-family:monospace;font-size:14px;color:rgba(255,255,255,0.4);
      `;
      dropText.textContent = 'Drop .splat or .ply file here';
      dropHint.appendChild(dropText);
      pane.appendChild(dropHint);
    }

    return pane;
  }

  private sizeCanvases() {
    if (!this.leftCanvas || !this.rightCanvas || !this.container) return;
    const w = Math.floor((window.innerWidth - 2) / 2);
    const h = window.innerHeight;
    this.leftCanvas.width = w;
    this.leftCanvas.height = h;
    this.rightCanvas.width = w;
    this.rightCanvas.height = h;
  }

  private onResize = () => {
    this.sizeCanvases();
  };

  private setupPaneDrop(pane: HTMLDivElement, side: 'left' | 'right') {
    let dragCounter = 0;

    pane.addEventListener('dragenter', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (dragCounter === 1) {
        pane.style.outline = '2px solid #4ecdc4';
        pane.style.outlineOffset = '-2px';
      }
    });

    pane.addEventListener('dragleave', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        pane.style.outline = 'none';
      }
    });

    pane.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    pane.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      pane.style.outline = 'none';

      const file = e.dataTransfer?.files[0];
      if (!file) return;

      const name = file.name.toLowerCase();
      if (!name.endsWith('.splat') && !name.endsWith('.ply')) return;

      const buffer = await file.arrayBuffer();
      const data = name.endsWith('.ply')
        ? parsePlyBuffer(buffer)
        : parseSplatBuffer(buffer);

      const renderer = side === 'left' ? this.leftRenderer : this.rightRenderer;
      const camera = side === 'left' ? this.leftCamera : this.rightCamera;

      if (!renderer || !camera) return;

      renderer.loadSplats(data);
      const bounds = computeBounds(data);
      camera.frameBounds(bounds.center, bounds.extent);

      if (side === 'left') {
        this.leftLabel = file.name;
        this.leftData = data;
      } else {
        this.rightLabel = file.name;
        this.rightData = data;
        // Hide the drop hint
        const hint = pane.querySelector('.compare-drop-hint') as HTMLDivElement | null;
        if (hint) hint.style.display = 'none';
      }
      this.updateLabels();

      // Sync camera if enabled
      if (this.syncCameras) {
        const otherCamera = side === 'left' ? this.rightCamera : this.leftCamera;
        otherCamera?.setOrbitalState(camera.getOrbitalState());
      }
    });
  }

  private updateLabels() {
    if (this.leftLabelEl) this.leftLabelEl.textContent = this.leftLabel;
    if (this.rightLabelEl) this.rightLabelEl.textContent = this.rightLabel;
  }

  private swap() {
    // Swap data
    const tmpData = this.leftData;
    this.leftData = this.rightData;
    this.rightData = tmpData;

    const tmpLabel = this.leftLabel;
    this.leftLabel = this.rightLabel;
    this.rightLabel = tmpLabel;

    // Reload into renderers (clear when data is null)
    if (this.leftRenderer) {
      if (this.leftData) {
        this.leftRenderer.loadSplats(this.leftData);
      } else {
        this.leftRenderer.clearSplats();
      }
    }
    if (this.rightRenderer) {
      if (this.rightData) {
        this.rightRenderer.loadSplats(this.rightData);
      } else {
        this.rightRenderer.clearSplats();
      }
    }

    this.updateLabels();
  }

  private startRenderLoop() {
    if (this.animating) return;
    this.animating = true;

    let lastLeftState: string | null = null;
    let lastRightState: string | null = null;

    const frame = () => {
      if (!this.animating) return;

      // Camera sync: detect which camera changed, propagate to the other
      if (this.syncCameras && this.leftCamera && this.rightCamera) {
        const ls = this.leftCamera.getOrbitalState();
        const rs = this.rightCamera.getOrbitalState();
        const lsKey = `${ls.theta},${ls.phi},${ls.radius},${ls.target.join(',')}`;
        const rsKey = `${rs.theta},${rs.phi},${rs.radius},${rs.target.join(',')}`;

        if (lsKey !== lastLeftState && lastLeftState !== null) {
          // Left camera changed — push to right
          this.rightCamera.setOrbitalState(ls);
          lastRightState = lsKey;
        } else if (rsKey !== lastRightState && lastRightState !== null) {
          // Right camera changed — push to left
          this.leftCamera.setOrbitalState(rs);
          lastLeftState = rsKey;
        }
        lastLeftState = lsKey;
        lastRightState = rsKey;
      }

      this.leftRenderer?.render();
      this.rightRenderer?.render();

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  isActive(): boolean {
    return this.active;
  }
}
