# Software Test Plan (STP) & Test Cases Specification
**Project**: Real-Time Chat Application (SE Mini Project)  
**Document Ref**: `DOC-STP-001`  
**Sprint**: Sprint 2 & Sprint 3 (Updated to reflect Sprint Changes)  
**Standard**: IEEE 829 Standard for Software Test Documentation  

---

## 1. Overview & Test Scope

This document details the Software Test Plan (STP) and comprehensive Test Cases for the Real-Time Chat Application. All original test cases defined in the SRS and Architecture Design (SAD) have been updated to reflect the latest sprint changes, including:
- **Sprint 2 Updates**: PostgreSQL durable message persistence (`messages` table), foreign key constraints, connection pool management, and atomic room creation.
- **Sprint 3 Updates**: Role-Based Access Control (RBAC) moderation actions (mute, ban, kick, message deletion), structured audit logging, token revocation guards, and interactive verification controls.

---

## 2. Test Case Inventory & Sprint Updates

### 2.1 Security Test Cases (`TC-Sec`)

| Test Case ID | Requirement Ref | Test Description | Input / Precondition | Expected Result | Sprint Update Note | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`TC-Sec-01`** | `CHAT-SR-001` | TLS 1.2+ mandatory transport encryption | Plaintext `http://` / `ws://` request vs HTTPS/WSS | Plaintext connection rejected/redirected; TLS handshake required | Verified via proxy headers & TLS suite | **PASS** |
| **`TC-Sec-02`** | `CHAT-SR-002` | Password hashing with salt | User registration with plaintext password | Database stores only salted bcrypt hash (>= 10 rounds); plaintext never logged | Added verification for bcrypt salt rounds | **PASS** |
| **`TC-Sec-03`** | `CHAT-SR-003` | JWT token expiry & signature validation | Expired JWT, tampered signature, and valid token | Tampered/expired tokens return `401 Unauthorized`; valid token accepted | Extended to validate Socket.IO handshake auth | **PASS** |
| **`TC-Sec-04`** | `CHAT-SR-004` | XSS sanitization of message content | Message containing `<script>alert('XSS')</script>` | Script tags sanitized to entity-escaped plain text; zero execution | Added interactive in-browser XSS test trigger | **PASS** |
| **`TC-Sec-05`** | `CHAT-SR-005` | RBAC & audit logging for moderation | Member role attempting `MUTE_USER` vs Owner role attempting it | Member denied `403 Forbidden`; Owner allowed and action logged to `audit_logs` | **Sprint 3 addition**: Full audit log schema & modal | **PASS** |

---

### 2.2 Authentication & User Management Test Cases (`TC-Auth`)

| Test Case ID | Requirement Ref | Test Description | Input / Precondition | Expected Result | Sprint Update Note | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`TC-Auth-01`** | `CHAT-F-001` | User registration & uniqueness | Unique email/username vs duplicate email | Returns `201 Created` for unique; `409 Conflict` for duplicate | Email normalization (lowercase) & trim added | **PASS** |
| **`TC-Auth-02`** | `CHAT-F-002` | User authentication & JWT issuance | Correct credentials vs wrong password | `200 OK` + signed JWT on success; `401 Unauthorized` on failure | Extended payload with user roles and claims | **PASS** |
| **`TC-Auth-03`** | `CHAT-F-003` | Account lockout after 5 failed attempts | 5 consecutive invalid login attempts for user | 6th attempt rejected with `429 Too Many Requests`; 5-min cooldown | Lockout timer integrated into auth service | **PASS** |

---

### 2.3 Messaging & Real-Time Test Cases (`TC-Msg`)

| Test Case ID | Requirement Ref | Test Description | Input / Precondition | Expected Result | Sprint Update Note | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`TC-Msg-01`** | `CHAT-F-010` | WebSocket handshake & JWT validation | Socket.IO connect with valid vs invalid token | Connection established and `connect_ack` sent; invalid token disconnected | Reconnection latency measurement integrated | **PASS** |
| **`TC-Msg-02`** | `CHAT-F-011` | Real-time 1-to-1 direct messaging | Client A sends DM to Client B (both online) | Message delivered to Client B with delivery timestamp (< 1s latency) | Synchronous persistence confirmation added | **PASS** |
| **`TC-Msg-03`** | `CHAT-F-012` | Offline message queuing & FIFO delivery | Client A sends message while Client B is offline | Messages queued; on reconnect, delivered in strict FIFO order | In-memory and database fallbacks updated | **PASS** |

---

### 2.4 Rooms & Collaboration Test Cases (`TC-Room`)

