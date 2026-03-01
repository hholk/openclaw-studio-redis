"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
};

export default function BridgePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectId] = useState("sidecar-001");
  const lastArtifactId = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const pollLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/redis-bridge/poll?projectId=${projectId}`);
      const data = await res.json();
      const latest = data?.latest;
      if (latest && latest.id !== lastArtifactId.current) {
        lastArtifactId.current = latest.id;
        const content =
          typeof latest.content === "string"
            ? latest.content
            : JSON.stringify(latest.content);
        setMessages((prev) => [
          ...prev,
          {
            id: latest.id,
            role: "assistant",
            text: content,
            ts: Date.now(),
          },
        ]);
        setLoading(false);
        scrollBottom();
      }
    } catch {
      // silent
    }
  }, [projectId]);

  useEffect(() => {
    pollRef.current = setInterval(pollLatest, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollLatest]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const msgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: msgId, role: "user", text, ts: Date.now() },
    ]);
    setLoading(true);
    scrollBottom();

    try {
      await fetch("/api/redis-bridge/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: text,
          projectId,
          sessionLabel: "studio-bridge",
          chatSessionId: msgId,
        }),
      });
    } catch {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 bg-gray-900">
        <span className="text-xl">⚡</span>
        <div>
          <h1 className="font-semibold text-white">OpenClaw Studio</h1>
          <p className="text-xs text-gray-400">Redis Bridge → Mac mini → OpenClaw</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-4xl mb-3">⚡</p>
            <p className="text-sm">Sag Spark was — läuft über Redis Bridge auf dem Mac mini.</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-gray-800 bg-gray-900">
        <div className="flex gap-3 items-end max-w-4xl mx-auto">
          <textarea
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-500"
            placeholder="Nachricht an Spark..."
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-colors"
          >
            ↑
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">
          Enter senden · Shift+Enter neue Zeile
        </p>
      </div>
    </div>
  );
}
