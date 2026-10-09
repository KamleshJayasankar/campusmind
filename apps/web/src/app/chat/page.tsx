"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, ChatSummary, Message, Source } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import Nav from "@/components/Nav";

const EXAMPLES = [
  "How much attendance do I need to write the exam?",
  "What is the last date to pay the exam fee?",
  "What are the placement eligibility rules?",
];

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sources</p>
      {sources.map((s) => (
        <details key={s.index} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-slate-700">
            <span className="font-semibold text-indigo-700">[{s.index}]</span> {s.title}
            {s.page ? ` · page ${s.page}` : ""}
            <span className="text-slate-400"> · {Math.round(s.score * 100)}% match</span>
          </summary>
          <p className="mt-2 text-slate-600">{s.snippet}...</p>
        </details>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const user = useUser();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    const res = await api<{ chats: ChatSummary[] }>("/chat");
    setChats(res.chats);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ chats: ChatSummary[] }>("/chat")
      .then((res) => {
        if (!cancelled) setChats(res.chats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function openChat(id: string) {
    setError("");
    try {
      const res = await api<{ messages: Message[] }>(`/chat/${id}`);
      setActiveId(id);
      setMessages(res.messages);
    } catch {
      setError("Could not open that chat");
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError("");
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: question, sources: [] }]);
    setLoading(true);
    try {
      const res = await api<{ chatId: string; messageId: string; answer: string; sources: Source[] }>("/chat", {
        method: "POST",
        body: JSON.stringify({ question, chatId: activeId ?? undefined }),
      });
      setActiveId(res.chatId);
      setMessages((m) => [...m, { id: res.messageId, role: "assistant", content: res.answer, sources: res.sources }]);
      loadChats().catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <Nav user={user} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="p-3">
            <button onClick={newChat} className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              + New chat
            </button>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {chats.map((c) => (
              <button
                key={c.id}
                onClick={() => openChat(c.id)}
                className={`w-full truncate rounded-md px-3 py-2 text-left text-sm ${
                  c.id === activeId ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {c.title ?? "Untitled chat"}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length === 0 && !loading && (
                <div className="py-16 text-center">
                  <h2 className="text-xl font-semibold">Ask about your college documents</h2>
                  <p className="mt-1 text-sm text-slate-500">Answers come only from uploaded documents, with sources.</p>
                  <div className="mt-6 flex flex-col items-center gap-2">
                    {EXAMPLES.map((q) => (
                      <button key={q} onClick={() => ask(q)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-white">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <SourceList sources={m.sources} />
                    </div>
                  </div>
                )
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-slate-500">Searching documents...</div>
                </div>
              )}
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div ref={bottomRef} />
            </div>
          </div>

          <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-3">
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                maxLength={1000}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" disabled={loading || input.trim().length < 3} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                Send
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
