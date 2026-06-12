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

export { IS_WINDOWS };
