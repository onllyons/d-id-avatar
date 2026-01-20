import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({}));

  if (!text?.trim()) {
    return NextResponse.json({ error: "Empty text" }, { status: 400 });
  }

  const res = await fetch("https://www.chatbase.co/api/v1/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CHATBASE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatbotId: process.env.CHATBASE_CHATBOT_ID,
      messages: [{ role: "user", content: text }],
      stream: false,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: raw }, { status: res.status });
  }

  const data = JSON.parse(raw);
  console.log("SUBBOT ANSWER", data.text);

  return NextResponse.json({ text: data.text });
}
