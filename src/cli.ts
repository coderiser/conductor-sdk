import { Command } from 'commander';
import { DaemonClient } from './client.js';
import { loadAgentConfig } from './agent-config.js';
import { openTerminal } from './platform.js';

const program = new Command();

program
  .name('conductor')
  .description('Cross-platform CLI for AI agent terminal sessions')
  .version('1.0.1');

// ── spawn: start a session (returns immediately) ──

program.command('spawn')
  .description('Spawn a new AI agent session in the background')
  .argument('<agent>', 'Agent ID (claude, opencode, codex, cmd)')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('--cols <n>', 'Terminal columns', '120')
  .option('--rows <n>', 'Terminal rows', '40')
  .option('--session-id <id>', 'Agent session ID for resume')
  .option('-a, --attach', 'Attach stdin/stdout immediately (foreground mode)')
  .option('--new', 'Open a new terminal window (platform-specific)')
  .action(async (agent, opts) => {
    try {
      const client = new DaemonClient();
      await client.connect();
      const resp = await client.request({
        type: 'spawn', agent,
        cwd: opts.cwd, cols: parseInt(opts.cols), rows: parseInt(opts.rows),
        sessionId: opts.sessionId,
      });
      if (resp.type === 'error') { console.error('Error:', resp.message); process.exit(1); }
      const s = resp as { type: 'spawned'; sessionId: string; pid: number; agent: string };

      // If --new: open a terminal window and exit
      if (opts.new) {
        console.log(`Opening ${agent} in new terminal — session: ${s.sessionId}`);
        openTerminal('conductor', ['attach', s.sessionId]);
        client.disconnect();
        return;
      }

      // If --attach: foreground mode (pipe stdin/stdout)
      if (opts.attach) {
        console.log(`Attached to ${agent} — session: ${s.sessionId}, pid: ${s.pid}`);
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
        return;
      }

      // Default: background mode — print info and exit
      console.log(`Spawned ${s.agent} — session: ${s.sessionId}, pid: ${s.pid}`);
      console.log(`Attach with: conductor attach ${s.sessionId}`);
      console.log(`  or open in new terminal: conductor attach ${s.sessionId} --new`);
      client.disconnect();
    } catch (err: any) {
      console.error('Daemon not running. Start with: conductor-daemon');
      process.exit(1);
    }
  });

// ── attach: connect to a running session ──

program.command('attach')
  .description('Attach to a running agent session')
  .argument('<session-id>', 'Session ID to attach to')
  .option('--new', 'Open in a new terminal window instead')
  .action(async (sid, opts) => {
    // If --new: re-spawn ourselves in a new terminal
    if (opts.new) {
      console.log(`Opening session ${sid} in new terminal...`);
      openTerminal('conductor', ['attach', sid]);
      return;
    }

    try {
      const client = new DaemonClient();
      await client.connect();

      // Get session info
      const resp = await client.request({ type: 'list' });
      if (resp.type === 'list-response') {
        const info = resp.sessions.find((s: any) => s.sessionId === sid);
        if (!info) { console.error('Session not found:', sid); process.exit(1); }
        if (!info.running) { console.error('Session has exited:', sid); process.exit(1); }
        console.log(`Attached to ${info.agent} — session: ${sid}, pid: ${info.pid}, cwd: ${info.cwd}`);
      }

      // Pipe output
      client.on('output', (msg: any) => {
        if (msg.sessionId === sid) process.stdout.write(msg.data);
      });
      client.on('exit', (msg: any) => {
        if (msg.sessionId === sid) {
          console.log(`\nSession ${sid} exited with code ${msg.code}`);
          client.disconnect(); process.exit(msg.code);
        }
      });

      // Pipe stdin
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on('data', (d: Buffer) => client.send({ type: 'write', sessionId: sid, data: d.toString() }));

      process.on('SIGINT', () => {
        // Detach on Ctrl+C (don't kill the session)
        client.disconnect();
        console.log('\nDetached. Session still running.');
        console.log(`Re-attach: conductor attach ${sid}`);
        console.log(`Kill: conductor kill ${sid}`);
        process.exit(0);
      });
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
      const client = new DaemonClient();
      await client.connect();
      const resp = await client.request({ type: 'list' });
      if (resp.type === 'list-response') {
        if (resp.sessions.length === 0) { console.log('No active sessions.'); }
        else {
          console.log('ID       Agent     PID     CWD');
          console.log('-------- -------- ------- ----');
          for (const s of resp.sessions) {
            const marker = s.running ? ' ' : '✕';
            console.log(`${marker}${s.sessionId.padEnd(8)} ${s.agent.padEnd(9)} ${String(s.pid).padEnd(7)} ${s.cwd}`);
          }
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
    try { const client = new DaemonClient(); await client.connect(); client.send({ type: 'kill', sessionId: sid }); console.log('Killed ' + sid); client.disconnect(); }
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
      const client = new DaemonClient();
      await client.connect();
      const resp = await client.request({ type: 'list' });
      console.log('Daemon: connected');
      if (resp.type === 'list-response') console.log('Active sessions: ' + resp.sessions.length);
      client.disconnect();
    } catch { console.log('Daemon: not running\nStart with: conductor-daemon'); }
  });

// ── restart: restart the daemon ──

program.command('restart')
  .description('Restart the conductor daemon')
  .action(async () => {
    const { spawn } = await import('child_process');
    try {
      const client = new DaemonClient();
      await client.connect();
      console.log('Shutting down daemon...');
      client.send({ type: 'shutdown' });
      client.disconnect();
      // Wait for daemon to exit
      await new Promise(r => setTimeout(r, 1000));
      // Small delay to ensure old pipe is released
      await new Promise(r => setTimeout(r, 500));
    } catch {
      // Daemon may already be down
    }

    // Start new daemon
    console.log('Starting new daemon...');
    const child = spawn('conductor-daemon', [], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.unref();
    console.log(`Daemon restarted (PID: ${child.pid})`);
  });

program.parse();
