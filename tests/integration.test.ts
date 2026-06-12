import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_PATH = path.resolve(__dirname, '../dist/daemon.js');
const PIPE = '\\\\.\\pipe\\conductor-daemon';

function createDecoder() {
  let buffer = Buffer.alloc(0);
  return {
    feed(chunk: Buffer): any[] {
      buffer = Buffer.concat([buffer, chunk]);
      const msgs: any[] = [];
      while (buffer.length >= 4) {
        const len = buffer.readUInt32BE(0);
        if (buffer.length < 4 + len) break;
        const json = buffer.subarray(4, 4 + len).toString('utf-8');
        buffer = buffer.subarray(4 + len);
        try { msgs.push(JSON.parse(json)); } catch { /* skip */ }
      }
      return msgs;
    }
  };
}

function encode(msg: Record<string, unknown>): Buffer {
  const json = JSON.stringify(msg);
  const buf = Buffer.from(json, 'utf-8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length);
  return Buffer.concat([len, buf]);
}

function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(PIPE, () => resolve(sock));
    sock.on('error', reject);
  });
}

async function request(msg: Record<string, unknown>): Promise<any> {
  const sock = await connect();
  return new Promise((resolve) => {
    const dec = createDecoder();
    sock.on('data', (chunk: Buffer) => {
      for (const m of dec.feed(chunk)) { sock.destroy(); resolve(m); }
    });
    sock.write(encode(msg));
  });
}

describe('conductor-sdk Integration', () => {
  let daemon: ChildProcess | null = null;

  beforeAll(async () => {
    daemon = spawn('node', [DAEMON_PATH], { stdio: 'pipe', detached: false });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Daemon start timeout')), 10000);
      daemon!.stdout?.on('data', (d: Buffer) => {
        if (d.toString().includes('daemon')) { clearTimeout(t); setTimeout(resolve, 300); }
      });
      daemon!.on('error', reject);
    });
  }, 15000);

  afterAll(() => { daemon?.kill(); });

  it('connects and receives hello-ack', async () => {
    const resp = await request({ type: 'hello', version: 1 });
    expect(resp.type).toBe('hello-ack');
  });

  it('spawns cmd.exe, writes command, receives output', async () => {
    const sock = await connect();
    const dec = createDecoder();
    sock.write(encode({ type: 'hello', version: 1 }));

    const spawned: any = await new Promise((resolve) => {
      sock.on('data', (chunk: Buffer) => {
        for (const m of dec.feed(chunk)) {
          if (m.type === 'hello-ack') {
            sock.write(encode({ type: 'spawn', agent: 'cmd', cwd: process.cwd(), cols: 80, rows: 10 }));
          } else if (m.type === 'spawned') resolve(m);
        }
      });
    });

    expect(spawned.agent).toBe('cmd');
    expect(spawned.pid).toBeGreaterThan(0);

    sock.write(encode({ type: 'write', sessionId: spawned.sessionId, data: 'echo TEST_OK\r\n' }));

    const output: string[] = [];
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => resolve(), 4000);
      sock.on('data', (chunk: Buffer) => {
        for (const m of dec.feed(chunk)) {
          if (m.type === 'output' && m.sessionId === spawned.sessionId) {
            output.push(m.data);
            if (output.join('').includes('TEST_OK')) { clearTimeout(t); resolve(); }
          }
        }
      });
    });

    expect(output.join('')).toContain('TEST_OK');
    sock.write(encode({ type: 'kill', sessionId: spawned.sessionId }));
    sock.destroy();
  });

  it('lists active sessions', async () => {
    const sock = await connect();
    const dec = createDecoder();
    let sid = '';
    await new Promise<void>((resolve) => {
      sock.on('data', (chunk: Buffer) => {
        for (const m of dec.feed(chunk)) {
          if (m.type === 'hello-ack') sock.write(encode({ type: 'spawn', agent: 'cmd', cwd: '.', cols: 80, rows: 10 }));
          else if (m.type === 'spawned') { sid = m.sessionId; resolve(); }
        }
      });
      sock.write(encode({ type: 'hello', version: 1 }));
    });

    const list = await request({ type: 'list' });
    expect(list.sessions.find((s: any) => s.sessionId === sid)).toBeDefined();
    sock.write(encode({ type: 'kill', sessionId: sid }));
    sock.destroy();
  });

  it('kills session and confirms removal', async () => {
    const sock = await connect();
    const dec = createDecoder();
    let sid = '';
    await new Promise<void>((resolve) => {
      sock.on('data', (chunk: Buffer) => {
        for (const m of dec.feed(chunk)) {
          if (m.type === 'hello-ack') sock.write(encode({ type: 'spawn', agent: 'cmd', cwd: '.', cols: 80, rows: 10 }));
          else if (m.type === 'spawned') { sid = m.sessionId; resolve(); }
        }
      });
      sock.write(encode({ type: 'hello', version: 1 }));
    });
    sock.write(encode({ type: 'kill', sessionId: sid }));
    await new Promise<void>((resolve) => {
      sock.on('data', (chunk: Buffer) => {
        for (const m of dec.feed(chunk)) { if (m.type === 'exit' && m.sessionId === sid) resolve(); }
      });
    });
    const list = await request({ type: 'list' });
    expect(list.sessions.find((s: any) => s.sessionId === sid)).toBeUndefined();
    sock.destroy();
  });

  it('errors on unknown agent', async () => {
    const resp = await request({ type: 'spawn', agent: 'nonexistent', cwd: '.', cols: 80, rows: 10 });
    expect(resp.type).toBe('error');
  });

  it('handles 3 concurrent sessions', async () => {
    const sock = await connect();
    const dec = createDecoder();
    const sids: string[] = [];
    let spawned = 0;
    await new Promise<void>((resolve) => {
      sock.on('data', (chunk: Buffer) => {
        for (const m of dec.feed(chunk)) {
          if (m.type === 'hello-ack') { for (let i=0;i<3;i++) sock.write(encode({type:'spawn',agent:'cmd',cwd:'.',cols:80,rows:10})); }
          else if (m.type === 'spawned') { sids.push(m.sessionId); spawned++; if (spawned===3) resolve(); }
        }
      });
      sock.write(encode({ type: 'hello', version: 1 }));
    });
    expect(new Set(sids).size).toBe(3);
    const list = await request({ type: 'list' });
    expect(list.sessions.filter((s:any)=>sids.includes(s.sessionId)).length).toBe(3);
    for (const id of sids) sock.write(encode({ type: 'kill', sessionId: id }));
    sock.destroy();
  });
});
