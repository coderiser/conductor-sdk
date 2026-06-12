import fs from 'fs';
import path from 'path';
import { configDir } from './platform.js';

export interface AgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  createTemplate: string;
  resumeTemplate: string;
  setup: string[];
  builtin: boolean;
}

export const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'cmd', name: 'Command Prompt', command: 'cmd.exe', args: [],
    createTemplate: '', resumeTemplate: '', setup: [], builtin: true },
  { id: 'claude', name: 'Claude Code', command: 'claude',
    args: [], createTemplate: '--session-id {session_id}',
    resumeTemplate: '--resume {session_id}', setup: [], builtin: false },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: [],
    createTemplate: '', resumeTemplate: '--session {session_id}',
    setup: [], builtin: false },
  { id: 'codex', name: 'Codex', command: 'codex', args: [],
    createTemplate: '', resumeTemplate: 'resume {session_id}',
    setup: [], builtin: false },
];

export function resolveAgentArgs(config: AgentConfig, sessionId: string, isResume: boolean): string[] {
  const template = isResume && config.resumeTemplate ? config.resumeTemplate : config.createTemplate;
  const args = [...config.args];
  if (template) {
    for (const part of template.split(' ')) {
      args.push(part.replace('{session_id}', sessionId));
    }
  }
  return args;
}

export function loadAgentConfig(): AgentConfig[] {
  const cfgPath = path.join(configDir(), 'agents.json');
  try {
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      return (raw.agents || DEFAULT_AGENTS).map((e: any) => ({
        id: e.id ?? '', name: e.name ?? e.id ?? '',
        command: e.command ?? '', args: e.args ?? [],
        createTemplate: e.create_template ?? e.createTemplate ?? '',
        resumeTemplate: e.resume_template ?? e.resumeTemplate ?? '',
        setup: e.setup ?? [], builtin: e.builtin ?? false,
      }));
    }
  } catch { /* fall through */ }
  return DEFAULT_AGENTS;
}

export function ensureAgentConfig(): void {
  const dir = configDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const cfgPath = path.join(dir, 'agents.json');
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, JSON.stringify({ agents: DEFAULT_AGENTS }, null, 2));
  }
}
