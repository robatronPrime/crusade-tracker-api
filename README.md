# Crusade Tracker API

Express REST API for Crusade Tracker. Owns MongoDB access (`users`, `forces`, `units`) and verifies Clerk JWTs.

Pair with [`crusade-tracker`](../crusade-tracker/).

## Tech stack

- Express 4 (ESM, `.mjs`)
- MongoDB native driver (Atlas, database `crusade`)
- Clerk (`@clerk/backend`) for `Authorization` token verification
- CORS, dotenv
- Nodemon in development; ESLint + Prettier

## Getting started

```bash
npm i
npm run dev
```

Listens on port **5050** by default.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Nodemon (`index.mjs`) |
| `npm start` | Production (`node index.mjs`) |
| `npm test` | Node test runner |
| `npm run lint` | ESLint |
| `npm run format` | Prettier check |

Environment variables (`.env`; do not commit): `ATLAS_URI` and Clerk credentials for token verification.

Main route groups: `/forces`, `/users`, `/units`.
