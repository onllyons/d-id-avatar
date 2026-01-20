export const runtime = "nodejs";

import { getDidAuth } from "@/lib/didAuth";
import { NextResponse } from "next/server";

const DID_API_BASE = process.env.DID_API_BASE_URL ?? "https://api.d-id.com";

function cookieHeaderFromSetCookie(setCookie: string) {
  return setCookie
    .split(/,(?=[^;]+?=)/g)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}

export async function POST() {
  const agentId = process.env.DID_AGENT_ID;
  if (!agentId) {
    return NextResponse.json(
      { error: "Missing DID_AGENT_ID" },
      { status: 500 },
    );
  }

  const res = await fetch(`${DID_API_BASE}/agents/${agentId}/streams`, {
    method: "POST",
    headers: {
      Authorization: getDidAuth(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({}),
  });
  console.log("D-ID STATUS", res.status);
  const text = await res.text();
  console.log("D-ID BODY", text);
  console.log("D-ID COOKIE", res.headers.get("set-cookie"));
  console.log("D-ID stream response:", {
    status: res.status,
    headers: Object.fromEntries(res.headers),
    body: text,
  });

  if (!res.ok) {
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const json = JSON.parse(text);

  return NextResponse.json({
    stream_id: json.id,
    offer: json.offer,
    ice_servers: json.ice_servers,
    session_cookie: json.session_id,
  });
}
