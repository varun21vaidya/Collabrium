# Real-Time Collaborative Editor — Full Technical Plan

**Stack:** React 18 + TypeScript + Yjs + y-websocket + Node.js + Express + MongoDB
**Goal:** a multiplayer rich-text editor with live cursors, presence, and CRDT-based conflict resolution — no edit ever collides or gets lost, even with multiple people typing in the same paragraph at once.

---

## 1. Overview

### What it does
- Multiple users open the same document and type simultaneously — every keystroke merges cleanly with no "last write wins" data loss
- Each user's cursor and text selection is visible to everyone else in real time, labeled with their name and a unique color
- Presence bar shows who's currently in the document
- Document persists to MongoDB and reloads with full history intact
- Works offline-first: local edits apply instantly and sync automatically when the connection returns

### Why CRDTs instead of Operational Transform
Operational Transform (the algorithm Google Docs originally used) requires a central server to sequence every operation and transform conflicting edits against each other — it's correct but complex to implement correctly, and notoriously easy to get subtly wrong. A CRDT (Conflict-free Replicated Data Type) is a data structure mathematically guaranteed to converge to the same state on every client regardless of the order operations arrive in, with no central sequencing needed. Yjs is the most mature CRDT implementation for JavaScript and is what powers real production collaborative editors (Notion's early prototypes, many Jupyter-adjacent tools).

### Key technical challenge this plan solves
The naive approach — sending raw text diffs over a WebSocket — breaks the moment two people edit the same region concurrently. This plan uses Yjs's `Y.Doc` as the single source of truth on every client; the WebSocket server is a "dumb" relay that just rebroadcasts binary CRDT updates, never touching the content itself. This is the architecture that makes correctness a property of the data structure rather than something you have to get right in application code.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (Client A)                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  TipTap Editor (ProseMirror-based rich text)          │   │
│  │       ↕ bound via y-prosemirror                       │   │
│  │  Y.Doc (local CRDT state)                              │   │
│  │       ↕ y-websocket provider                          │   │
│  │  Awareness (cursor position, name, color — ephemeral) │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬────────────────────────────────┘
                             │ WebSocket
                             │ binary Yjs update messages
                             │ + awareness broadcast (cursors)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Node.js WebSocket Relay Server                               │
│  • Does NOT parse/understand document content                 │
│  • Rebroadcasts binary updates to all other connected clients │
│  • Periodically persists the Y.Doc binary state to MongoDB    │
│  • Tracks room membership per document ID                     │
└───────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  MongoDB         │
                    │  Document        │
                    │  (binary Y.Doc   │
                    │   snapshot +     │
                    │   metadata)      │
                    └─────────────────┘
                             ▲