| Test Case ID | Requirement Ref | Test Description | Input / Precondition | Expected Result | Sprint Update Note | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`TC-Room-01`** | `CHAT-F-020` | Create named group chat room | Authenticated user creates room with name & topic | Room record created in DB; user added as Owner atomically | **Sprint 2 update**: Transaction rollback on membership failure | **PASS** |
| **`TC-Room-02`** | `CHAT-F-021` | Join chat room | Authenticated user joins public room or with invite | User added to `room_members`; member list broadcast to room | Added room occupancy counter tracking | **PASS** |
| **`TC-Room-03`** | `CHAT-F-022` | Broadcast message to room members | Room member posts message to `#general` | All active room members receive broadcast event in real time | Added room tag and persistence badge | **PASS** |
| **`TC-Room-04`** | `CHAT-F-023` | Room member moderation (Kick/Ban/Mute) | Room Owner removes or mutes abusive user | Target user removed from room / muted; socket room left | **Sprint 3 update**: RBAC modal dialogs & real-time socket events | **PASS** |

---

### 2.5 Presence & UX Test Cases (`TC-Pres`, `TC-Hist`, `TC-Media`, `TC-Notif`)

| Test Case ID | Requirement Ref | Test Description | Input / Precondition | Expected Result | Sprint Update Note | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`TC-Pres-01`** | `CHAT-F-030` | Real-time online/offline presence | User connects / disconnects | Presence badge updates for all contacts within <= 3s | Integrated with sidebar peer list & KPI cards | **PASS** |
| **`TC-Pres-02`** | `CHAT-F-031` | Typing indicator | User types in composer | `typing:start` event triggers typing banner; clears on send or 3s idle | Typing banner styled above composer | **PASS** |
| **`TC-Hist-01`** | `CHAT-F-040` | PostgreSQL message persistence | Message sent in DM or room | Row persisted to `messages` table before client ack | **Sprint 2/3**: Interactive DBMS Query Inspector modal added | **PASS** |
| **`TC-Hist-02`** | `CHAT-F-041` | Paginated message history retrieval | User scrolls chat history | Returns previous page of messages in reverse chronological order | Container-constrained scrolling added | **PASS** |
| **`TC-Media-01`** | `CHAT-F-050` | File upload & media sharing | User uploads valid image/document (<= 5MB) | File processed, stored, and download link provided | Client-side MIME validation added | **PASS** |
| **`TC-Media-02`** | `CHAT-F-051` | Reject oversized/disallowed files | User uploads file > 5MB or invalid executable | Rejected with `413 Payload Too Large` / `400 Bad Request` | Friendly error toast displayed | **PASS** |
| **`TC-Notif-01`** | `CHAT-F-060` | In-app unread message badge count | Message arrives in inactive room | Unread badge increments on room pill; clears when room opened | Dynamic badge counter and clear-on-focus | **PASS** |
| **`TC-Notif-02`** | `CHAT-F-061` | Push notification for offline users | Direct message sent to offline recipient | Notification payload dispatched via provider | Push dispatch trigger simulation verified | **PASS** |
| **`TC-Perf-01`** | `CHAT-NF-001` | Message delivery latency <= 1s (p95) | Simulated load testing with Artillery | 95th percentile latency <= 1000ms under normal load | Tested via `tests/performance/http-load.yml` | **PASS** |

---

## 3. Sprint Traceability Matrix

| Sprint | Goal | Test Cases Introduced / Updated | Target Verification Suite |
| :--- | :--- | :--- | :--- |
| **Sprint 1** | Core Architecture, Registration & Auth | `TC-Auth-01`, `TC-Auth-02`, `TC-Auth-03`, `TC-Sec-01`, `TC-Sec-02`, `TC-Sec-03` | `registration.test.js`, `auth.test.js`, `tls.test.js` |
| **Sprint 2** | Real-Time Messaging & PostgreSQL Persistence | `TC-Msg-01`, `TC-Msg-02`, `TC-Msg-03`, `TC-Hist-01`, `TC-Hist-02`, `TC-Room-01`, `TC-Room-02`, `TC-Room-03` | `socket.test.js`, `messagePersistence.test.js`, `db.test.js`, `roomModel.test.js` |
| **Sprint 3** | Moderation, RBAC, Security & UI Dashboard | `TC-Sec-04`, `TC-Sec-05`, `TC-Room-04`, `TC-Pres-01`, `TC-Pres-02`, `TC-Media-01/02`, `TC-Notif-01/02` | `rbac.test.js`, `xss.test.js`, `services.test.js`, `offlineMessageService.test.js` |

