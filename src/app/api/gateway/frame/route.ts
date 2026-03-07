import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const runtime = "nodejs";

// Redis Bridge Frame API — relays messages via Upstash Redis
// HMAC-authenticated for security

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;
const BRIDGE_SECRET = process.env.STUDIO_BRIDGE_SECRET || "";
const CMD_KEY = "studio:ws:commands";

const enc = (v: string) => encodeURIComponent(v);

// HMAC-SHA256 signature
function computeSig(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function verifySig(payload: string, sig: string, secret: string): boolean {
  if (!secret) return true; // If no secret configured, skip auth (dev mode)
  const expected = computeSig(payload, secret);
  return sig === expected;
}

async function lpush(key: string, value: unknown) {
  await fetch(`${REDIS_URL}/lpush/${enc(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
    cache: "no-store",
  });
}

async function lpop(key: string) {
  const res = await fetch(`${REDIS_URL}/lpop/${enc(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: "no-store",
  });
  const data = (await res.json()) as { result: string | null };
  return data.result;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      action: "open" | "send" | "close";
      message?: string;
      ts?: number;
      nonce?: string;
      sig?: string;
    };

    // HMAC verification
    if (BRIDGE_SECRET) {
      const { ts, nonce, sig, sessionId } = body;
      if (!ts || !nonce || !sig || !sessionId) {
        return NextResponse.json({ ok: false, error: "missing auth fields" }, { status: 401 });
      }
      // Reject old requests (>60s)
      if (Math.abs(Date.now() - ts) > 60000) {
        return NextResponse.json({ ok: false, error: "timestamp expired" }, { status: 401 });
      }
      const payload = `${sessionId}:${ts}:${nonce}`;
      if (!verifySig(payload, sig, BRIDGE_SECRET)) {
        return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
      }
    }

    const sessionId = body.sessionId || crypto.randomUUID();
    // LPUSH for FIFO ordering (bridge will RPOP)
    await lpush(CMD_KEY, {
      sessionId,
      action: body.action,
      message: body.message,
    });

    return NextResponse.json({ ok: true, sessionId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const ts = url.searchParams.get("ts");
    const sig = url.searchParams.get("sig");

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });
    }

    // HMAC verification for GET
    if (BRIDGE_SECRET) {
      if (!ts || !sig) {
        return NextResponse.json({ ok: false, error: "missing auth params" }, { status: 401 });
      }
      // Coarse timestamp window (current minute)
      const tsNum = parseInt(ts, 10);
      if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 60000) {
        return NextResponse.json({ ok: false, error: "timestamp expired" }, { status: 401 });
      }
      const payload = `${sessionId}:${ts}`;
      if (!verifySig(payload, sig, BRIDGE_SECRET)) {
        return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
      }
    }

    const key = `studio:ws:res:${sessionId}`;
    const frame = await lpop(key);
    return NextResponse.json({ ok: true, frame });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
