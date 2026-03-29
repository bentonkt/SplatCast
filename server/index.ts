import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as map from 'lib0/map';
import { IncomingMessage } from 'http';

const PORT = Number(process.env.PORT) || 4000;

const messageSync = 0;
const messageAwareness = 1;

// Per-room state
const rooms = new Map<string, { doc: Y.Doc; awareness: awarenessProtocol.Awareness; conns: Map<WebSocket, Set<number>> }>();

function getRoom(roomName: string) {
  return map.setIfUndefined(rooms, roomName, () => {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const conns = new Map<WebSocket, Set<number>>();

    doc.on('update', (update: Uint8Array, origin: WebSocket) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      conns.forEach((_, conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });
    });

    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
      const message = encoding.toUint8Array(encoder);
      conns.forEach((_, conn) => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });
    });

    return { doc, awareness, conns };
  });
}

function setupWSConnection(ws: WebSocket, req: IncomingMessage) {
  const url = req.url ?? '/';
  const roomName = url.slice(1).split('?')[0] || 'default';
  const room = getRoom(roomName);
  const { doc, awareness, conns } = room;

  conns.set(ws, new Set());

  ws.binaryType = 'arraybuffer';

  // Send sync step 1
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));

    // Also send current awareness state
    const awarenessStates = awareness.getStates();
    if (awarenessStates.size > 0) {
      const aEncoder = encoding.createEncoder();
      encoding.writeVarUint(aEncoder, messageAwareness);
      encoding.writeVarUint8Array(aEncoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())));
      ws.send(encoding.toUint8Array(aEncoder));
    }
  }

  ws.on('message', (data: ArrayBuffer) => {
    try {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data as Uint8Array;
      const decoder = decoding.createDecoder(buf);
      const msgType = decoding.readVarUint(decoder);

      if (msgType === messageSync) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
        if (syncType === syncProtocol.messageYjsSyncStep1) {
          ws.send(encoding.toUint8Array(encoder));
        } else if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
      } else if (msgType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    const controlledIds = conns.get(ws);
    conns.delete(ws);
    awarenessProtocol.removeAwarenessStates(awareness, Array.from(controlledIds ?? []), null);
    if (conns.size === 0) {
      rooms.delete(roomName);
    }
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

console.log(`Yjs WebSocket server running on ws://localhost:${PORT}`);
