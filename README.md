# Collabrium

Real-time collaborative rich-text editor powered by CRDTs (Yjs), TipTap, and WebSocket relay.

Multiple users edit the same document simultaneously — every keystroke merges cleanly with no conflicts. Live cursors, presence, and offline-first sync included.

## Stack

- **Frontend:** React 18, TypeScript, TipTap (ProseMirror), Tailwind CSS, Vite
- **CRDT:** Yjs (conflict-free replicated data type)
- **Sync:** y-websocket + custom Node.js relay
- **Backend:** Node.js, Express, ws, Mongoose
- **Database:** MongoDB

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB (local or Docker)

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Server starts on `http://localhost:3002`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App opens at `http://localhost:5173`.

### Docker (optional)

```bash
docker compose up -d
```

Starts MongoDB + backend. Frontend still needs `npm run dev` from host.

## Project Structure

```
collab-editor/
├── backend/
│   ├── src/
│   │   ├── relay/            # WebSocket relay server, room manager
│   │   ├── persistence/      # MongoDB load/save for Y.Doc snapshots
│   │   ├── routes/           # REST API routes (documents)
│   │   ├── middleware/        # JWT auth middleware
│   │   ├── models/           # Mongoose schema
│   │   └── server.ts         # Express + WS entry point
│   ├── tests/                # Vitest test suite
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Editor, ErrorBoundary, PresenceBar, ConnectionStatus, DocumentList
│   │   ├── hooks/            # useYjsDocument, useConnectionStatus
│   │   ├── lib/              # userColor utility
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── package.json
├── docs/
│   ├── architecture.md       # Detailed architecture documentation
│   └── high-level-design.md  # High-level design document
├── docker-compose.yml
└── README.md
```

## Testing Collaboration

1. Open `http://localhost:5173` in two browser tabs
2. Select a different user in each tab
3. Choose or create the same document
4. Start typing — edits appear in real time with cursors and presence

## Architecture

The server is a dumb relay — it never inspects document content. Yjs CRDT logic runs identically on every client, guaranteeing convergence regardless of message arrival order. The server only rebroadcasts binary updates and periodically persists Y.Doc snapshots to MongoDB.

See [High-Level Design](docs/high-level-design.md) and [Architecture Details](docs/architecture.md) for comprehensive documentation.

## License

MIT
