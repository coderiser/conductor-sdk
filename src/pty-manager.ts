import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import { resolveAgentArgs, type AgentConfig } from './agent-config.js';
import { IS_WINDOWS } from './platform.js';

export interface PtySession {
  sessionId: string;
  agent: string;
  cwd: string;
  pty: IPty;
  pid: number;
  running: boolean;
  startTime: number;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();
  private onOutput: ((sessionId: string, data: string) => void) | null = null;
  private onExit: ((sessionId: string, code: number) => void) | null = null;

  setOutputHandler(fn: (sessionId: string, data: string) => void): void { this.onOutput = fn; }
  setExitHandler(fn: (sessionId: string, code: number) => void): void { this.onExit = fn; }

  spawn(sessionId: string, config: AgentConfig, cwd: string, cols: number, rows: number, isResume: boolean): PtySession {
    const agentArgs = resolveAgentArgs(config, sessionId, isResume);
    let cmd: string;
    let args: string[];

    if (IS_WINDOWS) {
      // .exe files can be spawned directly; .cmd/.bat and bare commands need cmd.exe wrapper
      if (config.command.endsWith('.exe')) {
        cmd = config.command;
        args = agentArgs;
      } else {
        cmd = 'cmd.exe';
        args = ['/c', [config.command, ...agentArgs].join(' ')];
      }
    } else {
      cmd = config.command;
      args = agentArgs;
    }

    const pty = spawn(cmd, args, {
      name: 'xterm-256color',
      cols, rows,
      cwd: cwd || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' } as any,
    });

    const session: PtySession = {
      sessionId, agent: config.id,
      cwd: cwd || process.cwd(),
      pty, pid: pty.pid, running: true, startTime: Date.now(),
    };

    this.sessions.set(sessionId, session);

    pty.onData((data: string) => this.onOutput?.(sessionId, data));
    pty.onExit(({ exitCode }: { exitCode: number }) => {
      session.running = false;
      this.onExit?.(sessionId, exitCode);
    });

    return session;
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.pty.resize(cols, rows);
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s) { s.running = false; try { s.pty.kill(); } catch { /* ok */ } this.sessions.delete(sessionId); }
  }

  list(): { sessionId: string; agent: string; cwd: string; pid: number; running: boolean }[] {
    return Array.from(this.sessions.values()).map(s => ({
      sessionId: s.sessionId, agent: s.agent, cwd: s.cwd, pid: s.pid, running: s.running,
    }));
  }

  killAll(): void { for (const id of this.sessions.keys()) this.kill(id); }
}
