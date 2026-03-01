import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? "sidecar-001";
    const sidecarUrl =
      process.env.SIDECAR_API_URL ?? "https://openclaw-sidecar.vercel.app";

    const res = await fetch(
      `${sidecarUrl}/api/projects/${projectId}/latest`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
