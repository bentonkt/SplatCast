import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Annotation, Bookmark, ClipPlanes, CursorPresence, Stroke, TourState, UserPresence } from '../types';
import { Awareness } from 'y-protocols/awareness';

export class SyncManager {
  doc: Y.Doc;
  provider: WebsocketProvider;
  annotationMap: Y.Map<Annotation>;
  awareness: Awareness;
  strokes: Y.Array<Stroke>;
  bookmarks: Y.Map<Bookmark>;
  clipPlanes: Y.Map<number>;
  undoManager: Y.UndoManager;

  constructor(roomId: string, serverUrl = 'ws://localhost:4000') {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(serverUrl, roomId, this.doc);
    this.annotationMap = this.doc.getMap<Annotation>('annotationMap');
    this.awareness = this.provider.awareness;
    this.strokes = this.doc.getArray<Stroke>('strokes');
    this.bookmarks = this.doc.getMap<Bookmark>('bookmarks');
    this.clipPlanes = this.doc.getMap<number>('clipPlanes');
    this.undoManager = new Y.UndoManager([this.annotationMap, this.strokes, this.bookmarks], { captureTimeout: 0 });
  }

  addAnnotation(annotation: Annotation) {
    this.annotationMap.set(annotation.id, annotation);
  }

  updateAnnotation(id: string, updates: Partial<Pick<Annotation, 'label' | 'parentId'>>) {
    const existing = this.annotationMap.get(id);
    if (existing) {
      this.annotationMap.set(id, { ...existing, ...updates });
    }
  }

  onAnnotationsChange(callback: (annotations: Annotation[]) => void) {
    this.annotationMap.observe(() => {
      callback(this.getAnnotations());
    });
  }

  getAnnotations(): Annotation[] {
    return Array.from(this.annotationMap.values());
  }

  getReplies(parentId: string): Annotation[] {
    return this.getAnnotations()
      .filter((a) => a.parentId === parentId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  setLocalCursor(cursor: CursorPresence) {
    this.awareness.setLocalStateField('cursor', cursor);
  }

  onCursorChange(callback: (cursors: Map<number, CursorPresence>) => void) {
    this.awareness.on('change', () => {
      const cursors = new Map<number, CursorPresence>();
      const localId = this.awareness.clientID;
      this.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== localId && state['cursor']) {
          cursors.set(clientId, state['cursor'] as CursorPresence);
        }
      });
      callback(cursors);
    });
  }

  getLocalClientId(): number {
    return this.awareness.clientID;
  }

  setLocalPresence(presence: UserPresence) {
    this.awareness.setLocalStateField('presence', presence);
  }

  onPresenceChange(callback: (users: UserPresence[]) => void) {
    let lastSnapshot = '';
    const handler = () => {
      const users = this.getPresences();
      const snapshot = JSON.stringify(users);
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        callback(users);
      }
    };
    this.awareness.on('change', handler);
    this.awareness.on('update', handler);
  }

  getPresences(): UserPresence[] {
    const users: UserPresence[] = [];
    this.awareness.getStates().forEach((state) => {
      if (state['presence']) {
        users.push(state['presence'] as UserPresence);
      }
    });
    return users;
  }

  addStroke(stroke: Stroke) {
    this.strokes.push([stroke]);
  }

  onStrokesChange(callback: (strokes: Stroke[]) => void) {
    this.strokes.observe(() => {
      callback(this.strokes.toArray());
    });
  }

  getStrokes(): Stroke[] {
    return this.strokes.toArray();
  }

  undo() {
    this.undoManager.undo();
  }

  redo() {
    this.undoManager.redo();
  }

  canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }

  onUndoRedoChange(callback: (canUndo: boolean, canRedo: boolean) => void) {
    const handler = () => callback(this.canUndo(), this.canRedo());
    this.undoManager.on('stack-item-added', handler);
    this.undoManager.on('stack-item-popped', handler);
    this.undoManager.on('stack-cleared', handler);
  }

  addBookmark(bookmark: Bookmark) {
    this.bookmarks.set(bookmark.id, bookmark);
  }

  removeBookmark(id: string) {
    this.bookmarks.delete(id);
  }

  getBookmarks(): Bookmark[] {
    return Array.from(this.bookmarks.values());
  }

  onBookmarksChange(callback: (bookmarks: Bookmark[]) => void) {
    this.bookmarks.observe(() => {
      callback(this.getBookmarks());
    });
  }

  setClipPlanes(planes: ClipPlanes) {
    this.doc.transact(() => {
      this.clipPlanes.set('xMin', planes.xMin);
      this.clipPlanes.set('xMax', planes.xMax);
      this.clipPlanes.set('yMin', planes.yMin);
      this.clipPlanes.set('yMax', planes.yMax);
      this.clipPlanes.set('zMin', planes.zMin);
      this.clipPlanes.set('zMax', planes.zMax);
    });
  }

  getClipPlanes(): ClipPlanes | null {
    if (!this.clipPlanes.has('xMin')) return null;
    return {
      xMin: this.clipPlanes.get('xMin')!,
      xMax: this.clipPlanes.get('xMax')!,
      yMin: this.clipPlanes.get('yMin')!,
      yMax: this.clipPlanes.get('yMax')!,
      zMin: this.clipPlanes.get('zMin')!,
      zMax: this.clipPlanes.get('zMax')!,
    };
  }

  onClipPlanesChange(callback: (planes: ClipPlanes | null) => void) {
    this.clipPlanes.observe(() => {
      callback(this.getClipPlanes());
    });
  }

  setTourState(state: TourState | null) {
    this.awareness.setLocalStateField('tour', state);
  }

  getTourState(): TourState | null {
    const states = this.awareness.getStates();
    for (const [, state] of states) {
      const tour = state['tour'] as TourState | undefined;
      if (tour && tour.playing) {
        return tour;
      }
    }
    return null;
  }

  onTourStateChange(callback: (state: TourState | null) => void) {
    this.awareness.on('change', () => {
      callback(this.getTourState());
    });
  }

  destroy() {
    this.undoManager.destroy();
    this.provider.destroy();
    this.doc.destroy();
  }
}
