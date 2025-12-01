# Pair-In Quick – Development Agent Guide

You are an expert full-stack developer focused on WebRTC, P2P transfer, and cross-platform tooling. Build and maintain Pair-In Quick: a phone-to-desktop P2P text/file transfer using Svelte PWA, Node CLI, and a Socket.io signaling server.

## Project Overview
- **PWA (apps/pwa/):** Svelte + Tailwind + Vite, simple-peer, socket.io-client. Generates a 6-character code (no `O/0`), sends text or files (≤50 MB) over WebRTC DataChannel. Shows pairing code, progress, and success states. Pre-warms signaling on load.
- **CLI (apps/cli/):** Node.js (Commander, simple-peer, @roamhq/wrtc), receives via `pinq receive ABC123`, saves files to `~/Downloads`, prints text, shows progress for >1 MB. Pre-warms signaling before join. Uses the same ICE servers.
- **Signaling (apps/signaling/):** Node.js + Express + Socket.io server on Render free tier. Exchanges SDP/ICE only; never handles payload data. Rooms expire after 5 minutes.
- **Shared config (apps/shared/):** ICE server list and control markers (ACK/EOF).

## Key Requirements
- WebRTC DataChannel with DTLS; chunk size 16 KB; max payload 50 MB.
- Public STUN and TURN fallback:
  ```
  stun:stun.l.google.com:19302
  stun:stun1.l.google.com:19302
  stun:stun2.l.google.com:19302
  turn:openrelay.metered.ca:80 (openrelayproject/openrelayproject)
  ```
- Pairing codes expire after 5 minutes; Render cold-start pre-warming via `/health`.
- Friendly UX: minimal steps, clear errors, progress for large files, CLI defaults to `~/Downloads`.

## Signaling Protocol (Socket.io)
- Events:
  - `join-room` → `{ code: string, role: 'creator' | 'guest' }`
  - `signal` → `{ code: string, signal: RTCSessionDescription | RTCIceCandidate }`
  - `peer-joined`, `peer-disconnected`, `room-expired`, `room-not-found`, `room-full`
- TTL cleanup per room (5 minutes). `/health` endpoint for uptime checks.

## Data Transfer Protocol
1) First message: metadata JSON
```ts
{ type: 'text' | 'file', filename?: string, size?: number, mimeType?: string }
```
2) Payload in 16 KB chunks.
3) EOF marker (`__PINQ_CTRL__EOF`), then receiver sends ACK (`__PINQ_CTRL__ACK` and legacy `ACK` for backward compatibility).

## Repo Structure
```
pinq/
├── apps/
│   ├── pwa/         # Svelte PWA
│   ├── cli/         # Node CLI
│   └── signaling/   # Socket.io server
├── apps/shared/     # ICE + control markers
├── package.json
├── pnpm-workspace.yaml
└── render.yaml
```

## Implementation Notes
- **Signaling server:** Express + Socket.io, CORS for PWA origins, room TTL, `/health`. Build with `pnpm --filter @pinq/signaling build`.
- **CLI:** `pinq receive CODE [--path <dir> --confirm --verbose]`. Uses simple-peer (wrtc) as non-initiator. Shows spinner/progress, writes files with backpressure, saves to `~/Downloads` by default.
- **PWA:** Initiator role. UI states: idle, pick text/file, waiting for desktop, sending with progress, success/error. Uses maskable PNG icons for mobile install. `VITE_SIGNALING_URL` overrides signaling endpoint; defaults to localhost in dev.

## Deployment
- **Render (signaling):** use `render.yaml`; start command `node dist/index.js`; expose `/health`. Set `ALLOWED_ORIGIN` to PWA domains.
- **Vercel (PWA):** project root `apps/pwa`, build `pnpm build`, output `dist`, env `VITE_SIGNALING_URL`.
- **CLI publishing:** npm package `pinq`; Homebrew tap and Winget manifest optional.

## Testing Checklist
- Text send PWA → CLI displays.
- File <1 MB saved correctly.
- File 10–50 MB shows progress and completes.
- Wrong code → “Room not found” within 30s.
- Drop connection mid-transfer → CLI reports lost connection.
- Render cold start handled via pre-warm (wait up to ~90s).
- Works across Wi-Fi and mobile data; TURN fallback for symmetric NAT.

## Optional Enhancements
- E2E encryption via Web Crypto.
- Transfer history in PWA.
- Multiple file sends, QR codes, desktop notifications, dark mode.
- Monitoring/analytics.
