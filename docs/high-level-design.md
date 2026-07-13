# Collabrium — High-Level Design

## Overview

Collabrium is a real-time collaborative rich-text editor. Multiple users edit the same document simultaneously. Edits merge conflict-free via CRDTs (Conflict-Free Replicated Data Types). The server acts as an opaque relay — it never inspects document content.

## System Context

```
┌─────────────┐     ┌──────────────────┐     ┌──────────┐
│  Browser A   │────▶                  │────▶│          │
│  (Alice)     │     │                  │     │ MongoDB  │
└─────────────┘     │   Collabrium     │     │          │
                    │   Relay Server    │     └──────────┘
┌─────────────┐     │   (Stateless     │
│  Browser B   │────▶    Opaque Relay) │
│  (Bob)       │     │                  │
└─────────────┘     └──────────────────┘
```

## Key Design Decisions

### 1. Server as Opaque Relay

The server never parses or inspects CRDT payloads. All Yjs merge logic runs client-side. This:

- Eliminates server-side merge bugs
- Makes horizontal scaling trivial (any relay instance works)
- Simplifies security (server cannot leak document content)

### 2. CRDT over OT

Chosen Yjs (CRDT) over OT (Operational Transform) because:

- No central server authority required
- Handles offline edits seamlessly
- Peer-to-peer capable
- Mature ecosystem (y-websocket, y-indexeddb, TipTap integration)

### 3. Binary Protocol

WebSocket messages use a 1-byte type prefix:

| Type | Value | Purpose |
|------|-------|---------|
| MESSAGE_SYNC | 0 | Yjs document updates |
| MESSAGE_AWARENESS | 1 | Cursor positions, presence |

### 4. Debounced Persistence

Y.Doc snapshots flush to MongoDB 2 seconds after the last edit. This:

- Prevents database thundering herd
- Batches rapid edits into single writes
- Provides acceptable durability window

### 5. Offline-First Client

Browser stores a local Yjs copy via IndexedDB (y-indexeddb). On reconnect:

1. Client reconnects WebSocket
2. Server sends full document state
3. Yjs merges local offline edits with server state
4. No conflicts — CRDT guarantees convergence

## Data Flow

### Edit Propagation

```
Alice types "hello"
  │
  ▼
TipTap editor → Yjs document
  │
  ▼
Yjs produces binary update → WebsocketProvider
  │
  ▼
WebSocket message (type=0, payload=binary)
  │
  ▼
Relay Server
  ├── Broadcasts to all other clients (Bob, Carol)
  ├── Schedules debounced persistence (2s)
  └── Never inspects content
        │
        ▼
   Bob's browser receives update
        │
        ▼
   Yjs applies update → TipTap re-renders
```

### Connection Lifecycle

```
Client connects to /collab?doc=<id>&token=<jwt>
  │
  ▼
Server validates:
  ├── documentId is valid MongoDB ObjectId
  └── JWT token is valid (sub, name claims)
        │
        ▼
Server creates/loads Y.Doc (getOrCreateDoc)
  ├── First client: new Y.Doc, load from MongoDB if exists
  └── Subsequent clients: reuse existing in-memory Y.Doc
        │
        ▼
Server sends full document state to new client
  │
  ▼
Client initializes TipTap editor with received state
  │
  ▼
Collaboration begins — bidirectional sync
```

## Security Model

| Layer | Mechanism |
|-------|-----------|
| Authentication | JWT with 7-day expiry |
| WebSocket Upgrade | Token validated before upgrade completes |
| HTTP Routes | Bearer token via authMiddleware |
| Document Access | ownerId / collaboratorIds enforced server-side |
| ObjectId Injection | mongoose.Types.ObjectId.isValid() check |
| Rate Limiting | 10 req/15min on demo token endpoint (P3) |
| Message Size | 1MB cap on WS messages (P4) |
| Input Sanitization | Document title sliced to 200 chars |

## Performance Characteristics

| Aspect | Behavior |
|--------|----------|
| Server memory per doc | ~1-5 MB per active Y.Doc |
| Persistence latency | 2s debounce + MongoDB write time |
| WS message overhead | 1 byte type prefix per message |
| Heartbeat interval | 30s ping/pong |
| Max connections per doc | 50 (configurable) |
| Persistence retry | 3 attempts, exponential backoff (1s, 2s, 4s) |

## Deployment

See `docker-compose.yml` for local deployment. Production requires:

1. Set `JWT_SECRET` to 32+ byte random value
2. Set `NODE_ENV=production`
3. Configure MongoDB replica set for durability
4. Set up reverse proxy (nginx/Caddy) for TLS termination
5. Configure log aggregation (server uses console.log)
6. Monitor `GET /health/ws` for active connections

## Testing

```bash
cd backend
npm test          # vitest run
npm run test:watch  # vitest watch mode
```

See `backend/tests/roomManager.test.ts` for example test.