┌───────────────────────────┴────────────────────────────────┐
│  Browser (Client B) — identical stack, same Y.Doc room       │
└──────────────────────────────────────────────────────────────┘
```

**Why the server never touches content:** this is the core design decision. The server's only job is message relay and periodic persistence — it stores and forwards opaque binary blobs. All merge logic lives in the Yjs library running identically on every client. This means the server can be trivially horizontally scaled later (it's stateless relay + a database), and there's no server-side merge logic to get wrong.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Rich text editor | TipTap (ProseMirror wrapper) | Best-maintained Yjs binding (`y-prosemirror`), extensible, good docs |
| CRDT | Yjs (`yjs`) | The standard; battle-tested, small, fast |
| Sync transport | `y-websocket` (client) + custom Node relay | Official provider, well-documented protocol |
| Awareness (cursors) | `y-protocols/awareness` | Ships with Yjs, handles ephemeral presence state |
| Backend | Node.js 20 + `ws` | Yjs's reference relay server is `ws`-based; no need for Express here except for a REST API alongside it |
| Persistence | MongoDB + `y-mongodb-provider` (or custom) | Stores binary Y.Doc snapshots |
| Auth | JWT (reuse pattern from any existing auth system) | Standard |
| Frontend framework | React 18 + TypeScript + Vite | Your existing stack |

---

## 4. Folder Structure

```
collab-editor/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor.tsx              # TipTap + Yjs binding
│   │   │   ├── PresenceBar.tsx         # Avatar list of connected users
│   │   │   ├── CursorOverlay.tsx       # Remote cursor rendering (TipTap extension)
│   │   │   ├── ConnectionStatus.tsx    # Online/offline/syncing indicator
│   │   │   └── DocumentList.tsx        # List of the user's documents
│   │   ├── hooks/
│   │   │   ├── useYjsDocument.ts       # Sets up Y.Doc + provider + awareness
│   │   │   └── useConnectionStatus.ts
│   │   ├── lib/
│   │   │   └── userColor.ts            # Deterministic color per user ID
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── relay/
│   │   │   ├── wsRelayServer.js        # Core Yjs WebSocket relay
│   │   │   └── roomManager.js          # Tracks which clients are in which document room
│   │   ├── persistence/
│   │   │   └── mongoPersistence.js     # Debounced save of Y.Doc binary state
│   │   ├── models/
│   │   │   └── Document.js             # Mongoose schema
│   │   ├── routes/
│   │   │   └── documents.js            # REST: list/create/delete documents
│   │   ├── middleware/
│   │   │   └── authMiddleware.js
│   │   └── server.js                   # Express (REST) + ws (relay) combined
│   ├── package.json
│   └── .env.example
│
├── docker-compose.yml
└── README.md
```

---

## 5. Data Model

### `backend/src/models/Document.js`

```javascript
// backend/src/models/Document.js
import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  title: { type: String, default: 'Untitled document' },
  ownerId: { type: String, required: true },
  collaboratorIds: { type: [String], default: [] },

  // The actual CRDT state — a binary snapshot of the Y.Doc, updated
  // periodically (debounced) as edits come in. This is opaque to
  // everything except Yjs's own encode/decode functions.
  yjsState: { type: Buffer },

  lastEditedAt: { type: Date, default: () => new Date() },
  lastEditedBy: { type: String },
}, { timestamps: true });

DocumentSchema.index({ ownerId: 1 });
DocumentSchema.index({ collaboratorIds: 1 });

export default mongoose.model('Document', DocumentSchema);
```

**Why store a binary blob instead of the rendered text:** the Y.Doc snapshot contains not just the current content but the full CRDT metadata needed to merge future edits correctly (each character/operation's origin and logical clock). Storing just the plain text would work for display but would lose the ability to correctly merge an offline client's queued edits when it reconnects.

---

## 6. Backend: The WebSocket Relay

This is the piece that makes everything work. It's intentionally simple — the complexity lives in Yjs itself, not in this server.

### `backend/src/relay/roomManager.js`

```javascript
// backend/src/relay/roomManager.js

// Tracks which WebSocket connections belong to which document "room"
export class RoomManager {
  constructor() {
    this.rooms = new Map();   // documentId -> Set<WebSocket>
  }

  join(documentId, ws) {
    if (!this.rooms.has(documentId)) {
      this.rooms.set(documentId, new Set());
    }
    this.rooms.get(documentId).add(ws);
  }

  leave(documentId, ws) {
    const room = this.rooms.get(documentId);
    if (!room) return;
    room.delete(ws);
    if (room.size === 0) this.rooms.delete(documentId);
  }

  broadcast(documentId, senderWs, data) {
    const room = this.rooms.get(documentId);
    if (!room) return;
    for (const client of room) {
      if (client !== senderWs && client.readyState === 1) {
        client.send(data);
      }
    }
  }

  getRoomSize(documentId) {
    return this.rooms.get(documentId)?.size || 0;
  }
}

