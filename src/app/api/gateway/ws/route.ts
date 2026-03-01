// /api/gateway/ws — Redis WS Bridge for Vercel Edge
// Accepts browser WebSocket connections and relays them via Upstash Redis
// to the local redis-bridge.js running on the Mac mini.
//
// Flow: Browser <-WS-> Vercel Edge <-Redis RPUSH/RPOP-> local bridge <-WS-> OpenClaw Gateway

export const runtime = "edge";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;
const CMD_KEY = "studio:ws:commands";

function encKey(key: string): string {
  return encodeURIComponent(key);
}

async function redisPush(key: string, value: unknown): Promise<void> {
  await fetch(`${REDIS_URL}/rpush/${encKey(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
}

async function redisRPop(key: string): Promise<string | null> {
  const res = await fetch(`${REDIS_URL}/rpop/${encKey(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = (await res.json()) as { result: string | null };
  return data.result ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const upgrade = req.headers.get("upgrade");
  if (upgrade?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // @ts-expect-error - Vercel/Cloudflare Edge WebSocket upgrade
  const { socket, response } = Deno.upgradeWebSocket(req);

  const sessionId = crypto.randomUUID();
  const resKey = `studio:ws:res:${sessionId}`;
  let open = true;

  socket.onopen = async () => {
    // Notify local bridge
    await redisPush(CMD_KEY, { sessionId, action: "open" });

    // Poll for responses from local bridge
    const poll = async () => {
      while (open && socket.readyState === WebSocket.OPEN) {
        try {
          const msg = await redisRPop(resKey);
          if (msg !== null) {
            // Check for bridge-close signal
            try {
              const parsed = JSON.parse(msg) as { _bridgeClose?: boolean; code?: number; reason?: string };
              if (parsed._bridgeClose) {
                socket.close(parsed.code ?? 1011, parsed.reason ?? "bridge closed");
                open = false;
                break;
              }
            } catch {
              // not JSON or not a close signal - forward as-is
            }
            socket.send(msg);
          } else {
            // No message yet, small delay
            await new Promise((r) => setTimeout(r, 100));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    };

    poll().catch(console.error);
  };

  socket.onmessage = async (ev: MessageEvent) => {
    const message = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
    await redisPush(CMD_KEY, { sessionId, message });
  };

  socket.onclose = async () => {
    open = false;
    await redisPush(CMD_KEY, { sessionId, action: "close" });
  };

  return response;
}
