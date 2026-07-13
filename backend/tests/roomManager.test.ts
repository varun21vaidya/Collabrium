import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/relay/roomManager.js';
import { WebSocket } from 'ws';

describe('RoomManager', () => {
  it('should track room membership', () => {
    const manager = new RoomManager();
    const mockWs = {} as WebSocket;

    manager.join('doc1', mockWs, 'user1');
    expect(manager.getRoomSize('doc1')).toBe(1);

    manager.leave('doc1', mockWs);
    expect(manager.getRoomSize('doc1')).toBe(0);
  });

  it('should clean up empty rooms', () => {
    const manager = new RoomManager();
    const mockWs = {} as WebSocket;

    manager.join('doc1', mockWs, 'user1');
    manager.leave('doc1', mockWs);
    expect(manager.hasRoom('doc1')).toBe(false);
  });

  it('should return room clients', () => {
    const manager = new RoomManager();
    const mockWs = {} as WebSocket;

    manager.join('doc1', mockWs, 'user1');
    const clients = manager.getRoomClients('doc1');
    expect(clients).toHaveLength(1);
    expect(clients[0].userId).toBe('user1');
  });

  it('should handle multiple clients in same room', () => {
    const manager = new RoomManager();
    const ws1 = {} as WebSocket;
    const ws2 = {} as WebSocket;

    manager.join('doc1', ws1, 'user1');
    manager.join('doc1', ws2, 'user2');
    expect(manager.getRoomSize('doc1')).toBe(2);

    manager.leave('doc1', ws1);
    expect(manager.getRoomSize('doc1')).toBe(1);
  });
});
