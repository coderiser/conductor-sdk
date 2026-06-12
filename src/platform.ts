import os from 'os';
import path from 'path';

const IS_WINDOWS = process.platform === 'win32';

export function daemonSocketPath(): string {
  if (IS_WINDOWS) return '\\\\.\\pipe\\conductor-daemon';
  return path.join(os.tmpdir(), 'conductor-daemon.sock');
}

export function configDir(): string {
  if (IS_WINDOWS) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'conductor');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'conductor');
}

export function defaultShell(): string {
  return IS_WINDOWS ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');
}

/** Open a new terminal window running the given command. */
export function openTerminal(cmd: string, args: string[]): void {
  const { spawn } = require('child_process');
  if (IS_WINDOWS) {
    // Try Windows Terminal first, fall back to cmd
    spawn('wt', ['-d', process.cwd(), '--', cmd, ...args], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', '--args', cmd, ...args], { detached: true, stdio: 'ignore' }).unref();
  } else {
    const term = process.env.TERMINAL || '';
    if (term.includes('gnome')) {
      spawn('gnome-terminal', ['--', cmd, ...args], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('x-terminal-emulator', ['-e', [cmd, ...args].join(' ')], { detached: true, stdio: 'ignore' }).unref();
    }
  }
}

export { IS_WINDOWS };
