"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getAuthToken, getAuthTokenForApi, getApiBase, clearAuth } from "@/app/utils/auth";
import { AppNav } from "@/app/components/AppNav";
import { ConversationList, type ConversationItem } from "./components/ConversationList";
import {
  Scale,
  Send,
  Loader2,
  FileText,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function stripCitationNumbers(text: string): string {
  return text.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();
}

type Citation = { document_name?: string; section?: string; [key: string]: unknown };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type StreamEvent =
  | { type: "log"; log?: { stage?: string; message?: string } }
  | { type: "answer"; answer?: { answer?: string; citations?: Citation[]; confidence?: number } }
  | { type: "complete" }
  | { type: "error"; error?: string };

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversation");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState("Your Name");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const SUGGESTIONS = [
    { label: "Summarize our privacy policy", icon: FileText },
    { label: "GDPR compliance checklist", icon: Lock },
    { label: "Review contract clauses", icon: FileText },
    { label: "Identify compliance risks", icon: AlertTriangle },
  ];
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    setAuthenticated(true);
    const userStr = typeof window !== "undefined" ? localStorage.getItem("authUser") : null;
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user?.name) setUserName(user.name);
        else if (user?.username) setUserName(user.username);
      } catch {
        // keep default
      }
    }
  }, [router]);

  useEffect(() => {
    if (!authenticated) return;
    const id = conversationIdFromUrl || null;
    setCurrentConversationId(id);
    if (id) {
      loadConversation(id);
    } else {
      setMessages([]);
    }
  }, [authenticated, conversationIdFromUrl]);

  useEffect(() => {
    if (!authenticated) return;
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }
    const apiBase = getApiBase();
    fetch(`${apiBase}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          clearAuth();
          router.replace("/auth/login");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (!data) return;
        const list = Array.isArray(data) ? data : data?.conversations ?? [];
        const mapped = list.map((c: { id: number | string; title?: string; updated_at?: string; created_at?: string }) => ({
          id: String(c.id),
          title: c.title,
          updated_at: c.updated_at,
          created_at: c.created_at,
        }));
        mapped.sort((a: ConversationItem, b: ConversationItem) => {
          const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return tb - ta;
        });
        setConversations(mapped);
      })
      .catch(() => {});
  }, [authenticated, router]);

  async function loadConversation(id: string) {
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) {
        if (res.status === 404) {
          setMessages([]);
          return;
        }
        throw new Error("Failed to load conversation");
      }
      const data = await res.json();
      const msgs = (data.messages ?? []).map((m: { id?: string; role: string; content: string; metadata?: { citations?: Citation[] }; citations?: Citation[] }) => ({
        id: String(m.id ?? crypto.randomUUID()),
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: m.metadata?.citations ?? m.citations,
      }));
      setMessages(msgs);
    } catch {
      toast.error("Could not load conversation");
      setMessages([]);
    }
  }

  async function createConversation(): Promise<string | null> {
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return null;
    }
    try {
      const res = await fetch(`${getApiBase()}/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: "New Chat", metadata: {} }),
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return null;
      }
      if (!res.ok) throw new Error("Create failed");
      const data = await res.json();
      const id = data.id ?? data.conversation_id;
      if (id != null) {
        const idStr = String(id);
        setConversations((prev) => [...prev, { id: idStr, title: "New chat", updated_at: new Date().toISOString() }]);
        return idStr;
      }
      return null;
    } catch {
      toast.error("Could not create conversation");
      return null;
    }
  }

  async function saveMessage(convId: string, role: "user" | "assistant", content: string, citations?: Citation[], confidence?: number) {
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/conversations/${convId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role, content, metadata: { citations, confidence } }),
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
      }
    } catch {
      toast.error("Could not save message");
    }
  }

  async function updateConversationTitle(convId: string, title: string) {
    const token = getAuthTokenForApi();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/conversations/${convId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: title.slice(0, 80).trim() || "New Chat" }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title: title.slice(0, 80).trim() || "New Chat", updated_at: new Date().toISOString() } : c))
        );
      }
    } catch {
      // non-blocking
    }
  }

  async function deleteConversation(convId: string) {
    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/conversations/${convId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (currentConversationId === convId) {
          setCurrentConversationId(null);
          setMessages([]);
          router.push("/chat");
        }
        toast.success("Conversation deleted");
      } else {
        toast.error("Could not delete conversation");
      }
    } catch {
      toast.error("Could not delete conversation");
    }
  }

  async function handleNewChat() {
    const id = await createConversation();
    if (id) {
      const now = new Date().toISOString();
      setConversations((prev) => [{ id, title: "New Chat", updated_at: now, created_at: now }, ...prev]);
      router.push(`/chat?conversation=${id}`);
      setCurrentConversationId(id);
      setMessages([]);
      setInput("");
      setStatus(null);
      setStreamingContent("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || isLoading) return;

    const token = getAuthTokenForApi();
    if (!token) {
      clearAuth();
      router.replace("/auth/login");
      return;
    }

    let convId = currentConversationId;
    if (!convId) {
      convId = await createConversation();
      if (convId) {
        router.replace(`/chat?conversation=${convId}`);
        setCurrentConversationId(convId);
      } else return;
    }

    const isFirstMessage = messages.length === 0;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    saveMessage(convId, "user", query);
    if (isFirstMessage) updateConversationTitle(convId, query);

    setIsLoading(true);
    setStatus("Processing your question...");
    setStreamingContent("");
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${getApiBase()}/query/agent-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query }),
        signal: abortRef.current.signal,
      });

      if (res.status === 401) {
        clearAuth();
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) {
        throw new Error(res.statusText || "Query failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalAnswerObj: { answer?: string; citations?: Citation[]; confidence?: number } | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            if (!chunk.startsWith("data: ")) continue;
            try {
              const json = JSON.parse(chunk.slice(6)) as StreamEvent;
              if (json.type === "log" && json.log) {
                setStatus(json.log.message ?? json.log.stage ?? "Processing...");
              } else if (json.type === "answer" && json.answer) {
                finalAnswerObj = json.answer;
                setStatus(null);
                if (json.answer.answer) setStreamingContent(json.answer.answer);
              } else if (json.type === "complete") {
                // use accumulated finalAnswerObj
              } else if (json.type === "error") {
                setStatus(null);
                setStreamingContent("");
                toast.error(json.error ?? "Something went wrong");
                setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
                return;
              }
            } catch {
              // ignore non-JSON
            }
          }
        }
      }

      const displayContent = stripCitationNumbers(finalAnswerObj?.answer ?? streamingContent ?? "");
      const finalCitations = finalAnswerObj?.citations ?? [];
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: displayContent,
        citations: finalCitations.length ? finalCitations : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
      setStatus(null);
      saveMessage(convId, "assistant", displayContent, finalCitations, finalAnswerObj?.confidence);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus(null);
      setStreamingContent("");
      toast.error("Something went wrong. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <AppNav />
      <div className="flex flex-1 min-h-0 overflow-hidden">
      <ConversationList
        conversations={conversations}
        currentId={currentConversationId}
        onNewConversation={handleNewChat}
        onSelect={(id) => router.push(`/chat?conversation=${id}`)}
        onDelete={deleteConversation}
        userName={userName}
      />

      <div className="flex flex-1 flex-col min-h-0 min-w-0 h-full bg-slate-50 dark:bg-slate-950">


        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 && !streamingContent && !status ? (
              <div className="flex flex-col items-center justify-center min-h-[60%] text-center px-4">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200 dark:bg-slate-800">
                  <Scale className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  Ask anything{" "}
                  <span className="text-blue-600 dark:text-blue-400">legal</span>
                </h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-md mb-8">
                  Your answers are grounded in your organization&apos;s approved legal and compliance documentation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                  {SUGGESTIONS.map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setInput(label)}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-4 py-3 text-left text-sm font-medium text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Icon className="h-5 w-5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`flex items-start gap-2 max-w-[85%] ${
                        msg.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                    {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                      <div className="mt-1.5 ml-1 w-[85%] max-w-[85%] rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Sources
                        </p>
                        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                          {msg.citations.map((c, i) => (
                            <li key={i}>
                              {c.document_name ?? "Document"}
                              {c.section != null && String(c.section) !== "" ? ` — ${c.section}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-w-[85%]">
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1">
                        <ReactMarkdown>{stripCitationNumbers(streamingContent)}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
                {status && (
                  <div className="flex justify-center">
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {status}
                    </p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about legal or compliance..."
                className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-white flex items-center justify-center"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-2">
              Answers are based on approved internal documentation only.
            </p>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}
