import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const Schema = z.object({
  command: z.string().min(1),
  projectId: z.string().optional().default("sidecar-001"),
  sessionLabel: z.string().optional().default("studio"),
  chatSessionId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { command, projectId, sessionLabel, chatSessionId } = parsed.data;
    const messageId = randomUUID();

    const sidecarUrl =
      process.env.SIDECAR_API_URL ?? "https://openclaw-sidecar.vercel.app";

    const res = await fetch(`${sidecarUrl}/api/actions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        kind: "chat.message",
        payload: {
          text: command,
          sessionLabel,
          chatSessionId: chatSessionId ?? messageId,
        },
      }),
    });

    const data = await res.json();
    return NextResponse.json({ messageId, actionId: data.actionId, status: "queued" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
