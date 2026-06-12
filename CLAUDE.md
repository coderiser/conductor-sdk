# conductor-sdk

Cross-platform CLI for spawning and managing AI agent terminal sessions.

## Build
```bash
npm run build    # vite build
npm test         # vitest run (6 integration tests)
```

## Publish
```bash
npm login && npm publish --access public
```

## Architecture
```
conductor (CLI) ←→ daemon (PtyManager) ←→ AI Agent (PTY)
   pipe/socket                          node-pty
```

src/cli.ts — CLI (commander) | src/daemon.ts — daemon | src/client.ts — DaemonClient | src/protocol.ts — framing | src/pty-manager.ts — PTY lifecycle | src/agent-config.ts — config | src/platform.ts — cross-platform paths
