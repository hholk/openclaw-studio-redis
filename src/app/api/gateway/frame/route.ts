import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Redis Bridge Frame API — relays messages via Upstash Redis

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;
const CMD_KEY = "studio:ws:commands";

const enc = (v: string) => encodeURIComponent(v);

async function rpush(key: string, value: unknown) {
  await fetch(`${REDIS_URL}/rpush/${enc(key)}`, {
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
    };

    const sessionId = body.sessionId || crypto.randomUUID();
    await rpush(CMD_KEY, {
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
    if (!sessionId) return NextResponse.json({ ok: false, error: "missing sessionId" }, { status: 400 });

    const key = `studio:ws:res:${sessionId}`;
    const frame = await lpop(key);
    return NextResponse.json({ ok: true, frame });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
