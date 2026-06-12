import net from 'net';
import fs from 'fs';
import { PtyManager } from './pty-manager.js';
import { loadAgentConfig, ensureAgentConfig } from './agent-config.js';
import { PROTOCOL_VERSION, encodeFrame, FrameDecoder, type ClientMessage, type DaemonMessage } from './protocol.js';
import { daemonSocketPath, IS_WINDOWS } from './platform.js';

const socketPath = daemonSocketPath();
const ptyManager = new PtyManager();
const agentConfigs = new Map(loadAgentConfig().map(a => [a.id, a]));
let sessionCounter = 0;
const clients = new Set<net.Socket>();

function nextId(): string { return 'S' + (++sessionCounter); }

function broadcast(msg: DaemonMessage): void {
  const frame = encodeFrame(msg);
  for (const sock of clients) { try { sock.write(frame); } catch { clients.delete(sock); } }
}

ptyManager.setOutputHandler((sid, data) => broadcast({ type: 'output', sessionId: sid, data }));
ptyManager.setExitHandler((sid, code) => broadcast({ type: 'exit', sessionId: sid, code }));

function handle(sock: net.Socket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'hello':
      sock.write(encodeFrame({ type: 'hello-ack', version: PROTOCOL_VERSION }));
      break;
    case 'spawn': {
      const cfg = agentConfigs.get(msg.agent);
      if (!cfg) { sock.write(encodeFrame({ type: 'error', message: 'Unknown agent: ' + msg.agent })); return; }
      const sid = msg.sessionId || nextId();
      const s = ptyManager.spawn(sid, cfg, msg.cwd, msg.cols, msg.rows, false);
      sock.write(encodeFrame({ type: 'spawned', sessionId: sid, pid: s.pid, agent: msg.agent }));
      break;
    }
    case 'write': ptyManager.write(msg.sessionId, msg.data); break;
    case 'resize': ptyManager.resize(msg.sessionId, msg.cols, msg.rows); break;
    case 'kill': ptyManager.kill(msg.sessionId); break;
    case 'list': sock.write(encodeFrame({ type: 'list-response', sessions: ptyManager.list() })); break;
    case 'shutdown':
      console.log('[daemon] Shutting down...');
      ptyManager.killAll();
      if (!IS_WINDOWS) try { fs.unlinkSync(socketPath); } catch { /* ok */ }
      process.exit(0);
      break;
  }
}

function cleanup(): void {
  ptyManager.killAll();
  if (!IS_WINDOWS) try { fs.unlinkSync(socketPath); } catch { /* ok */ }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const server = net.createServer();
server.on('connection', (sock: net.Socket) => {
  clients.add(sock);
  const dec = new FrameDecoder();
  sock.on('data', (chunk: Buffer) => { for (const m of dec.feed(chunk)) handle(sock, m as ClientMessage); });
  sock.on('close', () => clients.delete(sock));
  sock.on('error', () => clients.delete(sock));
});

if (IS_WINDOWS) {
  server.listen(socketPath, () => { ensureAgentConfig(); console.log('[daemon] ' + socketPath); });
} else {
  try { fs.unlinkSync(socketPath); } catch { /* ok */ }
  server.listen(socketPath, () => { ensureAgentConfig(); console.log('[daemon] ' + socketPath); });
}
