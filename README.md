# conductor-sdk

> Cross-platform SDK for spawning and managing AI agent terminal sessions (Claude Code, Codex, OpenCode).

Windows, macOS, and Linux. One daemon. Any agent.

## Quick Start

```bash
npm install -g conductor-sdk
conductor-daemon &          # start daemon
conductor spawn claude      # start Claude Code
```

## Commands

```bash
conductor spawn <agent>          # Spawn AI agent (claude/codex/opencode/cmd)
conductor spawn claude -c ./dir  # Spawn in specific directory
conductor list                   # List active sessions
conductor kill <session-id>      # Kill a session
conductor agents                 # List available agents
conductor info                   # Daemon status
conductor-daemon                 # Start daemon
```

## Architecture

```
conductor (CLI) ←→ daemon (PtyManager) ←→ AI Agent (PTY)
   Named Pipe / Unix Socket          node-pty
```

The daemon communicates via length-prefixed JSON frames (`4-byte BE length + JSON`).

## Agent Config

Stored at:
- Windows: `%LOCALAPPDATA%\conductor\agents.json`
- macOS/Linux: `~/.config/conductor/agents.json`

Default agents: cmd, claude, opencode, codex. Add custom agents by editing this file.

## Programmatic API

```js
import { DaemonClient } from 'conductor-sdk';
const client = new DaemonClient();
await client.connect();
const s = await client.request({ type: 'spawn', agent: 'claude', cwd: '.', cols: 120, rows: 40 });
client.on('output', msg => process.stdout.write(msg.data));
client.send({ type: 'write', sessionId: s.sessionId, data: 'hi\n' });
```

## Build

```bash
git clone https://github.com/coderiser/conductor-sdk.git
cd conductor-sdk && npm install && npm run build
```

Output: `dist/cli.js` (117 KB) + `dist/daemon.js` (4.5 KB)

## Platform

| OS | IPC | PTY |
|----|-----|-----|
| Windows | `\\.\pipe\conductor-daemon` | ConPTY |
| macOS/Linux | `/tmp/conductor-daemon.sock` | forkpty |

## License

MIT
