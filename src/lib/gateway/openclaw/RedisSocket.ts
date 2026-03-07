type MsgEvent = { data: string };
type CloseEventLike = { code: number; reason: string };

// HMAC-SHA256 helper (browser-compatible via Web Crypto API)
async function hmacSha256(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomNonce(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

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
  private pollInterval = 50; // Start fast
  private lastMessageTs = Date.now();
  private secret: string;

  constructor(_url: string) {
    // Read secret from env (injected at build time)
    this.secret = (typeof window !== "undefined" && (window as any).__BRIDGE_SECRET__) || "";
    void this.init();
  }

  private async signPost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.secret) return body;
    const ts = Date.now();
    const nonce = randomNonce();
    const sid = (body.sessionId as string) || "";
    const payload = `${sid}:${ts}:${nonce}`;
    const sig = await hmacSha256(payload, this.secret);
    return { ...body, ts, nonce, sig };
  }

  private async signGet(sessionId: string): Promise<{ ts: number; sig: string }> {
    const ts = Date.now();
    const sig = this.secret ? await hmacSha256(`${sessionId}:${ts}`, this.secret) : "";
    return { ts, sig };
  }

  private async init() {
    try {
      const signedBody = await this.signPost({ action: "open" });
      const res = await fetch("/api/gateway/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody),
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
        const { ts, sig } = await this.signGet(this.sessionId);
        const res = await fetch(
          `/api/gateway/frame?sessionId=${encodeURIComponent(this.sessionId)}&ts=${ts}&sig=${encodeURIComponent(sig)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data?.frame) {
          this.lastMessageTs = Date.now();
          this.pollInterval = 50; // Reset to fast polling
          this.onmessage?.({ data: data.frame });
        } else {
          // Adaptive backoff
          const idle = Date.now() - this.lastMessageTs;
          if (idle > 3000) this.pollInterval = Math.min(1000, this.pollInterval * 1.5);
          else if (idle > 500) this.pollInterval = Math.min(500, this.pollInterval * 1.2);
          await new Promise((r) => setTimeout(r, this.pollInterval));
        }
      } catch {
        this.pollInterval = Math.min(1000, this.pollInterval * 2);
        await new Promise((r) => setTimeout(r, this.pollInterval));
      }
    }
  }

  async send(message: string) {
    if (!this.sessionId || this.readyState !== RedisSocket.OPEN) return;
    const signedBody = await this.signPost({ sessionId: this.sessionId, action: "send", message });
    await fetch("/api/gateway/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedBody),
    });
  }

  async close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    this.readyState = RedisSocket.CLOSED;
    if (this.sessionId) {
      const signedBody = await this.signPost({ sessionId: this.sessionId, action: "close" });
      await fetch("/api/gateway/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedBody),
      });
    }
    this.onclose?.({ code, reason });
  }
}
