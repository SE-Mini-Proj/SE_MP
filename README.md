# Real-Time Chat Application (Socket Programming)

A scalable, event-driven real-time chat application built using Node.js, Express, Socket.IO, PostgreSQL, and Redis.

## Features & Roadmap
- **Real-Time Messaging**: Low-latency 1-to-1 direct messaging and group chat rooms over WebSockets.
- **Presence & Status**: Real-time online/offline presence tracking and typing indicators.
- **Durable Persistence**: Message history and chat logs persisted in PostgreSQL.
- **Horizontal Scalability**: Scalable multi-instance architecture backed by Redis Pub/Sub.
- **Security by Design**: JWT session authentication, bcrypt password hashing, TLS enforcement, and XSS sanitization.

## Project Structure
```text
├── src/
│   ├── config/         # Environment variables & runtime configurations
│   ├── controllers/    # REST API request handlers
│   ├── middlewares/    # Express and Socket.IO middlewares (auth, error, logger)
│   ├── models/         # Database models and schemas
│   ├── routes/         # Express API route declarations
│   ├── services/       # Core business logic (auth, messaging, rooms, presence)
│   ├── sockets/        # Socket.IO connection handling & event dispatchers
│   ├── app.js          # Express app configuration & middleware setup
│   └── server.js       # HTTP server and WebSocket server bootstrapping
├── tests/              # Jest unit/integration tests and Artillery load scenarios
├── public/             # Static assets / testing UI
├── .env.example        # Example environment configuration
├── package.json
└── README.md
```

## Getting Started

### Prerequisites
- Node.js (>= 18.x)
- npm or yarn

### Installation
```bash
npm install
```

### Environment Configuration
Copy `.env.example` to `.env` and adjust the variables as needed:
```bash
cp .env.example .env
```
JWTs are signed with `JWT_SECRET` and expire according to `JWT_EXPIRES_IN`,
capped at 24 hours. Protected REST routes and every incoming Socket.IO event
verify the token; invalid or expired tokens are rejected with authentication
errors.

Direct messages to offline users are kept in a per-recipient Redis queue and
delivered in FIFO order when that user reconnects.

### Push notifications
To send FCM push notifications for direct messages, set
`FCM_SERVICE_ACCOUNT_JSON` (the service-account JSON contents) or
`FCM_SERVICE_ACCOUNT_FILE` (an absolute path to the service-account JSON file).
The service account must have Firebase Cloud Messaging permission. Set
`FCM_PROJECT_ID` only when it should override the account's `project_id`.
Authenticated clients register and remove their FCM registration token using
`POST /api/notifications/devices` and `DELETE /api/notifications/devices`,
respectively, with `{ "deviceToken": "..." }` as the JSON body. Run
`npm run db:migrate` to create the token table. The push provider is attempted
for direct messages (including offline recipients); provider failures are
logged without preventing realtime or queued message delivery. Clients should
only display a foreground notification when appropriate to avoid duplicates.

Authenticated users can create named chat rooms with `POST /api/rooms`.
Room creation and adding the creator as the room owner/member are committed
atomically in PostgreSQL.

### Sharing files in a room
Configure an S3-compatible bucket and credentials before starting the server.
Set `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`,
`OBJECT_STORAGE_ACCESS_KEY_ID`, and `OBJECT_STORAGE_SECRET_ACCESS_KEY` in
`.env`. For MinIO or another custom endpoint, also set
`OBJECT_STORAGE_ENDPOINT` and `OBJECT_STORAGE_FORCE_PATH_STYLE=true`.
`MAX_UPLOAD_SIZE_BYTES` configures the per-file limit (10 MiB by default).
For AWS S3, leave `OBJECT_STORAGE_ENDPOINT` empty and provide credentials with
write, read, and delete access to the configured bucket. Apply the database
metadata migration with `npm run db:migrate`.

Authenticated room members can upload an image or document with
`POST /api/media/rooms/:roomId` using the file bytes as the request body,
the file MIME type as `Content-Type`, and a URL-encoded name in `X-File-Name`.
Room members can list shared files with `GET /api/media/rooms/:roomId` and
download one with `GET /api/media/:mediaId/download`. New uploads are
broadcast over the room's `media:shared` Socket.IO event. Supported formats
are JPEG, PNG, GIF, WebP, PDF, TXT, CSV, DOC/DOCX, XLS/XLSX, and PPT/PPTX.

### Running the Application
```bash
# Start development server with live reload
npm run dev

# Start production server
npm start

# Run tests
npm test

# Run service unit tests
npm run test:unit

# Run REST, database, and Socket.IO integration tests
npm run test:integration

# Run HTTP and Socket.IO load scenarios (requires the app and Artillery)
npm run test:load

# Measure online direct-message sender-to-recipient p95 (requires app, PostgreSQL, Redis)
npm run test:perf:socket

# Run linter
npm run lint
```

## Test Strategy

Jest runs the service-level unit tests and integration suites. REST endpoint
tests use Supertest against the Express app without opening a listening port.
The Socket.IO suite starts an ephemeral HTTP server and connects with the
Socket.IO client, so it verifies the real handshake and message event flow.

The Artillery HTTP scenario in `tests/performance/http-load.yml` exercises
`GET /api/health` and enforces p95/p99 thresholds of 500/1000 ms.
`tests/performance/socket-latency.js` measures end-to-end time from sender
`message:send` to recipient `message:receive` with both users online. It sends
10 messages per second for 60 seconds by default and fails unless p95 is at
most 1000 ms and every sent message arrives. Run the server with PostgreSQL
and Redis available, and seed the default `alice` and `bob` accounts first.
Configure alternate test accounts, target, rate, or duration with
`PERF_SENDER_USERNAME`, `PERF_RECIPIENT_USERNAME`, `PERF_TARGET`,
`PERF_MESSAGES_PER_SECOND`, and `PERF_DURATION_SECONDS`. Run just this check
with `npm run test:perf:socket`, or run both the HTTP and socket scenarios with
`npm run test:load`.
