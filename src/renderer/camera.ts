import { CameraState } from '../types';

export class OrbitCamera {
  private theta: number = 0;      // horizontal angle (radians)
  private phi: number = Math.PI / 4; // vertical angle (radians, 0=top, pi=bottom)
  private radius: number = 5;
  private target: [number, number, number] = [0, 0, 0];
  private fov: number = 60;

  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  // Touch state
  private lastTouchDistance = 0;
  private lastTouchX = 0;
  private lastTouchY = 0;

  private onMouseDown: (e: MouseEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onTouchStart: (e: TouchEvent) => void;
  private onTouchMove: (e: TouchEvent) => void;
  private onTouchEnd: (e: TouchEvent) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };

    this.onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      this.theta -= dx * 0.005;
      this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi + dy * 0.005));
    };

    this.onMouseUp = () => {
      this.isDragging = false;
    };

    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.radius = Math.max(0.5, Math.min(100, this.radius + e.deltaY * 0.01));
    };

    this.onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastTouchX = e.touches[0].clientX;
        this.lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      }
    };

    this.onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.lastTouchX;
        const dy = e.touches[0].clientY - this.lastTouchY;
        this.lastTouchX = e.touches[0].clientX;
        this.lastTouchY = e.touches[0].clientY;
        this.theta -= dx * 0.005;
        this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi + dy * 0.005));
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (this.lastTouchDistance > 0) {
          const scale = this.lastTouchDistance / dist;
          this.radius = Math.max(0.5, Math.min(100, this.radius * scale));
        }
        this.lastTouchDistance = dist;
      }
    };

    this.onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        this.isDragging = false;
        this.lastTouchDistance = 0;
      } else if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastTouchX = e.touches[0].clientX;
        this.lastTouchY = e.touches[0].clientY;
        this.lastTouchDistance = 0;
      }
    };

    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
  }

  getPosition(): [number, number, number] {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);
    return [
      this.target[0] + this.radius * sinPhi * cosTheta,
      this.target[1] + this.radius * cosPhi,
      this.target[2] + this.radius * sinPhi * sinTheta,
    ];
  }

  getState(): CameraState {
    return {
      position: this.getPosition(),
      target: [...this.target] as [number, number, number],
      up: [0, 1, 0],
      fov: this.fov,
    };
  }

  getViewMatrix(): Float32Array {
    const eye = this.getPosition();
    const center = this.target;
    const up: [number, number, number] = [0, 1, 0];
    return lookAt(eye, center, up);
  }

  getProjectionMatrix(aspect: number): Float32Array {
    return perspective(this.fov * (Math.PI / 180), aspect, 0.01, 1000);
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
  }
}

// ---- Matrix math (column-major, compatible with WebGPU/WGSL) ----

function lookAt(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number]
): Float32Array {
  const f = normalize([
    center[0] - eye[0],
    center[1] - eye[1],
    center[2] - eye[2],
  ]);
  const r = normalize(cross(f, up));
  const u = cross(r, f);

  const m = new Float32Array(16);
  m[0]  =  r[0];  m[4]  =  r[1];  m[8]  =  r[2];  m[12] = -dot(r, eye);
  m[1]  =  u[0];  m[5]  =  u[1];  m[9]  =  u[2];  m[13] = -dot(u, eye);
  m[2]  = -f[0];  m[6]  = -f[1];  m[10] = -f[2];  m[14] =  dot(f, eye);
  m[3]  =  0;     m[7]  =  0;     m[11] =  0;     m[15] =  1;
  return m;
}

function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0]  = f / aspect;
  m[5]  = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