export const roomManager = new RoomManager();
```

### `backend/src/relay/wsRelayServer.js`

This implements the `y-websocket` server protocol: message type `0` = a Yjs document sync update, message type `1` = an awareness update (cursor/presence). The server relays both without inspecting their content.

```javascript
// backend/src/relay/wsRelayServer.js
import * as Y from 'yjs';
import { roomManager } from './roomManager.js';
import { persistDocument, loadDocument } from '../persistence/mongoPersistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// One Y.Doc instance per document, kept in memory while at least one
// client is connected. This is the server's in-memory mirror — it lets
// a client that connects later receive the current merged state
// immediately, without waiting for every other client to resend history.
const activeDocs = new Map();   // documentId -> Y.Doc

async function getOrCreateDoc(documentId) {
  if (activeDocs.has(documentId)) return activeDocs.get(documentId);

  const doc = new Y.Doc();
  const savedState = await loadDocument(documentId);
  if (savedState) {
    Y.applyUpdate(doc, savedState);
  }

  activeDocs.set(documentId, doc);
  return doc;
}

export function handleRelayConnection(ws, documentId, userId) {
  let ydoc;

  (async () => {
    ydoc = await getOrCreateDoc(documentId);
    roomManager.join(documentId, ws);

    // Send the current full state to the newly connected client
    // (encodeStateAsUpdate produces a compact binary diff from "nothing")
    const fullState = Y.encodeStateAsUpdate(ydoc);
    ws.send(encodeMessage(MESSAGE_SYNC, fullState));

    console.log(`[Relay] ${userId} joined document ${documentId} (${roomManager.getRoomSize(documentId)} online)`);
  })();

  ws.on('message', (data) => {
    const { type, payload } = decodeMessage(data);

    if (type === MESSAGE_SYNC) {
      // Apply the incoming update to the server's in-memory doc,
      // then relay the raw update to every other connected client.
      // The server never inspects WHAT changed — Yjs's merge logic
      // guarantees correctness regardless of arrival order.
      Y.applyUpdate(ydoc, payload, 'relay');
      roomManager.broadcast(documentId, ws, data);
      schedulePersist(documentId, ydoc);
    }

    if (type === MESSAGE_AWARENESS) {
      // Cursor/presence updates are ephemeral — just relay, never persist
      roomManager.broadcast(documentId, ws, data);
    }
  });

  ws.on('close', () => {
    roomManager.leave(documentId, ws);
    console.log(`[Relay] ${userId} left document ${documentId} (${roomManager.getRoomSize(documentId)} remaining)`);

    // If nobody's left in the room, persist immediately and free memory
    if (roomManager.getRoomSize(documentId) === 0) {
      persistDocument(documentId, Y.encodeStateAsUpdate(ydoc));
      activeDocs.delete(documentId);
    }
  });
}

// --- Message framing helpers ---
// Wire format: [1 byte type][rest: binary payload]
function encodeMessage(type, payload) {
  const buf = new Uint8Array(payload.length + 1);
  buf[0] = type;
  buf.set(payload, 1);
  return buf;
}

function decodeMessage(data) {
  const buf = new Uint8Array(data);
  return { type: buf[0], payload: buf.slice(1) };
}

// --- Debounced persistence ---
const persistTimers = new Map();

function schedulePersist(documentId, ydoc) {
  if (persistTimers.has(documentId)) clearTimeout(persistTimers.get(documentId));

  const timer = setTimeout(() => {
    persistDocument(documentId, Y.encodeStateAsUpdate(ydoc));
    persistTimers.delete(documentId);
  }, 2000);   // 2s debounce — don't hit MongoDB on every keystroke

  persistTimers.set(documentId, timer);
}
```

### `backend/src/persistence/mongoPersistence.js`

```javascript
// backend/src/persistence/mongoPersistence.js
import Document from '../models/Document.js';

export async function loadDocument(documentId) {
  const doc = await Document.findById(documentId);
  return doc?.yjsState ? new Uint8Array(doc.yjsState) : null;
}

