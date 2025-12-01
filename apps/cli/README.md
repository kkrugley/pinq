# pinq

Pair-In Quick CLI for receiving text and files from the mobile PWA via WebRTC DataChannels.

## Installation

```bash
# if published to npm
pnpm install -g pinq

# or run from this repo without installing globally
pnpm --filter pinq build
node apps/cli/dist/index.js receive ABC123
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
- `SIGNALING_URL`: Override the signaling server URL (default: `https://pinq.onrender.com`)
- `DOWNLOAD_DIR`: Override the default download directory for all runs

### Notes
- Pairing codes are 6 characters and exclude `O`/`0` to reduce input mistakes.
- The CLI pre-warms the signaling server and uses ~90s timeouts to survive Render cold starts.

## Development

```bash
pnpm install
pnpm --filter pinq build   # compile to dist/
pnpm --filter pinq test    # run Node.js tests (@roamhq/wrtc required)
```

## Publishing
To publish a new version to npm:
1. Bump the version in `package.json`.
2. Build the CLI:
   ```bash
   pnpm --filter pinq build
   ```
3. Publish:
   ```bash
   cd apps/cli
   pnpm publish --access public
   ```
For Homebrew/Winget, point installers at the npm tarball produced by the publish step.

## Protocol
- Uses Socket.io for signaling with 6-character pairing codes (TTL ~5 minutes)
- First DataChannel message carries metadata (`text` or `file` descriptors)
- Subsequent messages are 16 KB chunks, terminated by `EOF`
- Desktop sends `ACK` after successfully writing/printing the payload
