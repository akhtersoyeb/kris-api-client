# API Client

A fast, **local-only** desktop API client. Think Postman, without the account, the cloud sync or the telemetry. Your requests live in plain JSON files on your disk, your secrets live in your operating system's keychain, and nothing leaves your machine except the requests you send.

Built with [Tauri v2](https://tauri.app), React and Rust.

> **Status: pre-1.0, under active development.** The core loop (build a request, send it, inspect the response), file-based workspaces, environments and variables, request history and basic auth all work. See the [roadmap](#roadmap) for what is done and what is next. The latest release tag is `v0.4.0`; `main` contains the auth work heading toward `v0.5.0`.

<!-- Add screenshots to docs/screenshots/ and link them here, for example:
![Main window](docs/screenshots/main-window.png)
-->

## Why another API client?

- **Local-only.** No sign-in, no backend, no telemetry. The only network traffic is the requests you send.
- **Git-friendly.** Collections, requests and environments are readable, pretty-printed JSON, one file per request, so diffs and merges are clean.
- **Secrets stay out of files.** Secret variables are stored in the OS keychain (macOS Keychain, Windows Credential Manager, Secret Service on Linux). Their values are never written to workspace files, history or tooltips.
- **Small and quick.** A Tauri shell with a Rust HTTP engine instead of a bundled browser.
- **Real client behavior.** Requests are sent from Rust, not from the webview, so there are no CORS restrictions and you control every header.

## Features

### Requests and responses

- Tabbed request editor with GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS.
- URL bar with a **two-way link to the Params tab**: edit the query string or the table and the other follows. Disabled params stay in the table but out of the URL.
- Headers (with autocomplete for common names), JSON, raw (text, XML, HTML, JavaScript) and `application/x-www-form-urlencoded` bodies, edited in [Monaco](https://microsoft.github.io/monaco-editor/).
- Per-request **timeout** and **follow redirects** settings, and **cancel** for in-flight requests.
- Response viewer with status, time and size, **Pretty / Raw / Preview** body views, and a headers table. JSON is re-indented without being parsed, so large numbers (such as 64-bit IDs) are never altered.
- HTML previews render in a sandboxed frame with scripts disabled. Images preview inline. Binary bodies are handled safely, and bodies over 50 MB are truncated with a notice.

### Workspaces and collections

- A **workspace** is just a folder. Open it, commit it, share it.
- Collections, folders and requests in a drag-and-drop tree (virtualized, so large workspaces stay fast), with create, rename, duplicate and delete from the context menu.
- **Save** with Ctrl/Cmd+S, a dirty indicator that follows content (edit and undo goes clean again), and a prompt before closing unsaved tabs.
- **External edits are detected.** Change a file in your editor or pull a branch, and open tabs reload, or show a conflict banner if you had unsaved edits.
- **Session recovery.** Open tabs and unsaved drafts are restored after a restart or a crash.

### Environments and variables

- Use `{{variable}}` anywhere: URL, params, headers, form fields, bodies and auth fields. Variables are **highlighted** (defined or not) with a hover tooltip showing the scope and resolved value.
- Scopes, highest precedence first: **environment**, then **collection**, then **global**, then built-ins.
- Values can reference other variables (`{{base}}` can be `https://{{host}}/v1`), with cycle detection.
- Built-in dynamic variables: `{{$uuid}}`, `{{$timestamp}}` and `{{$randomInt}}`, evaluated on every send.
- **Secret variables** are stored in the OS keychain, masked in the UI, and left out of workspace files.
- Undefined variables in the URL or auth fail the send with a clear message. In headers and bodies they are sent as written and listed in a warning on the response.

### History and search

- Every send (including timeouts and connection errors) is recorded in a local SQLite database, one per workspace.
- History is grouped by day. Click an entry to **reopen it as a new draft**.
- Fast substring search (SQLite FTS5 trigram index) over method, URL, status, environment and saved-request path.
- **Redaction is on by default**: sensitive headers, URL credentials, sensitive query parameters, form fields and literal auth secrets are replaced with `[redacted]`. Values made only of `{{variables}}` are kept. Retention by age and by count is configurable, and recording can be turned off.

### Authentication

- Per-request auth: **No auth**, **Inherit from collection**, **Basic**, **Bearer** and **API key** (header or query string).
- **Collection-level auth** that its requests inherit, set from the collection's context menu.
- All auth fields accept variables, and the editor warns when a literal credential would be saved in plain text.
- A header you write by hand always wins over one generated from the Auth tab.
- OAuth 2.0 support is in progress (config model and keychain token storage are in place, the flows are not wired up yet).

### Productivity

- **Command palette** (Ctrl/Cmd+K): commands, saved requests and history in one search.
- Light, dark and system themes.

## Keyboard shortcuts

| Shortcut                | Action                   |
| ----------------------- | ------------------------ |
| Ctrl/Cmd + K            | Open the command palette |
| Ctrl/Cmd + S            | Save the current request |
| Enter in the URL field  | Send the request         |
| Middle-click a tab      | Close it                 |
| Right-click a tree item | Open its menu            |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (the project uses Bun as its package manager and script runner)
- [Rust](https://www.rust-lang.org/tools/install) (stable; the toolchain is pinned in `rust-toolchain.toml`)
- The platform dependencies for Tauri v2: see the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- **Linux only:** the packages below (the last two are needed for keychain support)

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libdbus-1-dev pkg-config
```

A running Secret Service (GNOME Keyring or KWallet) is needed at runtime for secret variables on Linux.

### Run it

```bash
git clone <this-repo-url>
cd <repo-folder>
bun install
bun run tauri dev
```

The first Rust build is slow, mostly compiling bundled SQLite and the Tauri dependencies. Later builds are incremental.

On first launch, choose **New workspace**, pick a folder, and you're ready to go. Opening an existing workspace means choosing a folder that contains a `workspace.json`.

### Build an installer

```bash
bun run tauri build
```

## Your data: where things live

**In your workspace folder** (safe to commit):

```
my-workspace/
├─ workspace.json            # name, id, global variables, collection order
├─ collections/
│  └─ payments-api/
│     ├─ collection.json     # name, variables, auth, child order
│     ├─ auth/
│     │  ├─ folder.json
│     │  └─ login.request.json
│     └─ list-users.request.json
└─ environments/
   ├─ dev.env.json
   └─ staging.env.json
```

Files carry a `schemaVersion`. Files written by a newer version of the app are refused rather than misread, and unreadable files show up as warnings instead of breaking the tree.

**Outside your workspace** (per user, in the OS app-data folder, for example `~/Library/Application Support/<app identifier>` on macOS):

| What                               | Where                                         |
| ---------------------------------- | --------------------------------------------- |
| Request history                    | `history/<workspace-id>.db` (SQLite)          |
| Open tabs and unsaved drafts       | `sessions/<workspace-id>.json`                |
| Recent workspaces and app settings | `recent-workspaces.json`, `settings.json`     |
| Secret variable values             | The OS keychain, keyed by workspace and scope |

### A note on secrets

- **Secret variables** (the lock toggle in the variables manager) are the way to keep a credential out of Git. Their file entries have an empty value.
- **Everything else you type is saved in plain text** in the workspace file: non-secret variable values and any credential typed literally into an Auth field. The editor warns about the latter. Store credentials as secret variables and reference them as `{{name}}`.
- **History stores JSON and raw bodies as written**, because there is no safe way to find secrets inside arbitrary text. Turn off _Save request bodies_ in Settings if that matters to you.

## Architecture

```
┌──────────────────────────── Tauri app ────────────────────────────┐
│                                                                   │
│  Webview (Vite + React + TypeScript)    Rust core (src-tauri)     │
│  ┌───────────────────────────────┐ IPC ┌────────────────────────┐ │
│  │ UI, Monaco editors            │◄───►│ http_engine (reqwest)  │ │
│  │ Zustand stores                │ typed│ workspace (files,      │ │
│  │ tree, tabs, dialogs, palette  │ cmds │   watcher, sessions)   │ │
│  └───────────────────────────────┘     │ variables (resolver,   │ │
│                                        │   environments,        │ │
│                                        │   keychain secrets)    │ │
│                                        │ auth (providers)       │ │
│                                        │ history (SQLite, FTS5) │ │
│                                        └───────────┬────────────┘ │
└────────────────────────────────────────────────────┼──────────────┘
                                                     ▼
                                   The APIs you call · your disk · OS keychain
```

Key decisions:

- **Requests are sent from Rust**, not with browser `fetch`, to avoid CORS, allow any header, and keep control of timing, redirects and cancellation.
- **Variables are resolved in Rust at send time**, so what you preview is what is sent.
- **The IPC layer is typed end to end.** Rust commands are exported to TypeScript by [tauri-specta](https://github.com/specta-rs/tauri-specta) into `src/lib/bindings.ts`, which is regenerated whenever you run `bun run tauri dev` and is committed.
- **All file access goes through Rust.** The UI only sends workspace-relative paths, and Rust rejects anything that tries to leave the workspace.
- **Writes are atomic** (temp file, then rename), so a crash can't leave half a file.

### Tech stack

| Area                    | Choice                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Shell                   | Tauri v2                                                              |
| Frontend                | React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui                   |
| State                   | Zustand                                                               |
| Editors                 | Monaco Editor                                                         |
| Lists and drag and drop | react-virtuoso, dnd-kit                                               |
| HTTP                    | reqwest with rustls, on tokio                                         |
| IPC types               | tauri-specta / specta                                                 |
| Storage                 | JSON files, SQLite (rusqlite, bundled, FTS5), OS keychain (keyring)   |
| File watching           | notify (via notify-debouncer-mini)                                    |
| Tooling                 | Bun, ESLint, Prettier, Vitest, rustfmt, clippy, Husky, GitHub Actions |

### Project layout

```
.
├─ src/                        # React app
│  ├─ app/                     # layout, providers
│  ├─ components/              # shared and shadcn/ui components
│  ├─ features/
│  │  ├─ auth/                 # auth editor, collection auth
│  │  ├─ collections/          # tree, drag and drop
│  │  ├─ history/              # history panel, reopen as draft
│  │  ├─ palette/              # command palette
│  │  ├─ request-editor/       # tabs, URL bar, params, headers, body
│  │  ├─ response-viewer/      # body views, headers, errors
│  │  ├─ settings/
│  │  ├─ variables/            # environments manager, highlighting
│  │  └─ workspace/            # open/save, sessions, external changes
│  ├─ lib/                     # ipc wrapper, generated bindings, helpers
│  └─ store/                   # Zustand stores
├─ src-tauri/
│  ├─ capabilities/            # Tauri permissions (least privilege)
│  └─ src/
│     ├─ auth/                 # auth config and providers (OAuth 2.0 in progress)
│     ├─ commands/             # Tauri commands (thin wrappers)
│     ├─ history/              # SQLite store, redaction, settings
│     ├─ http_engine/          # request execution
│     ├─ variables/            # resolver, environments, secrets
│     └─ workspace/            # file formats, store, watcher
└─ .github/workflows/ci.yml    # lint, typecheck, test on Linux, macOS, Windows
```

## Development

```bash
bun run tauri dev        # run the app with hot reload
bun run check            # everything below, the same as CI
bun run lint             # ESLint
bun run format           # Prettier (write)
bun run typecheck        # tsc --noEmit
bun run test             # Vitest (frontend)
bun run rust:test        # cargo test (backend)
bun run rust:fmt         # rustfmt
bun run rust:lint        # clippy, warnings are errors
```

Notes:

- Use **`bun run test`**, not `bun test`. The bare command runs Bun's own test runner instead of Vitest.
- After changing Rust commands or types, run `bun run tauri dev` once so `src/lib/bindings.ts` is regenerated, and commit it with the change.
- Husky runs lint-staged on commit and typecheck plus tests on push.
- CI runs the full check on Ubuntu, macOS and Windows.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `style:`, `ci:`).

## Roadmap

| Phase | Scope                                                                                 | Status          |
| ----- | ------------------------------------------------------------------------------------- | --------------- |
| 0     | Tooling, CI, scaffold cleanup                                                         | Done            |
| 1     | App shell, typed IPC, tabs, theme, command palette                                    | Done            |
| 2     | HTTP engine, request builder, response viewer                                         | Done (`v0.1.0`) |
| 3     | Workspaces: files on disk, collections tree, watcher, session recovery                | Done (`v0.2.0`) |
| 4     | Environments and variables, secrets in the OS keychain                                | Done (`v0.3.0`) |
| 5     | Request history and search                                                            | Done (`v0.4.0`) |
| 6     | Auth, cookies and body types                                                          | **In progress** |
| 7     | Proxy, TLS and certificate options, request timing breakdown, large-response handling | Planned         |
| 8     | Assertions, extract-to-variable rules, collection runner                              | Planned         |
| 9     | Import and export (curl, Postman, OpenAPI, HAR), code snippets                        | Planned         |
| 10    | WebSocket and SSE, scripting                                                          | Planned         |
| 11    | Polish, accessibility, security hardening, signed installers, auto-update             | Planned         |

**Phase 6 in detail**

- [x] Basic, Bearer and API key auth, auth inheritance from collections
- [x] OAuth 2.0 config model and keychain token storage
- [ ] OAuth 2.0 client credentials and authorization code (PKCE) flows
- [ ] Cookie jar with a manager UI and a response Cookies tab
- [ ] Multipart form-data with file streaming, binary bodies, GraphQL

## Known limitations

- No cookie jar yet: cookies are not kept between requests.
- No multipart, binary or GraphQL bodies yet.
- OAuth 2.0 is not usable yet, so use a Bearer token for now.
- No proxy settings, custom CA certificates, client certificates or "skip TLS verification" option.
- No import or export of other tools' formats, and no scripting or test assertions.
- No WebSocket, SSE or gRPC support.
- Response bodies are buffered in memory and truncated at 50 MB.
- Deleting a collection, folder or request is permanent (no OS trash).
- Closing the window can lose up to about a second of the most recent unsaved edits from the session recovery file. Saved work is never affected.
- Linux needs a running Secret Service for secret variables.

## Contributing

This project is early and moving quickly. Issues and pull requests are welcome.

1. Fork the repo and create a branch (`feat/short-description`).
2. Make your change, with tests where it makes sense.
3. Run `bun run check` and `bun run rust:test`.
4. Open a pull request with a clear description. CI must pass on all three platforms.
