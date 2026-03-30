export interface SplatData {
  positions: Float32Array;
  colors: Float32Array;
  covariances: Float32Array;
  count: number;
}

export type AnnotationType = 'pin' | 'arrow' | 'text' | 'measurement';

export interface Annotation {
  id: string;
  type: AnnotationType;
  position: [number, number, number];
  endPosition?: [number, number, number];
  label: string;
  color: string;
  userId: string;
  timestamp: number;
  parentId?: string;
}

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
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

export interface UserPresence {
  userId: string;
  color: string;
  name: string;
}

export interface SceneBounds {
  center: [number, number, number];
  extent: number;
}

export interface ClipPlanes {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface Bookmark {
  id: string;
  name: string;
  theta: number;
  phi: number;
  radius: number;
  target: [number, number, number];
  userId: string;
  color: string;
  timestamp: number;
}

export interface TourState {
  playing: boolean;
  currentIndex: number;
  bookmarkIds: string[];
  startedBy: string;
}
