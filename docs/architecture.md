# Collabrium — Architecture

## Module Overview

```
collab-editor/
│
├── backend/                          # Node.js + Express + WebSocket relay
│   ├── src/
│   │   ├── server.ts                 # Entry point: Express + WS upgrade + graceful shutdown
│   │   ├── middleware/
│   │   │   └── auth.ts               # JWT sign/verify, authMiddleware, verifyWsToken
│   │   ├── models/
│   │   │   └── Document.ts           # Mongoose schema for documents
│   │   ├── persistence/
│   │   │   └── mongoPersistence.ts   # loadDocument / persistDocument
│   │   ├── relay/
│   │   │   ├── roomManager.ts        # Room membership tracking
│   │   │   └── wsRelayServer.ts      # CRDT relay: getOrCreateDoc, schedulePersist, GC
│   │   └── routes/
│   │       └── documents.ts          # REST: list (paginated), create, delete
│   └── tests/
│       └── roomManager.test.ts       # Vitest unit tests
│
├── frontend/                         # React 18 + TipTap + Vite
│   ├── src/
│   │   ├── App.tsx                   # Auth flow: login → document list → editor
│   │   ├── main.tsx                  # React root mount
│   │   ├── components/
│   │   │   ├── Editor.tsx            # TipTap editor with Collaboration extensions
│   │   │   ├── ErrorBoundary.tsx     # React error boundary wrapper
│   │   │   ├── PresenceBar.tsx       # Online user avatars
│   │   │   ├── ConnectionStatus.tsx  # Connection indicator
│   │   │   └── DocumentList.tsx      # Document CRUD list
│   │   ├── hooks/
│   │   │   ├── useYjsDocument.ts     # Y.Doc + WebsocketProvider + IndexedDB
│   │   │   └── useConnectionStatus.ts # Standalone WS status hook
│   │   └── lib/
│   │       └── userColor.ts          # Deterministic color from user ID
│   ├── index.html
│   └── package.json
│
├── docs/
│   ├── architecture.md               # This file
│   └── high-level-design.md          # HLD overview
│
├── docker-compose.yml                # MongoDB + backend containers
├── fix-plan.html                     # Code review task tracker
└── README.md
```

---

## Backend Architecture

### server.ts (Entry Point)

**Responsibilities:**
- Express app setup (CORS, JSON parsing)
- HTTP routes: `/health`, `/api/auth/demo-token`, `/api/documents/*`
- WebSocket upgrade handler on `/collab?doc=&token=`
- Graceful shutdown (SIGTERM/SIGINT)

**Key imports:**
- `handleRelayConnection` — per-connection WS handler
- `flushAllDocuments` — persists all active Y.Docs on shutdown
- `getActiveDocCount`, `getTotalConnections` — health/ws metrics

**Rate limiting:** `express-rate-limit` on demo-token endpoint (10 req / 15 min per IP)

### auth.ts (JWT Middleware)

**Signing:** HS256 with configurable `JWT_SECRET` (env var)
**Verification:** `verifyToken()` validates JWT, checks `sub` and `name` claims
**Middleware:** `authMiddleware` for HTTP routes, `verifyWsToken` for WS upgrade

**Hardening (P5):** Throws at startup if `NODE_ENV=production` and `JWT_SECRET` unset

### wsRelayServer.ts (CRDT Relay)

**Core data structures:**
- `activeDocs: Map<string, Y.Doc>` — in-memory Yjs documents
- `docPromises: Map<string, Promise<Y.Doc>>` — serializes concurrent creation (P2)
- `persistTimers: Map<string, Timeout>` — debounce timers per document

**Flow per connection:**

1. Room capacity check (≤50 clients) — rejects with close code 1013 if full (M2)
2. `getOrCreateDoc()` — returns existing or creates new Y.Doc (race-free via Promise map)
3. `roomManager.join()` — tracks membership
4. Sends full Y.Doc state to new client
5. Message loop: decode 1-byte type prefix, relay to room, schedule persist
6. Message size check: rejects >1MB with close code 1009 (P4)
7. On close: leave room, final flush if last client, destroy Y.Doc

**Persistence:**
- `schedulePersist()` — 2s debounce, calls `persistWithRetry()` (M1)
- `persistWithRetry()` — 3 attempts with exponential backoff (1s, 2s, 4s)
- `flushAllDocuments()` — exports for graceful shutdown (P1)

**GC Monitoring (M3):**
- 60-second interval checks active doc sizes
- Warns if any doc exceeds 5MB

### roomManager.ts

```typescript
class RoomManager {
  private rooms: Map<string, Map<WebSocket, ClientMetadata>>
  
  join(documentId, ws, userId)     // Add to room
  leave(documentId, ws)            // Remove, auto-cleanup empty rooms
  broadcast(documentId, sender, data)  // Relay to all except sender
  getRoomSize(documentId): number   // Client count
  getRoomClients(documentId): ClientMetadata[]  // User info
  hasRoom(documentId): boolean      // Room existence check
}
```

### mongoPersistence.ts

- `loadDocument(id)` — findById, returns `yjsState` as Uint8Array or null
- `persistDocument(id, state)` — upserts yjsState + lastEditedAt timestamp

### Document Model (Mongoose)

```typescript
{
  title: string                  // Trimmed, max 200 chars
  ownerId: string                // Indexed
  collaboratorIds: string[]      // Indexed
  yjsState: Buffer               // Binary Y.Doc snapshot
  lastEditedAt: Date             // Updated on persist
  lastEditedBy: string           // User ID
  timestamps: true               // createdAt, updatedAt
}
```

Indexes: `ownerId+updatedAt`, `collaboratorIds+updatedAt`, `lastEditedAt`

