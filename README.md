[![Node.js CI](https://github.com/kkrugley/pinq/actions/workflows/node.js.yml/badge.svg)](https://github.com/kkrugley/pinq/actions/workflows/node.js.yml)
[![npm version](https://img.shields.io/npm/v/pinq-cli.svg?color=blue)](https://www.npmjs.com/package/pinq-cli)
[![License](https://img.shields.io/github/license/kkrugley/pinq.svg?color=red)](LICENSE)

# Pair-In Quick (pinq)

Pair-In Quick is a peer-to-peer (P2P) data transfer tool that makes it easy to send files or text from a phone to a computer without using cloud storage. It pairs a Progressive Web App (PWA) on your phone with a command-line interface (CLI) on your computer through a lightweight signaling server.

## Goals
- Enable fast, private transfers between phone and desktop using WebRTC.
- Keep the experience simple: share a short pairing code, then send/receive immediately.
- Avoid storing payloads on servers—only exchange signaling data for secure, direct connections.
- Ship a consistent, TypeScript-first monorepo for the signaling server, CLI, and PWA.

## Architecture Overview
Pair-In Quick is organized as a pnpm workspace with three core apps:

- **Signaling Server (`apps/signaling/`):** Node.js + Socket.io service that brokers session setup (SDP/ICE) and pairing codes but never handles file contents. Suitable for Render.com deployment.
- **CLI (`apps/cli/`):** Node.js tool (Commander.js + simple-peer + @roamhq/wrtc) that joins a pairing session, receives files to `~/Downloads`, and prints incoming text.
- **PWA (`apps/pwa/`):** Svelte + Tailwind + Vite web client (simple-peer + socket.io-client) that runs in the browser to select files or text, generate/display the pairing code, and transfer to the desktop.

Key protocol highlights:
- WebRTC DataChannel with ~16 KB chunks, DTLS encryption, STUN/TURN fallback.
- Metadata message first (type/text/file details), followed by chunked payload and `EOF` marker.
- Pairing codes expire after ~5 minutes to reduce misuse.
- Pairing codes are 6 characters, excluding visually ambiguous `O`/`0`.

## Prerequisites
- Node.js 18+
- pnpm 8+

Install pnpm if needed:
```bash
npm install -g pnpm
```

## Installation

```bash
# Install from npm (global)
npm i -g pinq-cli

# or run from this repo without installing globally
pnpm --filter pinq-cli build
node apps/cli/dist/index.js receive ABC123
```

## Basic Usage
1. Start the signaling server (locally or use the Render URL).
2. Install the CLI globally (or run via `pnpm --filter pinq-cli build && node apps/cli/dist/index.js`).
3. Run the CLI on your computer with the pairing code from the PWA:
   ```bash
   pinq receive ABC123
   ```
4. Open the PWA on your phone (local dev server or deployed URL). The PWA will pre-warm the signaling server while you enter the code.
5. Enter/select a pairing code, choose text or a file (<50 MB), and send.
6. The CLI displays text in the terminal and saves files to `~/Downloads` with progress for larger payloads.

## Development Scripts
Run these from the repository root:

- **Signaling server (dev):**
  ```bash
  pnpm --filter signaling dev
  ```
- **PWA (dev server):**
  ```bash
  pnpm --filter pwa dev
  ```
- **CLI (build + watch):**
  ```bash
  pnpm --filter pinq-cli dev
  ```
- **Lint all packages:**
  ```bash
  pnpm lint
  ```
- **Type-check all packages:**
  ```bash
  pnpm typecheck
  ```

## Deployment
### Signaling Server on Render
1. Use `render.yaml` in the repo root, or point Render to `apps/signaling` with build `pnpm install && pnpm --filter @pinq/signaling build` and start `node apps/signaling/dist/index.js`.
2. Environment: `PORT=3000`, `NODE_ENV=production`, `ALLOWED_ORIGIN` (comma-separated list) for your PWA domains.
3. Render free tier can sleep; clients pre-warm via `/health` and wait up to ~90s. Keep the health route exposed.
4. Record the Render URL (e.g., `https://pinq.onrender.com`) and wire it into PWA (`VITE_SIGNALING_URL`) and CLI (`SIGNALING_URL`).

### PWA on Vercel
1. Import the repo into Vercel and set the project root to `apps/pwa`.
2. Configure build command `pnpm build` and output directory `dist`.
3. Set env `VITE_SIGNALING_URL=https://pinq.onrender.com` (or your self-hosted URL); add a custom domain if desired.

### CLI Publishing
- **npm:** bump the version, build, then publish from `apps/cli`:
  ```bash
  cd apps/cli
  pnpm build
  pnpm publish --access public
  ```
- **Homebrew tap:** create a `homebrew-tap` repo with a `Formula/pinq.rb` that pulls the npm tarball, then `brew tap <user>/tap && brew install pinq`.
- **Winget:** fork `microsoft/winget-pkgs`, add a manifest under `manifests/p/pinq/pinq-cli/`, and open a PR pointing to the npm tarball or a portable build.

## Configuration
Update signaling endpoints in client code as needed:
- **PWA:** `apps/pwa/src/lib/config.ts` respects `VITE_SIGNALING_URL` (build-time) and defaults to localhost in dev.
- **CLI:** `apps/cli/src/config.ts` reads `SIGNALING_URL` with fallback to the hosted URL; `DOWNLOAD_DIR` can override the save path.

## Contribution Guide
1. Fork the repo and create a feature branch.
2. Run lint/type-check before opening a PR.
3. Submit a PR with a clear description of changes and testing performed.

### If PR creation is blocked
Some hosting providers restrict opening PRs through the UI. You can still share your changes:
1. Create patches locally:
   ```bash
   git format-patch origin/main..HEAD -o /tmp/pinq-patches
   ```
2. Upload or share the generated `.patch` files (e.g., via email or an issue attachment).
3. The maintainer can apply them with:
   ```bash
   git am /tmp/pinq-patches/*.patch
   ```
This workflow avoids UI limits while preserving authorship and commit history.

## License
This project is licensed under the GPL v3 License. See [LICENSE](LICENSE) for details.
