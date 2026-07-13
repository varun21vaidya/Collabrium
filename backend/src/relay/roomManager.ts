import { WebSocket } from 'ws';

export interface ClientMetadata {
  userId: string;
  connectedAt: number;
}

export class RoomManager {
  private rooms: Map<string, Map<WebSocket, ClientMetadata>> = new Map();

  join(documentId: string, ws: WebSocket, userId: string): void {
    let room = this.rooms.get(documentId);
    if (!room) {
      room = new Map();
      this.rooms.set(documentId, room);
    }
    room.set(ws, { userId, connectedAt: Date.now() });
  }

  leave(documentId: string, ws: WebSocket): ClientMetadata | undefined {
    const room = this.rooms.get(documentId);
    if (!room) return undefined;
    const meta = room.get(ws);
    room.delete(ws);
    if (room.size === 0) {
      this.rooms.delete(documentId);
    }
    return meta;
  }

  broadcast(documentId: string, senderWs: WebSocket, data: Buffer | Uint8Array): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    for (const [client, _meta] of room) {
      if (client !== senderWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (err) {
          console.error(`[RoomManager] Broadcast error: ${(err as Error).message}`);
        }
      }
    }
  }

  getRoomSize(documentId: string): number {
    return this.rooms.get(documentId)?.size || 0;
  }

  getRoomClients(documentId: string): ClientMetadata[] {
    const room = this.rooms.get(documentId);
    if (!room) return [];
    return Array.from(room.values());
  }

  hasRoom(documentId: string): boolean {
    return this.rooms.has(documentId);
  }
}

export const roomManager = new RoomManager();