export async function persistDocument(documentId, stateUpdate) {
  try {
    await Document.findByIdAndUpdate(documentId, {
      yjsState: Buffer.from(stateUpdate),
      lastEditedAt: new Date(),
    });
  } catch (err) {
    console.error(`[Persistence] Failed to save document ${documentId}:`, err.message);
  }
}
```

### `backend/src/server.js`

```javascript
// backend/src/server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { handleRelayConnection } from './relay/wsRelayServer.js';
import { verifyWsToken } from './middleware/authMiddleware.js';
import documentsRouter from './routes/documents.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/collab' });

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use('/api/documents', documentsRouter);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const documentId = url.searchParams.get('doc');
  const token = url.searchParams.get('token');

  const payload = verifyWsToken(token);
  if (!payload || !documentId) {
    ws.close();
    return;
  }

  handleRelayConnection(ws, documentId, payload.sub);
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  const PORT = process.env.PORT || 3002;
  server.listen(PORT, () => console.log(`[Server] Listening on :${PORT}`));
}

start();
```

---

## 7. Frontend: Yjs + TipTap Binding

### `frontend/src/hooks/useYjsDocument.ts`

```typescript
// frontend/src/hooks/useYjsDocument.ts
import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface UseYjsDocumentResult {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  status: 'connecting' | 'connected' | 'disconnected';
}

export function useYjsDocument(documentId: string, token: string, userName: string, userColor: string): UseYjsDocumentResult {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const provider = useMemo(() => {
    const wsUrl = `${import.meta.env.VITE_WS_URL}/collab?doc=${documentId}&token=${token}`;
    return new WebsocketProvider(wsUrl, documentId, ydoc, { connect: true });
  }, [documentId, token, ydoc]);

  useEffect(() => {
    // Set this client's identity in the shared awareness state —
    // this is what powers remote cursor labels and colors
    provider.awareness.setLocalStateField('user', { name: userName, color: userColor });

    provider.on('status', ({ status }: { status: string }) => {
      setStatus(status === 'connected' ? 'connected' : 'connecting');
    });

    const handleOffline = () => setStatus('disconnected');
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc, userName, userColor]);

  return { ydoc, provider, status };
}
```

### `frontend/src/components/Editor.tsx`

```typescript
// frontend/src/components/Editor.tsx
import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useYjsDocument } from '../hooks/useYjsDocument';
import PresenceBar from './PresenceBar';
import ConnectionStatus from './ConnectionStatus';
import { getUserColor } from '../lib/userColor';

interface EditorProps {
  documentId: string;
  token: string;
  userName: string;
  userId: string;
}

