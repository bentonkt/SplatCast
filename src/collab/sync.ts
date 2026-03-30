import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Annotation, CursorPresence, Stroke, UserPresence } from '../types';
import { Awareness } from 'y-protocols/awareness';

export class SyncManager {
  doc: Y.Doc;
  provider: WebsocketProvider;
  annotationMap: Y.Map<Annotation>;
  awareness: Awareness;
  strokes: Y.Array<Stroke>;

  constructor(roomId: string, serverUrl = 'ws://localhost:4000') {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(serverUrl, roomId, this.doc);
    this.annotationMap = this.doc.getMap<Annotation>('annotationMap');
    this.awareness = this.provider.awareness;
    this.strokes = this.doc.getArray<Stroke>('strokes');
  }

  addAnnotation(annotation: Annotation) {
    this.annotationMap.set(annotation.id, annotation);
  }

  updateAnnotation(id: string, updates: Partial<Pick<Annotation, 'label'>>) {
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

  destroy() {
    this.provider.destroy();
    this.doc.destroy();
  }
}
