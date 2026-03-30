import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Annotation, CursorPresence, Stroke } from '../types';
import { Awareness } from 'y-protocols/awareness';

export class SyncManager {
  doc: Y.Doc;
  provider: WebsocketProvider;
  annotations: Y.Array<Annotation>;
  awareness: Awareness;
  strokes: Y.Array<Stroke>;

  constructor(roomId: string, serverUrl = 'ws://localhost:4000') {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(serverUrl, roomId, this.doc);
    this.annotations = this.doc.getArray<Annotation>('annotations');
    this.awareness = this.provider.awareness;
    this.strokes = this.doc.getArray<Stroke>('strokes');
  }

  addAnnotation(annotation: Annotation) {
    this.annotations.push([annotation]);
  }

  updateAnnotation(id: string, updates: Partial<Pick<Annotation, 'label'>>) {
    const arr = this.annotations;
    for (let i = 0; i < arr.length; i++) {
      const ann = arr.get(i);
      if (ann.id === id) {
        const updated: Annotation = { ...ann, ...updates };
        this.doc.transact(() => {
          arr.delete(i, 1);
          arr.insert(i, [updated]);
        });
        return;
      }
    }
  }

  onAnnotationsChange(callback: (annotations: Annotation[]) => void) {
    this.annotations.observe(() => {
      callback(this.annotations.toArray());
    });
  }

  getAnnotations(): Annotation[] {
    return this.annotations.toArray();
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

  destroy() {
    this.provider.destroy();
    this.doc.destroy();
  }
}
