# Pair-In Quick (pinq)

Pair-In Quick is a peer-to-peer (P2P) data transfer tool that makes it easy to send files or text from a phone to a computer without using cloud storage. It pairs a Progressive Web App (PWA) on your phone with a command-line interface (CLI) on your computer through a lightweight signaling server.

## Goals
- Enable fast, private transfers between phone and desktop using WebRTC DataChannels.
- Keep the experience simple: share a short pairing code, then send/receive immediately.
- Avoid storing payloads on servers—only exchange signaling data for secure, direct connections.
- Ship a consistent, TypeScript-first monorepo for the signaling server, CLI, and PWA.

## Architecture Overview
Pair-In Quick is organized as a pnpm workspace with three core apps:

- **Signaling Server (`apps/signaling/`):** Node.js + Socket.io service that brokers session setup (SDP/ICE) and pairing codes but never handles file contents. Suitable for Render.com deployment.
- **CLI (`apps/cli/`):** Node.js tool (Commander.js + simple-peer + wrtc) that joins a pairing session, receives files to `~/Downloads`, and prints incoming text.
- **PWA (`apps/pwa/`):** Svelte + Tailwind + Vite web client (simple-peer + socket.io-client) that runs in the browser to select files or text, generate/display the pairing code, and transfer to the desktop.

Key protocol highlights:
- WebRTC DataChannel with ~16 KB chunks, DTLS encryption, STUN/TURN fallback.
- Metadata message first (type/text/file details), followed by chunked payload and `EOF` marker.
- Pairing codes expire after ~5 minutes to reduce misuse.

## Prerequisites
- Node.js 18+
- pnpm 8+

Install pnpm if needed:
```bash
npm install -g pnpm
```

## Installation
Clone the repository and install workspace dependencies with pnpm:
```bash
git clone https://github.com/your-org/pinq.git
cd pinq
pnpm install
```

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
  pnpm --filter cli dev
  ```
- **Lint all packages:**
  ```bash
  pnpm lint
  ```
- **Type-check all packages:**
  ```bash
  pnpm typecheck
  ```

## Basic Usage
1. Start the signaling server (locally or use the Render URL).
2. Run the CLI on your computer:
   ```bash
   pnpm --filter cli start receive ABC123
   ```
   Replace `ABC123` with the pairing code shown in the PWA.
3. Open the PWA on your phone (local dev server or deployed URL).
4. Enter/select a pairing code, choose text or a file (<50 MB), and send.
5. The CLI displays text in the terminal and saves files to `~/Downloads` with progress for larger payloads.

## Deployment
### Signaling Server on Render
1. Create a new Web Service from this repo and set the root to `apps/signaling`.
2. Configure the start command (e.g., `pnpm start`) and automatic deploys from `main`.
3. Note the Render URL (e.g., `https://pinq-signaling.onrender.com`) for clients.

### PWA on Vercel
1. Import the repo into Vercel and set the project root to `apps/pwa`.
2. Configure build command `pnpm build` and output directory as Vite’s default (`dist`).
3. Set environment variables for the signaling URL if needed and deploy; add a custom domain if desired.

### CLI Publishing
- **npm:**
  ```bash
  cd apps/cli
  pnpm publish --access public
  ```
- **Homebrew tap:** create a `homebrew-tap` repo with a `Formula/pinq.rb` that pulls the npm tarball, then `brew tap <user>/tap` and `brew install pinq`.
- **Winget:** fork `microsoft/winget-pkgs`, add a manifest under `manifests/p/pinq/pinq-cli/`, and open a PR.

## Configuration
Update signaling endpoints in client code as needed:
- **PWA:** `apps/pwa/src/lib/config.ts` should point to the Render URL in production and localhost in development.
- **CLI:** `apps/cli/src/config.ts` can read `SIGNALING_URL` from the environment with a default Render URL.

## Contribution Guide
1. Fork the repo and create a feature branch.
2. Run lint/type-check before opening a PR.
3. Submit a PR with a clear description of changes and testing performed.

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