export default function Editor({ documentId, token, userName, userId }: EditorProps) {
  const userColor = getUserColor(userId);
  const { ydoc, provider, status } = useYjsDocument(documentId, token, userName, userColor);

  const editor = useEditor({
    extensions: [
      // Disable StarterKit's own history — Yjs's CRDT history replaces it.
      // Running both would cause the undo stack and the CRDT state to
      // fight each other over what "one edit" means.
      StarterKit.configure({ history: false }),

      Collaboration.configure({ document: ydoc }),

      CollaborationCursor.configure({
        provider,
        user: { name: userName, color: userColor },
      }),
    ],
  }, [ydoc, provider]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <PresenceBar provider={provider} />
        <ConnectionStatus status={status} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <EditorContent editor={editor} className="prose max-w-none" />
      </div>
    </div>
  );
}
```

### `frontend/src/components/PresenceBar.tsx`

```typescript
// frontend/src/components/PresenceBar.tsx
import React, { useEffect, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';

interface AwarenessUser { name: string; color: string; }

export default function PresenceBar({ provider }: { provider: WebsocketProvider }) {
  const [users, setUsers] = useState<AwarenessUser[]>([]);

  useEffect(() => {
    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values());
      setUsers(states.map((s: any) => s.user).filter(Boolean));
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();

    return () => provider.awareness.off('change', updateUsers);
  }, [provider]);

  return (
    <div className="flex items-center -space-x-2">
      {users.map((user, i) => (
        <div
          key={i}
          title={user.name}
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2 border-white"
          style={{ backgroundColor: user.color }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      <span className="ml-4 text-xs text-gray-500">{users.length} online</span>
    </div>
  );
}
```

### `frontend/src/components/ConnectionStatus.tsx`

```typescript
// frontend/src/components/ConnectionStatus.tsx
import React from 'react';

const config = {
  connected:    { label: 'Synced',        color: 'bg-green-500' },
  connecting:   { label: 'Connecting...', color: 'bg-yellow-500' },
  disconnected: { label: 'Offline — changes saved locally', color: 'bg-gray-400' },
};

export default function ConnectionStatus({ status }: { status: keyof typeof config }) {
  const { label, color } = config[status];
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}
```

### `frontend/src/lib/userColor.ts`

```typescript
// frontend/src/lib/userColor.ts
// Deterministic color per user ID — same user always gets the same
// cursor color across sessions, without needing to store it anywhere
const PALETTE = ['#F97316', '#8B5CF6', '#06B6D4', '#EC4899', '#22C55E', '#EAB308', '#EF4444', '#3B82F6'];

export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
```

---

## 8. Offline Support

This is one of the most impressive things to demo, and it's largely "free" once the above is wired correctly — it comes from adding `y-indexeddb` alongside `y-websocket`.

### `frontend/src/hooks/useYjsDocument.ts` — add local persistence

```typescript
import { IndexeddbPersistence } from 'y-indexeddb';

// Inside the hook, alongside the WebsocketProvider:
const localPersistence = useMemo(
  () => new IndexeddbPersistence(documentId, ydoc),
  [documentId, ydoc]
);
```

**What this buys you:** edits made while offline are written to the browser's IndexedDB immediately (so a page refresh doesn't lose them), and the moment the WebSocket reconnects, Yjs automatically computes and sends the delta between the last-synced state and the current local state — no manual "resync" logic needed. This is the CRDT property doing real work: the merge is correct even when the two divergent copies were edited for minutes while completely disconnected.

---

## 9. Testing Checklist

- [ ] Two browser tabs, same document — typing in one appears in the other within ~100ms
- [ ] Two cursors typing in the exact same word simultaneously — both edits land, no characters lost
- [ ] Close one tab's network (DevTools → offline), type for 30 seconds, reconnect — edits merge in correctly with no conflict dialog or data loss
- [ ] Refresh a tab mid-edit — document reloads with all changes intact (tests IndexedDB persistence)
- [ ] Three+ simultaneous users — presence bar shows all avatars, updates immediately on join/leave
- [ ] Kill the backend server, edit locally, restart server — client auto-reconnects and syncs the offline edits
- [ ] Two users select overlapping text ranges — both selection highlights render distinctly by color

---

## 10. Deployment Notes

- **The WebSocket relay needs a host that supports persistent connections** — same constraint as any WebSocket server (Railway, Fly.io, a plain VPS; not a serverless function platform like Vercel functions).
- **Scaling beyond one server instance requires a pub/sub layer** (Redis) between relay instances, since the in-memory `activeDocs` map in this plan only works correctly with a single server process — two users in the same document connected to two different server instances wouldn't see each other's edits without a shared broadcast channel. For a portfolio project, a single instance is fine and worth stating explicitly rather than over-building.
- **MongoDB document size limit (16MB)** is effectively never hit by a Yjs binary snapshot for a text document — Yjs's encoding is compact — but worth knowing about if this ever extends to very large documents.

---

## 11. What Makes This a Strong Portfolio Piece

- It demonstrates understanding of a genuinely hard distributed-systems problem (concurrent state convergence) rather than typical CRUD
- The "why CRDT over OT" explanation is a strong interview talking point — it shows you evaluated a real trade-off, not just followed a tutorial
- Offline-first support is a feature most portfolio projects don't attempt, and it's a natural, low-effort extension of the same architecture rather than bolted-on complexity
- The server's minimal, provably-correct role (relay + periodic persist, never touching content) is a clean, explainable architecture decision — easy to draw on a whiteboard in an interview
