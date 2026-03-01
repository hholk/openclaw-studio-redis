type MsgEvent = { data: string };
type CloseEventLike = { code: number; reason: string };

export class RedisSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState = RedisSocket.CONNECTING;
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: MsgEvent) => void) | null = null;
  public onclose: ((ev: CloseEventLike) => void) | null = null;
  public onerror: (() => void) | null = null;

  private sessionId: string | null = null;
  private closed = false;

  constructor(_url: string) {
    void this.init();
  }

  private async init() {
    try {
      const res = await fetch("/api/gateway/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open" }),
      });
      const data = await res.json();
      this.sessionId = data.sessionId;
      this.readyState = RedisSocket.OPEN;
      this.onopen?.();
      void this.poll();
    } catch {
      this.readyState = RedisSocket.CLOSED;
      this.onerror?.();
      this.onclose?.({ code: 1011, reason: "redis socket open failed" });
    }
  }

  private async poll() {
    while (!this.closed && this.sessionId) {
      try {
        const res = await fetch(`/api/gateway/frame?sessionId=${encodeURIComponent(this.sessionId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (data?.frame) {
          this.onmessage?.({ data: data.frame });
        } else {
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  send(message: string) {
    if (!this.sessionId || this.readyState !== RedisSocket.OPEN) return;
    void fetch("/api/gateway/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this.sessionId, action: "send", message }),
    });
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    this.readyState = RedisSocket.CLOSED;
    if (this.sessionId) {
      void fetch("/api/gateway/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, action: "close" }),
      });
    }
    this.onclose?.({ code, reason });
  }
}
