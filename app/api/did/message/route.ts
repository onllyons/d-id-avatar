export const runtime = "nodejs";

import { getDidAuth } from "@/lib/didAuth";
import { NextResponse } from "next/server";

const DID_API_BASE = process.env.DID_API_BASE_URL ?? "https://api.d-id.com";

export async function POST(req: Request) {
  const agentId = process.env.DID_AGENT_ID;
  if (!agentId) {
    return NextResponse.json({ error: "Missing DID_AGENT_ID" }, { status: 500 });
  }

  const { stream_id, session_id, text } = await req.json();

  if (!stream_id || !session_id || !text) {
    return NextResponse.json(
      { error: "stream_id, session_id and text are required" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `${DID_API_BASE}/agents/${agentId}/streams/${stream_id}`,
    {
      method: "POST",
      headers: {
        Authorization: getDidAuth(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        session_id,
        script: {
          type: "text",
          input: text,
        },
      }),
    }
  );

  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    return NextResponse.json({ error: body }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
