import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Annotation } from '../types';

export class SyncManager {
  doc: Y.Doc;
  provider: WebsocketProvider;
  annotations: Y.Array<Annotation>;

  constructor(roomId: string, serverUrl = 'ws://localhost:4000') {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(serverUrl, roomId, this.doc);
    this.annotations = this.doc.getArray<Annotation>('annotations');
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

  destroy() {
    this.provider.destroy();
    this.doc.destroy();
  }
}
