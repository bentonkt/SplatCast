import { FlythroughKeyframe } from '../types';
import { SyncManager } from './sync';
import { OrbitCamera } from '../renderer/camera';

const DEFAULT_DURATION = 2; // seconds per keyframe transition

export class FlythroughPanel {
  private panel: HTMLDivElement;
  private listEl: HTMLDivElement;
  private btn: HTMLButtonElement;
  private previewBtn: HTMLButtonElement;
  private exportBtn: HTMLButtonElement;
  private indicator: HTMLDivElement;

  private playing = false;
  private recording = false;
  private animationTimer: number | null = null;
  private holdTimer: number | null = null;
  private currentIndex = 0;
  private keyframes: FlythroughKeyframe[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
    private camera: OrbitCamera,
  ) {
    this.btn = this.createToggleButton();
    document.body.appendChild(this.btn);

    this.panel = this.createPanel();
    this.listEl = this.panel.querySelector('#flythrough-list') as HTMLDivElement;
    this.previewBtn = this.panel.querySelector('#flythrough-preview-btn') as HTMLButtonElement;
    this.exportBtn = this.panel.querySelector('#flythrough-export-btn') as HTMLButtonElement;
    document.body.appendChild(this.panel);

    this.indicator = this.createIndicator();
    document.body.appendChild(this.indicator);

    this.previewBtn.addEventListener('click', () => this.togglePreview());
    this.exportBtn.addEventListener('click', () => this.exportVideo());

    this.keyframes = this.sync.getFlythroughKeyframes();
    this.renderKeyframes();
    this.sync.onFlythroughKeyframesChange((kfs) => {
      this.keyframes = kfs;
      this.renderKeyframes();
    });

    document.addEventListener('keydown', this.onKeyDown);
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'flythrough-toggle-btn';
    btn.textContent = '\uD83C\uDFAC';
    btn.title = 'Camera flythrough (F)';
    btn.style.cssText = `
      position:absolute;bottom:12px;left:560px;
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(30,30,50,0.85);cursor:pointer;font-size:16px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;z-index:100;
    `;
    btn.addEventListener('click', () => this.togglePanel());
    return btn;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'flythrough-panel';
    panel.style.cssText = `
      position:absolute;bottom:60px;right:16px;
      display:none;flex-direction:column;gap:6px;
      padding:10px;min-width:260px;max-width:320px;
      background:rgba(30,30,50,0.92);border-radius:8px;
      border:1px solid rgba(255,255,255,0.15);z-index:100;
      font-family:system-ui,sans-serif;color:white;font-size:13px;
      pointer-events:auto;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.15);
      margin-bottom:2px;
    `;
    const title = document.createElement('span');
    title.textContent = 'Flythrough';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    header.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.id = 'flythrough-add-btn';
    addBtn.textContent = '+ Keyframe';
    addBtn.title = 'Add current camera as keyframe';
    addBtn.style.cssText = `
      padding:4px 10px;border:none;border-radius:4px;
      background:rgba(78,205,196,0.3);color:#4ecdc4;cursor:pointer;
      font-size:12px;font-weight:bold;
    `;
    addBtn.addEventListener('click', () => this.addKeyframe());
    header.appendChild(addBtn);
    panel.appendChild(header);

    const list = document.createElement('div');
    list.id = 'flythrough-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;';
    panel.appendChild(list);

    const controls = document.createElement('div');
    controls.style.cssText = `
      display:flex;gap:6px;padding-top:6px;
      border-top:1px solid rgba(255,255,255,0.15);margin-top:4px;
    `;

    const previewBtn = document.createElement('button');
    previewBtn.id = 'flythrough-preview-btn';
    previewBtn.textContent = '\u25B6 Preview';
    previewBtn.style.cssText = `
      flex:1;padding:6px;border:none;border-radius:4px;
      background:rgba(78,205,196,0.25);color:#4ecdc4;cursor:pointer;
      font-size:12px;font-weight:bold;
    `;
    controls.appendChild(previewBtn);

    const exportBtn = document.createElement('button');
    exportBtn.id = 'flythrough-export-btn';
    exportBtn.textContent = '\u23CF Export Video';
    exportBtn.style.cssText = `
      flex:1;padding:6px;border:none;border-radius:4px;
      background:rgba(255,107,107,0.25);color:#ff6b6b;cursor:pointer;
      font-size:12px;font-weight:bold;
    `;
    controls.appendChild(exportBtn);

    panel.appendChild(controls);
    return panel;
  }

