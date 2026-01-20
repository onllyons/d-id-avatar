export const runtime = "nodejs";

import { getDidAuth } from "@/lib/didAuth";
import { NextResponse } from "next/server";

const DID_API_BASE = process.env.DID_API_BASE_URL ?? "https://api.d-id.com";

export async function POST(req: Request) {
  const agentId = process.env.DID_AGENT_ID;
  if (!agentId) {
    return NextResponse.json({ error: "Missing DID_AGENT_ID" }, { status: 500 });
  }

  const raw = await req.text();
  console.log("SDP ROUTE RAW BODY:", raw);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON", raw }, { status: 400 });
  }

  const { stream_id, session_id, sdp, type } = payload;

  console.log("SDP ROUTE PARSED:", {
    stream_id,
    session_id,
    hasSdp: !!sdp,
    sdpLength: sdp?.length,
    type,
  });

  if (!stream_id || !session_id || !sdp) {
    return NextResponse.json(
      { error: "stream_id, session_id and sdp are required" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `${DID_API_BASE}/agents/${agentId}/streams/${stream_id}/sdp`,
    {
      method: "POST",
      headers: {
        Authorization: getDidAuth(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        session_id,
        answer: {              // ✅ AȘA VREA D-ID
          type: type ?? "answer",
          sdp,
        },
      }),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: text }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
