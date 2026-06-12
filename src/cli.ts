import { Command } from 'commander';
import { DaemonClient } from './client.js';
import { loadAgentConfig } from './agent-config.js';

const program = new Command();
const client = new DaemonClient();

program
  .name('conductor')
  .description('Cross-platform CLI for AI agent terminal sessions')
  .version('1.0.0');

// ── spawn ──
program.command('spawn')
  .description('Spawn a new AI agent session')
  .argument('<agent>', 'Agent ID (claude, opencode, codex, cmd)')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('--cols <n>', 'Terminal columns', '120')
  .option('--rows <n>', 'Terminal rows', '40')
  .option('--session-id <id>', 'Agent session ID for resume')
  .action(async (agent, opts) => {
    try {
      await client.connect();
      const resp = await client.request({
        type: 'spawn', agent,
        cwd: opts.cwd, cols: parseInt(opts.cols), rows: parseInt(opts.rows),
        sessionId: opts.sessionId,
      });
      if (resp.type === 'error') { console.error('Error:', resp.message); process.exit(1); }
      const s = resp as any;
      console.log(`Spawned ${agent} — session: ${s.sessionId}, pid: ${s.pid}`);
      client.on('output', (msg: any) => {
        if (msg.sessionId === s.sessionId) process.stdout.write(msg.data);
      });
      client.on('exit', (msg: any) => {
        if (msg.sessionId === s.sessionId) {
          console.log(`\n[${agent}] exited with code ${msg.code}`);
          client.disconnect(); process.exit(msg.code);
        }
      });
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on('data', (d: Buffer) => client.send({ type: 'write', sessionId: s.sessionId, data: d.toString() }));
      process.on('SIGINT', () => { client.send({ type: 'kill', sessionId: s.sessionId }); client.disconnect(); process.exit(0); });
    } catch (err: any) {
      console.error('Daemon not running. Start with: conductor-daemon');
      process.exit(1);
    }
  });

// ── list ──
program.command('list')
  .description('List active sessions')
  .action(async () => {
    try {
      await client.connect();
      const resp = await client.request({ type: 'list' });
      if (resp.type === 'list-response') {
        if (resp.sessions.length === 0) { console.log('No active sessions.'); }
        else {
          console.log('ID       Agent     PID     CWD');
          console.log('-------- -------- ------- ----');
          for (const s of resp.sessions) console.log(`${s.sessionId.padEnd(9)} ${s.agent.padEnd(9)} ${String(s.pid).padEnd(7)} ${s.cwd}`);
        }
      }
      client.disconnect();
    } catch { console.error('Daemon not running. Start with: conductor-daemon'); process.exit(1); }
  });

// ── kill ──
program.command('kill')
  .description('Kill a session')
  .argument('<session-id>', 'Session ID')
  .action(async (sid) => {
    try { await client.connect(); client.send({ type: 'kill', sessionId: sid }); console.log('Killed ' + sid); client.disconnect(); }
    catch { console.error('Daemon not running.'); process.exit(1); }
  });

// ── agents ──
program.command('agents')
  .description('List available AI agents')
  .action(() => {
    const agents = loadAgentConfig();
    console.log('ID        Name              Command');
    console.log('-------- ----------------- -------');
    for (const a of agents) console.log(`${a.id.padEnd(9)} ${a.name.padEnd(18)} ${a.command}`);
  });

// ── info ──
program.command('info')
  .description('Show daemon status')
  .action(async () => {
    try {
      await client.connect();
      const resp = await client.request({ type: 'list' });
      console.log('Daemon: connected');
      if (resp.type === 'list-response') console.log('Sessions: ' + resp.sessions.length);
      client.disconnect();
    } catch { console.log('Daemon: not running\nStart with: conductor-daemon'); }
  });

program.parse();
