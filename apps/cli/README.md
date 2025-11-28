# pinq-cli

Pair-In Quick CLI for receiving text and files from the mobile PWA via WebRTC DataChannels.

## Installation

```bash
pnpm install -g pinq-cli
```

## Usage

```bash
pinq receive <CODE> [options]
```

Examples:

```bash
# Receive into ~/Downloads
pinq receive ABC123

# Choose custom directory and require confirmation for files
pinq receive ABC123 --path ~/Desktop --confirm

# Verbose logging for debugging
pinq receive ABC123 --verbose
```

### Options
- `--path <dir>`: Override the download directory (default: `~/Downloads`)
- `--confirm`: Ask for confirmation before saving incoming files
- `--verbose`: Print signaling/WebRTC debug output

### Environment Variables
- `SIGNALING_URL`: Override the signaling server URL (default: `https://pinq-signaling.onrender.com`)
- `DOWNLOAD_DIR`: Override the default download directory for all runs

## Development

```bash
pnpm install
pnpm --filter cli build   # compile to dist/
pnpm --filter cli test    # run Node.js tests (wrtc required)
```

## Protocol
- Uses Socket.io for signaling with 6-character pairing codes (TTL ~5 minutes)
- First DataChannel message carries metadata (`text` or `file` descriptors)
- Subsequent messages are 16 KB chunks, terminated by `EOF`
- Desktop sends `ACK` after successfully writing/printing the payload