  private createIndicator(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'flythrough-indicator';
    el.style.cssText = `
      position:absolute;top:50px;left:50%;transform:translateX(-50%);
      padding:6px 16px;border-radius:6px;
      background:rgba(30,30,50,0.9);border:1px solid rgba(255,107,107,0.4);
      font:13px system-ui,sans-serif;color:#ff6b6b;
      z-index:200;pointer-events:none;display:none;
    `;
    return el;
  }

  private togglePanel() {
    const visible = this.panel.style.display !== 'none';
    this.panel.style.display = visible ? 'none' : 'flex';
    this.btn.style.borderColor = visible ? 'transparent' : '#4ecdc4';
  }

  private addKeyframe() {
    const name = prompt('Keyframe name:', `KF ${this.keyframes.length + 1}`);
    if (!name || !name.trim()) return;

    const orbital = this.camera.getOrbitalState();
    const keyframe: FlythroughKeyframe = {
      id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      theta: orbital.theta,
      phi: orbital.phi,
      radius: orbital.radius,
      target: orbital.target,
      duration: DEFAULT_DURATION,
      timestamp: Date.now(),
    };
    this.sync.addFlythroughKeyframe(keyframe);
  }

  private renderKeyframes() {
    this.listEl.innerHTML = '';

    for (let i = 0; i < this.keyframes.length; i++) {
      const kf = this.keyframes[i];
      const item = document.createElement('div');
      item.className = 'flythrough-keyframe-item';
      item.dataset.keyframeId = kf.id;
      item.style.cssText = `
        display:flex;align-items:center;gap:6px;padding:4px 6px;
        border-radius:4px;background:rgba(255,255,255,0.05);
      `;

      const indexLabel = document.createElement('span');
      indexLabel.textContent = `${i + 1}.`;
      indexLabel.style.cssText = 'color:rgba(255,255,255,0.5);font-size:11px;min-width:18px;';
      item.appendChild(indexLabel);

      const nameLabel = document.createElement('span');
      nameLabel.textContent = kf.name;
      nameLabel.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      item.appendChild(nameLabel);

      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.min = '0.5';
      durationInput.max = '30';
      durationInput.step = '0.5';
      durationInput.value = String(kf.duration);
      durationInput.title = 'Duration (seconds)';
      durationInput.style.cssText = `
        width:42px;padding:2px 4px;border:1px solid rgba(255,255,255,0.2);
        border-radius:3px;background:rgba(0,0,0,0.3);color:white;
        font-size:11px;text-align:center;
      `;
      durationInput.addEventListener('change', () => {
        const newDuration = Math.max(0.5, Math.min(30, parseFloat(durationInput.value) || DEFAULT_DURATION));
        const updated: FlythroughKeyframe = { ...kf, duration: newDuration };
        this.sync.addFlythroughKeyframe(updated);
      });
      item.appendChild(durationInput);

      const sLabel = document.createElement('span');
      sLabel.textContent = 's';
      sLabel.style.cssText = 'color:rgba(255,255,255,0.4);font-size:11px;';
      item.appendChild(sLabel);

      const goBtn = document.createElement('button');
      goBtn.textContent = '\u27A4';
      goBtn.title = 'Go to keyframe';
      goBtn.style.cssText = `
        width:22px;height:22px;border:none;border-radius:3px;
        background:transparent;color:rgba(78,205,196,0.7);cursor:pointer;
        font-size:12px;display:flex;align-items:center;justify-content:center;
      `;
      goBtn.addEventListener('click', () => {
        this.camera.setOrbitalState({
          theta: kf.theta,
          phi: kf.phi,
          radius: kf.radius,
          target: kf.target,
        });
      });
      item.appendChild(goBtn);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'flythrough-remove-btn';
      removeBtn.textContent = '\u00d7';
      removeBtn.title = 'Remove keyframe';
      removeBtn.style.cssText = `
        width:22px;height:22px;border:none;border-radius:3px;
        background:transparent;color:rgba(255,255,255,0.4);cursor:pointer;
        font-size:14px;display:flex;align-items:center;justify-content:center;
      `;
      removeBtn.addEventListener('click', () => {
        this.sync.removeFlythroughKeyframe(kf.id);
      });
      item.appendChild(removeBtn);

      this.listEl.appendChild(item);
    }

    // Update button states
    const hasEnough = this.keyframes.length >= 2;
    this.previewBtn.style.opacity = hasEnough ? '1' : '0.4';
    this.previewBtn.style.pointerEvents = hasEnough ? 'auto' : 'none';
    this.exportBtn.style.opacity = hasEnough ? '1' : '0.4';
    this.exportBtn.style.pointerEvents = hasEnough ? 'auto' : 'none';
  }

