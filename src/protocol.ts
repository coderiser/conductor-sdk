export const PROTOCOL_VERSION = 1;

export type ClientMessage =
  | { type: 'hello'; version: number }
  | { type: 'spawn'; agent: string; cwd: string; cols: number; rows: number; sessionId?: string }
  | { type: 'write'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'kill'; sessionId: string }
  | { type: 'list' };

export type DaemonMessage =
  | { type: 'hello-ack'; version: number }
  | { type: 'spawned'; sessionId: string; pid: number; agent: string }
  | { type: 'output'; sessionId: string; data: string }
  | { type: 'exit'; sessionId: string; code: number }
  | { type: 'list-response'; sessions: SessionInfo[] }
  | { type: 'error'; message: string };

export interface SessionInfo {
  sessionId: string;
  agent: string;
  cwd: string;
  pid: number;
  running: boolean;
}

export function encodeFrame(msg: ClientMessage | DaemonMessage): Buffer {
  const json = JSON.stringify(msg);
  const buf = Buffer.from(json, 'utf-8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

export class FrameDecoder {
  private buffer = Buffer.alloc(0);
  feed(chunk: Buffer): (ClientMessage | DaemonMessage)[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const msgs: (ClientMessage | DaemonMessage)[] = [];
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + len) break;
      const json = this.buffer.subarray(4, 4 + len).toString('utf-8');
      this.buffer = this.buffer.subarray(4 + len);
      try { msgs.push(JSON.parse(json)); } catch { /* skip malformed */ }
    }
    return msgs;
  }
}
