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
├── tests/              # Unit, integration, and load test suites
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

### Running the Application
```bash
# Start development server with live reload
npm run dev

# Start production server
npm start

# Run tests
npm test

# Run linter
npm run lint
```
