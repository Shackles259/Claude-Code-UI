import type { ServerMessage, BridgeEvent } from '@/types';

type EventHandler = (event: BridgeEvent) => void;
type StatusHandler = (status: 'connecting' | 'open' | 'closed' | 'error') => void;
type ControlHandler = (control: 'replay_start' | 'replayed', count: number) => void;

/**
 * Minimal WebSocket wrapper for one session's event stream.
 * Handles reconnect with exponential backoff.
 */
export class SessionSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private eventHandlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private controlHandlers = new Set<ControlHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  /** Messages queued while the socket is not yet OPEN. Flushed on open. */
  private outbox: unknown[] = [];

  constructor(sessionId: string) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${proto}//${window.location.host}/ws/${sessionId}`;
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onControl(handler: ControlHandler): () => void {
    this.controlHandlers.add(handler);
    return () => this.controlHandlers.delete(handler);
  }

  private setStatus(status: Parameters<StatusHandler>[0]): void {
    for (const h of this.statusHandlers) {
      try { h(status); } catch { /* noop */ }
    }
  }

  connect(): void {
    this.intentionallyClosed = false;
    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      // Flush any messages queued while connecting/reconnecting.
      this.flushOutbox();
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === 'event') {
          for (const h of this.eventHandlers) {
            try { h(msg.event); } catch { /* noop */ }
          }
        } else if (msg.type === 'replay_start') {
          for (const h of this.controlHandlers) {
            try { h('replay_start', msg.count); } catch { /* noop */ }
          }
        } else if (msg.type === 'replayed') {
          for (const h of this.controlHandlers) {
            try { h('replayed', 0); } catch { /* noop */ }
          }
        }
      } catch { /* ignore malformed */ }
    };
    this.ws.onclose = () => {
      this.setStatus('closed');
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.setStatus('error');
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else if (!this.intentionallyClosed) {
      // Queue until the socket is open; prevents dropping the first message
      // sent while the connection is still handshaking.
      this.outbox.push(data);
    }
  }

  private flushOutbox(): void {
    const queued = this.outbox;
    this.outbox = [];
    for (const msg of queued) {
      this.send(msg);
    }
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
