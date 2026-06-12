import net from 'net';
import { EventEmitter } from 'events';
import { daemonSocketPath } from './platform.js';
import { encodeFrame, FrameDecoder, type ClientMessage, type DaemonMessage } from './protocol.js';

export class DaemonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private decoder = new FrameDecoder();
  private resolvers: ((msg: DaemonMessage) => void)[] = [];
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;
    const path = daemonSocketPath();
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(path, () => {
        this.socket!.write(encodeFrame({ type: 'hello', version: 1 }));
        // Wait for hello-ack before resolving
        this.resolvers.push((msg) => {
          if (msg.type === 'hello-ack') {
            this.connected = true;
            resolve();
          } else {
            reject(new Error('Expected hello-ack, got ' + msg.type));
          }
        });
      });
      this.socket.on('data', (chunk: Buffer) => {
        for (const msg of this.decoder.feed(chunk)) {
          const dm = msg as DaemonMessage;
          // Route to resolver (FIFO)
          if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift()!;
            resolve(dm);
          }
          // Emit output/exit as events (not consumed by resolvers)
          if (dm.type === 'output' || dm.type === 'exit') {
            this.emit(dm.type, dm);
          }
        }
      });
      this.socket.on('error', (err) => { this.connected = false; reject(err); });
      this.socket.on('close', () => { this.connected = false; });
    });
  }

  async request(msg: ClientMessage): Promise<DaemonMessage> {
    if (!this.socket || !this.connected) await this.connect();
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
      this.socket!.write(encodeFrame(msg));
    });
  }

  send(msg: ClientMessage): void {
    if (this.socket && this.connected) this.socket.write(encodeFrame(msg));
  }

  disconnect(): void { this.socket?.destroy(); this.socket = null; this.connected = false; }
}
