import { SyncManager } from './sync';
import { OrbitCamera } from '../renderer/camera';
import { SplatRenderer } from '../renderer/splat-renderer';

/**
 * WebXR immersive viewing — enter the shared splat scene in VR or AR
 * via the WebXR Device API, with camera sync to flat-screen users.
 */
export class WebXRManager {
  private panel: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private active = false;
  private xrSupported = false;
  private xrSession: XRSession | null = null;
  private statusLabel!: HTMLSpanElement;
  private enterBtn!: HTMLButtonElement;
  private exitBtn!: HTMLButtonElement;
  private modeSelect!: HTMLSelectElement;
  private infoLabel!: HTMLSpanElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private sync: SyncManager,
    private camera: OrbitCamera,
    private renderer: SplatRenderer,
  ) {
    this.toggleBtn = this.createToggleButton();
    this.panel = this.createPanel();
    document.body.appendChild(this.toggleBtn);
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', this.onKeyDown);

    this.detectXRSupport();

    // Listen for remote XR state via awareness
    this.sync.awareness.on('change', () => {
      this.updateRemoteXRStatus();
    });
  }

  private async detectXRSupport() {
    if (!navigator.xr) {
      this.setUnsupported('WebXR not available');
      return;
    }
    try {
      const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
      const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
      if (vrSupported || arSupported) {
        this.xrSupported = true;
        this.enterBtn.disabled = false;
        this.statusLabel.textContent = 'Ready';
        this.statusLabel.style.color = '#4ecdc4';

        // Update mode options based on support
        this.modeSelect.innerHTML = '';
        if (vrSupported) {
          const opt = document.createElement('option');
          opt.value = 'immersive-vr';
          opt.textContent = 'VR';
          this.modeSelect.appendChild(opt);
        }
        if (arSupported) {
          const opt = document.createElement('option');
          opt.value = 'immersive-ar';
          opt.textContent = 'AR';
          this.modeSelect.appendChild(opt);
        }
      } else {
        this.setUnsupported('No VR/AR sessions supported');
      }
    } catch {
      this.setUnsupported('XR detection failed');
    }
  }

  private setUnsupported(reason: string) {
    this.xrSupported = false;
    this.enterBtn.disabled = true;
    this.statusLabel.textContent = reason;
    this.statusLabel.style.color = '#ff6b6b';
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.toggle();
    }
  };

  private toggle() {
    this.active = !this.active;
    this.panel.style.display = this.active ? 'block' : 'none';
    this.toggleBtn.style.borderColor = this.active ? '#4ecdc4' : 'transparent';
  }

  private async enterXR() {
    if (!navigator.xr || !this.xrSupported) return;

    const mode = this.modeSelect.value as XRSessionMode;
    try {
      const session = await navigator.xr.requestSession(mode, {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking'],
      });

      this.xrSession = session;
      this.enterBtn.style.display = 'none';
      this.exitBtn.style.display = 'inline-block';
      this.statusLabel.textContent = `In ${mode === 'immersive-vr' ? 'VR' : 'AR'}`;
      this.statusLabel.style.color = '#45b7d1';
      this.modeSelect.disabled = true;

      // Broadcast XR state to other users
      this.sync.awareness.setLocalStateField('xr', {
        active: true,
        mode,
      });

      session.addEventListener('end', () => {
        this.onSessionEnd();
      });

      // Set up XR render loop
      const gl = this.canvas.getContext('webgl2', { xrCompatible: true });
      if (gl) {
        const baseLayer = new XRWebGLLayer(session, gl);
        await session.updateRenderState({ baseLayer });

        const refSpace = await session.requestReferenceSpace('local-floor');
        this.startXRRenderLoop(session, refSpace);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.statusLabel.textContent = `Error: ${msg}`;
      this.statusLabel.style.color = '#ff6b6b';
    }
  }

  private startXRRenderLoop(session: XRSession, refSpace: XRReferenceSpace) {
    const onFrame = (_time: DOMHighResTimeStamp, frame: XRFrame) => {
      if (!this.xrSession) return;

      session.requestAnimationFrame(onFrame);

      const pose = frame.getViewerPose(refSpace);
      if (!pose) return;

      // Extract the viewer's position and forward direction
      const transform = pose.transform;
      const pos = transform.position;

      // Broadcast XR head position as camera state so flat-screen users can see
      const camPos: [number, number, number] = [pos.x, pos.y, pos.z];
      const currentState = this.camera.getOrbitalState();
      this.sync.setLocalCamera({
        ...currentState,
        target: camPos,
      });
    };

    session.requestAnimationFrame(onFrame);
  }

  private async exitXR() {
    if (this.xrSession) {
      await this.xrSession.end();
    }
  }

  private onSessionEnd() {
    this.xrSession = null;
    this.enterBtn.style.display = 'inline-block';
    this.exitBtn.style.display = 'none';
    this.statusLabel.textContent = this.xrSupported ? 'Ready' : 'Unsupported';
    this.statusLabel.style.color = this.xrSupported ? '#4ecdc4' : '#ff6b6b';
    this.modeSelect.disabled = false;

    this.sync.awareness.setLocalStateField('xr', {
      active: false,
      mode: null,
    });
  }

  private updateRemoteXRStatus() {
    const states = this.sync.awareness.getStates();
    const localId = this.sync.awareness.clientID;
    const xrUsers: string[] = [];

    states.forEach((state, clientId) => {
      if (clientId !== localId) {
        const xr = state['xr'] as { active: boolean; mode: string | null } | undefined;
        const presence = state['presence'] as { name: string } | undefined;
        if (xr && xr.active && presence) {
          xrUsers.push(`${presence.name} (${xr.mode === 'immersive-vr' ? 'VR' : 'AR'})`);
        }
      }
    });

    if (xrUsers.length > 0) {
      this.infoLabel.textContent = `Immersive: ${xrUsers.join(', ')}`;
      this.infoLabel.style.display = 'block';
    } else {
      this.infoLabel.style.display = 'none';
    }
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'webxr-toggle-btn';
    btn.textContent = '\u{1F576}'; // dark sunglasses (VR goggles)
    btn.title = 'WebXR Immersive View (W)';
    btn.style.cssText = `
      position:absolute;bottom:174px;right:12px;
      width:36px;height:36px;border:2px solid transparent;border-radius:6px;
      background:rgba(30,30,50,0.85);cursor:pointer;font-size:18px;
      display:flex;align-items:center;justify-content:center;
      color:white;pointer-events:auto;z-index:100;
    `;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'webxr-panel';
    panel.style.cssText = `
      display:none;position:absolute;bottom:218px;right:12px;z-index:200;
      width:260px;background:rgba(22,33,62,0.95);color:#fff;font-family:monospace;
      border-radius:8px;padding:12px;font-size:13px;
      border:1px solid rgba(255,255,255,0.12);
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = 'WebXR Immersive';
    title.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;color:#4ecdc4;';
    panel.appendChild(title);

    // Status row
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    const statusLbl = document.createElement('span');
    statusLbl.textContent = 'Status:';
    this.statusLabel = document.createElement('span');
    this.statusLabel.id = 'webxr-status';
    this.statusLabel.textContent = 'Detecting...';
    this.statusLabel.style.color = '#888';
    statusRow.appendChild(statusLbl);
    statusRow.appendChild(this.statusLabel);
    panel.appendChild(statusRow);

    // Mode selector
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    const modeLbl = document.createElement('span');
    modeLbl.textContent = 'Mode:';
    this.modeSelect = document.createElement('select');
    this.modeSelect.id = 'webxr-mode-select';
    this.modeSelect.style.cssText = `
      background:#16213e;color:#fff;border:1px solid #444;border-radius:4px;
      padding:2px 6px;font-family:monospace;font-size:12px;
    `;
    const vrOpt = document.createElement('option');
    vrOpt.value = 'immersive-vr';
    vrOpt.textContent = 'VR';
    const arOpt = document.createElement('option');
    arOpt.value = 'immersive-ar';
    arOpt.textContent = 'AR';
    this.modeSelect.appendChild(vrOpt);
    this.modeSelect.appendChild(arOpt);
    modeRow.appendChild(modeLbl);
    modeRow.appendChild(this.modeSelect);
    panel.appendChild(modeRow);

    // Enter/Exit buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';

    this.enterBtn = document.createElement('button');
    this.enterBtn.id = 'webxr-enter-btn';
    this.enterBtn.textContent = 'Enter XR';
    this.enterBtn.disabled = true;
    this.enterBtn.style.cssText = `
      flex:1;padding:6px;background:#4ecdc4;color:#1a1a2e;border:none;
      border-radius:4px;cursor:pointer;font-family:monospace;font-weight:bold;
      font-size:12px;
    `;
    this.enterBtn.addEventListener('click', () => this.enterXR());

    this.exitBtn = document.createElement('button');
    this.exitBtn.id = 'webxr-exit-btn';
    this.exitBtn.textContent = 'Exit XR';
    this.exitBtn.style.cssText = `
      flex:1;padding:6px;background:#ff6b6b;color:#fff;border:none;
      border-radius:4px;cursor:pointer;font-family:monospace;font-weight:bold;
      font-size:12px;display:none;
    `;
    this.exitBtn.addEventListener('click', () => this.exitXR());

    btnRow.appendChild(this.enterBtn);
    btnRow.appendChild(this.exitBtn);
    panel.appendChild(btnRow);

    // Remote XR users info
    this.infoLabel = document.createElement('span');
    this.infoLabel.id = 'webxr-remote-info';
    this.infoLabel.style.cssText = 'display:none;font-size:11px;color:#888;';
    panel.appendChild(this.infoLabel);

    return panel;
  }
}