  private togglePreview() {
    if (this.playing) {
      this.stopPlayback();
    } else {
      this.startPlayback(false);
    }
  }

  private startPlayback(forExport: boolean) {
    if (this.keyframes.length < 2) return;
    this.playing = true;
    this.currentIndex = 0;

    if (!forExport) {
      this.previewBtn.textContent = '\u23F9 Stop';
      this.previewBtn.style.background = 'rgba(255,107,107,0.25)';
      this.previewBtn.style.color = '#ff6b6b';
    }

    this.playStep();
  }

  private stopPlayback() {
    this.playing = false;
    if (this.animationTimer !== null) {
      cancelAnimationFrame(this.animationTimer);
      this.animationTimer = null;
    }
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.previewBtn.textContent = '\u25B6 Preview';
    this.previewBtn.style.background = 'rgba(78,205,196,0.25)';
    this.previewBtn.style.color = '#4ecdc4';
    this.indicator.style.display = 'none';

    if (this.recording) {
      this.finishRecording();
    }
  }

  private playStep() {
    if (!this.playing || this.currentIndex >= this.keyframes.length) {
      this.stopPlayback();
      return;
    }

    const target = this.keyframes[this.currentIndex];
    this.showIndicator(target.name, this.currentIndex + 1, this.keyframes.length);

    if (this.currentIndex === 0) {
      // Snap to first keyframe immediately
      this.camera.setOrbitalState({
        theta: target.theta,
        phi: target.phi,
        radius: target.radius,
        target: target.target,
      });
      this.currentIndex++;
      // Brief hold at first keyframe
      this.holdTimer = window.setTimeout(() => {
        this.holdTimer = null;
        this.playStep();
      }, 500);
      return;
    }

    const from = this.camera.getOrbitalState();
    const to = {
      theta: target.theta,
      phi: target.phi,
      radius: target.radius,
      target: target.target,
    };
    const durationMs = target.duration * 1000;

    const startTime = performance.now();
    const animate = (now: number) => {
      if (!this.playing) return;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = smootherstep(t);

      this.camera.setOrbitalState({
        theta: lerp(from.theta, to.theta, eased),
        phi: lerp(from.phi, to.phi, eased),
        radius: lerp(from.radius, to.radius, eased),
        target: [
          lerp(from.target[0], to.target[0], eased),
          lerp(from.target[1], to.target[1], eased),
          lerp(from.target[2], to.target[2], eased),
        ],
      });

      if (t < 1) {
        this.animationTimer = requestAnimationFrame(animate);
      } else {
        this.currentIndex++;
        if (this.currentIndex >= this.keyframes.length) {
          // Hold at last keyframe briefly, then stop
          this.holdTimer = window.setTimeout(() => {
            this.stopPlayback();
          }, 500);
        } else {
          this.playStep();
        }
      }
    };

    this.animationTimer = requestAnimationFrame(animate);
  }

