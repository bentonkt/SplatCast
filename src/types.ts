export interface SplatData {
  positions: Float32Array;
  colors: Float32Array;
  covariances: Float32Array;
  count: number;
}

export interface Annotation {
  id: string;
  position: [number, number, number];
  label: string;
  color: string;
  userId: string;
  timestamp: number;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
}

export interface CursorPresence {
  userId: string;
  color: string;
  x: number;
  y: number;
  name: string;
}
