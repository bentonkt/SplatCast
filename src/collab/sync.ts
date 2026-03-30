import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Annotation, CursorPresence } from '../types';
import { Awareness } from 'y-protocols/awareness';

export class SyncManager {
  doc: Y.Doc;
  provider: WebsocketProvider;
  annotations: Y.Array<Annotation>;
  awareness: Awareness;

  constructor(roomId: string, serverUrl = 'ws://localhost:4000') {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(serverUrl, roomId, this.doc);
    this.annotations = this.doc.getArray<Annotation>('annotations');
    this.awareness = this.provider.awareness;
  }

  addAnnotation(annotation: Annotation) {
    this.annotations.push([annotation]);
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

  destroy() {
    this.provider.destroy();
    this.doc.destroy();
  }
}