  private showIndicator(name: string, step: number, total: number) {
    const prefix = this.recording ? '\uD83D\uDD34 Recording' : 'Flythrough';
    this.indicator.textContent = `${prefix}: ${name} (${step}/${total})`;
    this.indicator.style.display = 'block';
  }

  private async exportVideo() {
    if (this.keyframes.length < 2 || this.recording) return;

    // Create composite stream: WebGPU canvas + overlays
    const width = this.canvas.width;
    const height = this.canvas.height;

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = width;
    compositeCanvas.height = height;
    const compositeCtx = compositeCanvas.getContext('2d')!;

    // Capture stream from composite canvas at 30fps
    const stream = compositeCanvas.captureStream(30);

    // Check for supported mime types
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
    });
    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splatcast-flythrough-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      this.recording = false;
      this.exportBtn.textContent = '\u23CF Export Video';
      this.exportBtn.style.opacity = '1';
      this.exportBtn.style.pointerEvents = 'auto';
    };

    this.recording = true;
    this.exportBtn.textContent = '\u23F9 Recording...';
    this.mediaRecorder.start(100); // collect data every 100ms

    // Composite loop: copy main canvas + overlays to composite canvas each frame
    const compositeLoop = () => {
      if (!this.recording) return;
      compositeCtx.clearRect(0, 0, width, height);
      compositeCtx.drawImage(this.canvas, 0, 0);

      // Draw annotation overlays
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) {
        this.drawOverlayElements(compositeCtx, pinOverlay);
      }

      requestAnimationFrame(compositeLoop);
    };
    requestAnimationFrame(compositeLoop);

    // Start camera animation
    this.startPlayback(true);
  }

  private drawOverlayElements(ctx: CanvasRenderingContext2D, overlay: HTMLElement) {
    const children = overlay.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      if (el.tagName.toLowerCase() === 'svg') continue;

      const annotationType = el.dataset.annotationType;
      if (annotationType === 'pin') {
        this.drawPin(ctx, el);
      } else if (annotationType === 'text') {
        this.drawText(ctx, el);
      }
    }
  }

  private drawPin(ctx: CanvasRenderingContext2D, container: HTMLElement) {
    const left = parseFloat(container.style.left) + 8;
    const top = parseFloat(container.style.top) + 8;
    const dot = container.querySelector('.pin-dot') as HTMLElement | null;
    const color = dot ? dot.style.background : '#ff6b6b';

    ctx.beginPath();
    ctx.arc(left, top, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    const labelEl = container.querySelector('.pin-label') as HTMLElement | null;
    if (labelEl && labelEl.textContent) {
      const text = labelEl.textContent;
      ctx.font = '12px system-ui, sans-serif';
      const metrics = ctx.measureText(text);
      const labelWidth = metrics.width + 12;
      const labelHeight = 20;
      const labelX = left - labelWidth / 2;
      const labelY = top + 12;

      ctx.fillStyle = 'rgba(30,30,50,0.85)';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 3);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 3);
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, left, labelY + labelHeight / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawText(ctx: CanvasRenderingContext2D, el: HTMLElement) {
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    const text = el.textContent || '';
    const bgColor = el.style.background;

    ctx.font = 'bold 13px system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const w = metrics.width + 16;
    const h = 26;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, 4);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + 8, top + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  private finishRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.togglePanel();
    }
  };

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown);
    this.stopPlayback();
    this.btn.remove();
    this.panel.remove();
    this.indicator.remove();
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