### documents.ts (REST Routes)

- `GET /` — Paginated list (50/page), filtered by ownerId/collaboratorIds
- `POST /` — Create document, validate title (max 200 chars)
- `DELETE /:id` — Delete own document, validate ObjectId

---

## Frontend Architecture

### App.tsx (Entry Component)

**States:**
1. **Login screen** — Select demo user identity (4 users)
2. **Document list** — CRUD documents via REST API
3. **Editor** — Full collaborative editing experience

**Auth flow:** POST `/api/auth/demo-token` → receive JWT → store in state

### Editor.tsx (TipTap Integration)

**Extensions:**
- `StarterKit` (history disabled — Yjs handles undo)
- `Collaboration` — binds Y.Doc to TipTap document
- `CollaborationCursor` — renders remote cursors with color

**Error handling:** Wrapped in `ErrorBoundary` (L2) to catch rendering crashes

### PresenceBar.tsx

Reads `provider.awareness.getStates()` to display online users.
Shows up to 6 avatars + overflow count.
Clears state on unmount (L3).

### ConnectionStatus.tsx

Visual indicator with 4 states:

| State | Color | Behavior |
|-------|-------|----------|
| connected | green | Static dot |
| connecting | amber | Pulsing dot |
| disconnected | gray | Static dot |
| syncing | blue | Pulsing dot |

### useYjsDocument.ts (Core Hook)

**Creates:**
1. `Y.Doc` instance (memoized per documentId)
2. `WebsocketProvider` — connects to relay at `/collab?doc=&token=`
3. `IndexeddbPersistence` — local offline cache

**Lifecycle:**
- Sets awareness user state (name, color)
- Listens for status/sync events on provider
- Handles offline/online browser events
- Cleanup: destroy provider, destroy IndexedDB persistence, clear awareness

### useConnectionStatus.ts

Standalone hook for monitoring WebSocket connection state externally.

### userColor.ts

Deterministic color assignment from user ID via hash function. 8-color palette.

---

## Wire Protocol

### WebSocket Connection

```
ws://host:3002/collab?doc=<mongo-object-id>&token=<jwt>
```

### Binary Message Format

```
┌─────────┬──────────────────────────────┐
│ 1 byte  │   N bytes                    │
│  type   │   payload                    │
├─────────┼──────────────────────────────┤
│    0    │   Yjs binary update (sync)   │
│    1    │   Awareness update           │
└─────────┴──────────────────────────────┘
```

### Message Flow

```
Client → Server:
  type=0: Yjs document update → relay to room + schedule persist
  type=1: Awareness (cursor) → relay to room (no persist)

Server → Client:
  type=0: Full state on join, incremental updates from peers
  type=1: Cursor/presence from peers
```

---

## Error Handling Strategy

| Layer | Approach |
|-------|----------|
| Express routes | try-catch → 500 JSON response |
| WebSocket messages | try-catch → structured error log, non-fatal |
| Persistence | Exponential backoff retry (3 attempts) |
| JWT verification | Returns null on any failure (no stack leaks) |
| React rendering | ErrorBoundary with fallback UI |
| WS connection | Auto-reconnect via y-websocket (maxBackoffTime: 2500ms) |
| Shutdown | flushAllDocuments → server.close → mongoose.disconnect |

---

## Graceful Shutdown Sequence (P1)

```
SIGTERM/SIGINT received
  │
  ▼
flushAllDocuments()
  ├── For each active Y.Doc:
  │   ├── Y.encodeStateAsUpdate(ydoc)
  │   └── persistDocument(docId, state)
  └── Promise.allSettled() — all attempts, ignore individual failures
  │
  ▼
server.close() — stop accepting new connections
  │
  ▼
mongoose.disconnect()
  │
  ▼
process.exit(0)
```

---

## Security Architecture

```
┌──────────────┐
│   Browser    │
│  (Client)    │
└──────┬───────┘
       │
       │ WebSocket upgrade: /collab?doc=X&token=JWT
       │ HTTP: Authorization: Bearer JWT
       ▼
┌──────────────┐
│  Server      │
│              │
│  ┌────────┐  │
│  │  JWT   │──│── Verify signature + claims (sub, name)
│  │ Verify │  │
│  └────────┘  │
│              │
│  ┌────────┐  │
│  │ Rate   │──│── 10 req / 15 min per IP (demo-token)
│  │ Limit  │  │
│  └────────┘  │
│              │
│  ┌────────┐  │
│  │ Object │──│── mongoose.Types.ObjectId.isValid()
│  │ ID     │  │
│  │ Check  │  │
│  └────────┘  │
│              │
│  ┌────────┐  │
│  │ WS Msg │──│── 1MB max payload size
│  │ Limit  │  │
│  └────────┘  │
│              │
│  ┌────────┐  │
│  │ Room   │──│── 50 max connections per document
│  │ Cap    │  │
│  └────────┘  │
└──────────────┘
```

---

## Production Readiness Checklist

- [x] Graceful shutdown with document flush (P1)
- [x] Race-free document creation (P2)
- [x] Rate limited demo token endpoint (P3)
- [x] WebSocket message size limit (P4)
- [x] Fail-fast on missing JWT secret in production (P5)
- [x] Retry logic for persistence failures (M1)
- [x] Connection limit per document (M2)
- [x] Periodic document size monitoring (M3)
- [x] Paginated document list (M4)
- [x] Error boundary for editor crashes (L2)
- [x] Clean presence state on unmount (L3)
- [x] WebSocket health endpoint /health/ws (L4)
- [x] Docker HEALTHCHECK (L5)
- [x] Automated test suite (L6)
