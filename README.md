# API Client

A local-only desktop API client (Postman alternative). No accounts, no cloud.
Built with Tauri v2, React, TypeScript and Vite.

## Prerequisites

- Node 20+
- Rust (stable), see https://tauri.app/start/prerequisites/

## Development

```bash
bun install
bun run tauri dev
```

## Scripts

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `bun run check`       | Lint, format check, typecheck, tests, Rust |
| `bun run test`        | Frontend unit tests (Vitest)               |
| `bun run rust:test`   | Rust tests                                 |
| `bun run tauri build` | Production installer                       |

## Architecture

- `src/`: React UI (features, store, lib)
- `src-tauri/`: Rust core. The HTTP engine and storage live here.
- Requests are sent from Rust (not browser fetch) to avoid CORS limits.
