# Collabrium

Real-time collaborative rich-text editor powered by CRDTs (Yjs), TipTap, and WebSocket relay.

Multiple users edit the same document simultaneously — every keystroke merges cleanly with no conflicts. Live cursors, presence, and offline-first sync included.

## Stack

- **Frontend:** React 18, TypeScript, TipTap (ProseMirror), Tailwind CSS, Vite
- **CRDT:** Yjs (conflict-free replicated data type)
- **Sync:** y-websocket + custom Node.js relay
- **Backend:** Node.js, Express, ws, Mongoose
- **Database:** MongoDB
- **Monitoring:** Pino (logging), Prometheus (metrics), Sentry (error tracking)

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
cp .env.example .env
npm install
npm run dev
```

App opens at `http://localhost:5173`.

### Docker (full stack)

```bash
docker compose up -d
```

Starts MongoDB + backend + frontend (nginx). App at `http://localhost`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | Backend HTTP/WS port |
| `MONGODB_URI` | `mongodb://localhost:27017/collab-editor` | MongoDB connection |
| `JWT_SECRET` | (required) | HMAC secret for JWT tokens |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |
| `LOG_LEVEL` | `info` | Pino log level (debug, info, warn, error) |
| `SENTRY_DSN` | (optional) | Sentry error tracking DSN |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Sentry trace sampling rate |
| `VITE_API_URL` | `http://localhost:3002` | Backend API URL (frontend) |
| `VITE_WS_URL` | `ws://localhost:3002` | Backend WS URL (frontend) |
| `VITE_SENTRY_DSN` | (optional) | Frontend Sentry DSN |

## Project Structure

```
collab-editor/
├── backend/
│   ├── src/
│   │   ├── relay/            # WebSocket relay server, room manager
│   │   ├── persistence/      # MongoDB load/save for Y.Doc snapshots
│   │   ├── routes/           # REST API routes (documents, collaborators)
│   │   ├── middleware/        # JWT auth middleware
│   │   ├── models/           # Mongoose schema
│   │   ├── logger.ts         # Pino structured logger
│   │   ├── metrics.ts        # Prometheus metrics
│   │   ├── sentry.ts         # Sentry error tracking
│   │   └── server.ts         # Express + WS entry point
│   ├── tests/                # Vitest test suite
│   ├── Dockerfile            # Multi-stage production build
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Editor, Toolbar, PresenceBar, ConnectionStatus, DocumentList
│   │   ├── hooks/            # useYjsDocument
│   │   ├── lib/              # userColor utility
│   │   ├── sentry.ts         # Frontend Sentry config
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile            # Nginx production build
│   ├── nginx.conf            # Reverse proxy config
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── architecture.md       # Detailed architecture documentation
│   └── high-level-design.md  # High-level design document
├── .github/workflows/
│   └── ci.yml                # CI pipeline
├── docker-compose.yml
└── README.md
```

## Testing

```bash
cd backend
npm test          # Run tests
npm run test:coverage  # With coverage report
```

### CI Pipeline

GitHub Actions runs on every push:
1. Backend tests + build
2. Frontend build
3. Security audit (npm audit)

## REST API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/demo-token` | No | Get demo JWT token |
| GET | `/api/documents` | Yes | List user documents (paginated) |
| GET | `/api/documents/:id` | Yes | Get document metadata |
| POST | `/api/documents` | Yes | Create document |
| PATCH | `/api/documents/:id` | Owner | Rename document |
| DELETE | `/api/documents/:id` | Owner | Delete document |
| POST | `/api/documents/:id/collaborators` | Owner | Add collaborator |
| DELETE | `/api/documents/:id/collaborators/:userId` | Owner | Remove collaborator |

## Metrics

`GET /metrics` exposes Prometheus metrics:
- `collabrium_http_requests_total` — HTTP request count by method/route/status
- `collabrium_ws_connections_active` — Active WebSocket connections
- `collabrium_active_documents` — Y.Doc instances in memory
- `collabrium_persistence_operations_total` — MongoDB persist operations
- `collabrium_persistence_duration_seconds` — Persist latency histogram

## Testing Collaboration

1. Open `http://localhost:5173` (or `http://localhost` via Docker) in two browser tabs
2. Select a different user in each tab
3. Choose or create the same document
4. Start typing — edits appear in real time with cursors and presence

## Production Deployment

```bash
# Build and start all services
docker compose up -d --build

# Verify health
curl http://localhost/api/documents

# View logs
docker compose logs -f backend
```

For production:
- Set strong `JWT_SECRET` (use `openssl rand -hex 32`)
- Configure `SENTRY_DSN` for error monitoring
- Add `LOG_LEVEL=warn` to reduce log volume
- Point `FRONTEND_URL` to your production domain
- Use MongoDB Atlas or a replica set for persistence

## Architecture

The server is a dumb relay — it never inspects document content. Yjs CRDT logic runs identically on every client, guaranteeing convergence regardless of message arrival order. The server only rebroadcasts binary updates and periodically persists Y.Doc snapshots to MongoDB.

See [High-Level Design](docs/high-level-design.md) and [Architecture Details](docs/architecture.md) for comprehensive documentation.

## License

MIT
