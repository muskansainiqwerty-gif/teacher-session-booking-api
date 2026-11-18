# Session Booking API

REST API where teachers publish available sessions, users book them, and completed sessions show up in the user's history.

**Stack:** Node.js, TypeScript, Express 5, MongoDB, Mongoose 8, Zod (request validation).

## Setup

Requirements: Node.js 20+, a running MongoDB (local or Atlas).

```bash
npm install
cp .env.example .env      # then adjust values
npm run dev               # development with reload
# or
npm run build && npm start
```

| Variable      | Description                  | Example                                     |
| ------------- | ---------------------------- | ------------------------------------------- |
| `PORT`        | HTTP port                    | `3000`                                      |
| `NODE_ENV`    | `development` / `production` | `development`                               |
| `MONGODB_URI` | Mongo connection string      | `mongodb://127.0.0.1:27017/session_booking` |

Optional: `npm run seed` inserts two demo teachers and prints their ids.

### Tests

`npm test` runs integration tests against an in-memory MongoDB (`mongodb-memory-server`; the binary is downloaded on first run, so no local Mongo is needed).

### Postman

Import `postman/session-booking.postman_collection.json` and run it top to bottom (or via the Collection Runner). Ids and dates are stored in collection variables automatically; change `baseUrl` if you do not use port 3000.

## Endpoints

All responses use `{ "success": boolean, "message": string, "data"?: ..., "errors"?: [...] }`.

| Method | Path                     | Description                                                      |
| ------ | ------------------------ | ---------------------------------------------------------------- |
| POST   | `/users`                 | Create user (`fullName`, `email`, `phone`)                       |
| POST   | `/teachers`              | Helper (not in the brief) to create a teacher for testing        |
| POST   | `/sessions`              | Create session (`teacherId`, `startTime`, `endTime`)             |
| GET    | `/sessions/available`    | `?dateTimestamp=` available sessions for that day (aggregation)  |
| POST   | `/sessions/:id/book`     | Body `{ "userId" }`                                              |
| PATCH  | `/sessions/:id/complete` | Mark a booked session completed                                  |
| GET    | `/users/:id/sessions`    | `{ upcomingSessions, completedSessions }` (aggregation)          |
| GET    | `/health`                | Liveness check                                                   |

### Status codes

`200` ok, `201` created, `400` validation / malformed id / bad JSON, `404` user, teacher, session or route not found, `409` business-rule conflict (duplicate email, session not bookable, overlap, wrong state), `500` unexpected.

## Behaviour and design decisions

- **Day for `dateTimestamp`:** epoch milliseconds (a 10-digit value is read as seconds). The "date" is the **UTC** calendar day containing it, i.e. `[00:00:00Z, next 00:00:00Z)`. Sessions are ordered by start time, with teacher details joined via `$lookup`.
- **User sessions:** *upcoming* = status `BOOKED` (sorted by start time); *completed* = status `COMPLETED` (most recently completed first). Both come from a single `$facet` aggregation.
- **Create session:** teacher must exist; `startTime`/`endTime` must be valid ISO dates, `endTime > startTime`, and `startTime` must be in the future. A teacher cannot have two overlapping sessions (back-to-back is fine). Any `status` / `userId` sent by the client is ignored.
- **Booking:** user and session must exist; only `AVAILABLE` sessions can be booked; a session that has already started cannot be booked; a user cannot hold two overlapping booked sessions. The final write is an atomic `findOneAndUpdate({ status: AVAILABLE, userId: null })`, so concurrent requests for one slot give exactly one `200` and the rest `409`.
- **Completing:** atomic update restricted to `BOOKED`, so a session cannot be completed twice or while still available.
- **Emails** are trimmed and lower-cased; uniqueness is enforced by an explicit check plus a unique index (races map to `409`).
- Centralised error middleware (`src/middlewares/errorHandler.ts`) converts validation, cast, duplicate-key, JSON-parse and application errors into consistent responses; stack traces are only shown outside production.

## Structure

```
src/
  config/        env + database connection
  models/        Mongoose schemas (User, Teacher, Session)
  validators/    Zod request schemas
  routes/        route definitions
  controllers/   thin HTTP layer
  services/      business logic and aggregation pipelines
  middlewares/   validation, error handling
  utils/         AppError, asyncHandler, ObjectId helper
tests/           integration tests
postman/         Postman collection
```
