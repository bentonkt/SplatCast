export interface SplatData {
  positions: Float32Array;
  colors: Float32Array;
  covariances: Float32Array;
  count: number;
}

export type AnnotationType = 'pin' | 'arrow' | 'text';

export interface Annotation {
  id: string;
  type: AnnotationType;
  position: [number, number, number];
  endPosition?: [number, number, number];
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
