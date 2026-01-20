// app/page.tsx (sau app/(whatever)/page.tsx)
"use client";

import { useEffect, useRef, useState } from "react";

type DidSession = {
  stream_id: string;
  session_cookie: string; // ← NU session_id
  offer: { type: "offer"; sdp: string };
  ice_servers: RTCIceServer[];
};


type Phase = "idle" | "starting" | "connected" | "failed";

type IcePayload = {
  candidate: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const streamIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const sdpSentRef = useRef(false);
  const pendingIceRef = useRef<IcePayload[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [rtc, setRtc] = useState<RTCPeerConnectionState>("new");
  const [ice, setIce] = useState<RTCIceConnectionState>("new");
  const [err, setErr] = useState<string>("");

  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const remoteStreamRef = useRef<MediaStream | null>(null);

  function cleanup() {

    sdpSentRef.current = false;
    pendingIceRef.current = [];

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (videoRef.current) {
      const s = videoRef.current.srcObject as MediaStream | null;
      if (s) s.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
      videoRef.current.muted = true; // ca autoplay sa nu fie blocat
    }

    streamIdRef.current = null;
    sessionIdRef.current = null;

    setRtc("new");
    setIce("new");
  }

  useEffect(() => () => cleanup(), []);

  async function postIce(payload: IcePayload) {
    const stream_id = streamIdRef.current;
    const session_id = sessionIdRef.current;
    if (!stream_id || !session_id) return;

    await fetch("/api/did/ice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream_id, session_id, ...payload }),
    });
  }

  async function flushIceQueue() {
    const queued = pendingIceRef.current.splice(0, pendingIceRef.current.length);
    for (const c of queued) await postIce(c);
  }

  async function start() {
    try {
      setErr("");
      setPhase("starting");
      cleanup();

      // 1) Creeaza stream + primeste offer + ice_servers + session_id
      const sRes = await fetch("/api/did/session", { method: "POST" });
      if (!sRes.ok) throw new Error(await sRes.text());
      const sess = (await sRes.json()) as DidSession;

      streamIdRef.current = sess.stream_id;
      sessionIdRef.current = sess.session_cookie;

const pc = new RTCPeerConnection({
  iceServers: sess.ice_servers,
  iceTransportPolicy: "relay", // 🔴 FORȚEAZĂ TURN
});
pc.onicecandidateerror = (e) => {
  console.error("ICE CANDIDATE ERROR", e);
};

pcRef.current = pc;

// 🔴 OBLIGATORIU
pc.addTransceiver("video", { direction: "recvonly" });
pc.addTransceiver("audio", { direction: "recvonly" });

pc.onconnectionstatechange = () => {
  setRtc(pc.connectionState);
  if (pc.connectionState === "failed") {
    setPhase("failed");
    setErr("RTC failed (ICE nu a reusit sa conecteze).");
  }
};

pc.oniceconnectionstatechange = () => {
  setIce(pc.iceConnectionState);
  if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
    setPhase("failed");
  }
};

pc.ontrack = (e) => {
  if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
  remoteStreamRef.current.addTrack(e.track);

  if (!videoRef.current) return;
  videoRef.current.srcObject = remoteStreamRef.current;
  videoRef.current.muted = true;
  void videoRef.current.play().catch(() => {});
};


pc.onicecandidate = (e) => {
  const c = e.candidate;
  if (!c) return; // ✅ nu trimitem end-of-candidates la D-ID

  const payload: IcePayload = {
    candidate: c.candidate,
    sdpMid: c.sdpMid,
    sdpMLineIndex: c.sdpMLineIndex,
  };

  if (!sdpSentRef.current) pendingIceRef.current.push(payload);
  else void postIce(payload);
};


await pc.setRemoteDescription(sess.offer);
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);

      console.log("SEND SDP", {
        stream_id: streamIdRef.current,
        session_id: sessionIdRef.current,
        hasSdp: !!(pc.localDescription?.sdp ?? answer.sdp),
        sdpLength: (pc.localDescription?.sdp ?? answer.sdp)?.length,
      });

      const sdp = pc.localDescription?.sdp ?? answer.sdp;
      if (!sdp) throw new Error("SDP lipsă");

      const aRes = await fetch("/api/did/sdp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream_id: streamIdRef.current!,
          session_id: sessionIdRef.current!,
          sdp,
          type: "answer",
        }),
      });

if (!aRes.ok) throw new Error(await aRes.text());

// 🔹 PORNIM AVATARUL AUTOMAT (altfel video rămâne gol)
await fetch("/api/did/message", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    stream_id: streamIdRef.current!,
    session_id: sessionIdRef.current!,
    text: "Hello",
  }),
});

      // 5) Abia acum dam drumul la ICE catre server
      sdpSentRef.current = true;
      await flushIceQueue();

      setPhase("connected");
    } catch (e: any) {
      setPhase("failed");
      setErr(e?.message ?? String(e));
    }
  }

  function stop() {
    cleanup();
    setPhase("idle");
    setReply("");
  }

  async function enableAudio() {
    if (!videoRef.current) return;
    videoRef.current.muted = false;
    await videoRef.current.play().catch(() => {});
  }

  async function send() {
    const text = input.trim();
    if (!text) return;

    setReply("...");
    const r = await fetch("/api/chatbase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();
    const answer = j?.text ?? "";
    setReply(answer);

    const stream_id = streamIdRef.current;
    const session_id = sessionIdRef.current;
    if (!stream_id || !session_id) return;

    await fetch("/api/did/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream_id, session_id, text: answer }),
    });
  }

  return (
    <main style={{ padding: 20, background: "#000", color: "#fff", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={start} disabled={phase === "starting" || phase === "connected"}>
          Start Avatar
        </button>
        <button onClick={stop} disabled={phase === "idle"}>
          Stop
        </button>
        <button onClick={enableAudio} disabled={phase !== "connected"}>
          Enable audio
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Scrie aici..."
          style={{ minWidth: 280 }}
          disabled={phase !== "connected"}
        />
        <button onClick={send} disabled={phase !== "connected"}>
          Send
        </button>

       
      </div>

      {err && <div style={{ marginTop: 12, color: "#f87171" }}>Error: {err}</div>}

      <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            controls
            style={{ width: "100%", height: 360, background: "#000", objectFit: "contain" }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Daca RTC=failed / ICE=disconnected, nu e autoplay — e conexiune ICE.
          </div>
        </div>

        <div style={{ width: 360, maxWidth: "100%" }}>
          <div style={{ marginBottom: 6 }}>SWUBot reply:</div>
          <div style={{ minHeight: 140, padding: 12, background: "#111", borderRadius: 8, whiteSpace: "pre-wrap" }}>
            {reply}
          </div>
        </div>
      </div>
    </main>
  );
}
