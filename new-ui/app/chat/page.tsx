"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthToken, getAuthTokenForApi, getApiBase, getAuthUser, clearAuth, getLoginRedirectForRole } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";
import { parseAsUTC } from "@/app/utils/date";
import { AppNav } from "@/app/components/AppNav";
import { PageTour } from "@/app/components/PageTour";
import { ConversationList, type ConversationItem } from "./components/ConversationList";
import { ChatMessage } from "./components/ChatMessage";
import { useStreamChat } from "./hooks/useStreamChat";
import type { Message, Citation } from "./types";
import {
  Scale,
  Send,
  Loader2,
  FileText,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversation");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [userName, setUserName] = useState("Your Name");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** When we just created this conversation, skip load so we don't overwrite the first message + pending reply. */
  const skipLoadForConversationIdRef = useRef<string | null>(null);

  const {
    runStream,
    isStreaming,
    streamingContent,
    pendingMessageId,
  } = useStreamChat({
    setMessages,
    getApiBase,
    getToken: getAuthTokenForApi,
    onUnauthorized: () => {
      const role = getAuthUser()?.role;
      clearAuth();
      router.replace(getLoginRedirectForRole(role));
    },
    saveMessage,
    toast,
  });

  const SUGGESTIONS = [
    { label: "Summarize our privacy policy", icon: FileText },
    { label: "GDPR compliance checklist", icon: Lock },
    { label: "Review contract clauses", icon: FileText },
    { label: "Identify compliance risks", icon: AlertTriangle },
  ];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace(getLoginRedirectForRole(getAuthUser()?.role));
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
      if (skipLoadForConversationIdRef.current === id) {
        skipLoadForConversationIdRef.current = null;
        return;
      }
      loadConversation(id);
    } else {
      setMessages([]);
    }
  }, [authenticated, conversationIdFromUrl]);

  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      const response = await api.get<{ conversations?: { id: number | string; title?: string; updated_at?: string; created_at?: string }[]; total?: number }>("/conversations");
      if (!response.success) {
        setConversationsError(response.message ?? "Failed to load conversations.");
        setConversations([]);
      } else {
        const list = response.data?.conversations ?? [];
        const mapped = list.map((c) => ({
          id: String(c.id),
          title: c.title,
          updated_at: c.updated_at,
          created_at: c.created_at,
        }));
        mapped.sort((a: ConversationItem, b: ConversationItem) => {
          const ta = a.updated_at ? parseAsUTC(a.updated_at).getTime() : 0;
          const tb = b.updated_at ? parseAsUTC(b.updated_at).getTime() : 0;
          return tb - ta;
        });
        setConversations(mapped);
      }
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetchConversations();
  }, [authenticated, fetchConversations]);

  async function loadConversation(id: string) {
    try {
      const response = await api.get<{
        conversation?: {
          messages?: {
            id?: string;
            role: string;
            content: string;
            metadata?: { citations?: Citation[]; confidence?: number };
            citations?: Citation[];
          }[];
        };
      }>(`/conversations/${id}`);
      if (!response.success) {
        if (response.message?.toLowerCase().includes("not found")) setMessages([]);
        else toast.error(response.message ?? "Could not load conversation");
        setMessages([]);
        return;
      }
      const msgs = (response.data?.conversation?.messages ?? []).map((m): Message => {
        const role = m.role as "user" | "assistant";
        const content = m.content ?? "";
        const id = String(m.id ?? crypto.randomUUID());
        if (role === "user") {
          return { id, role: "user", content };
        }
        return {
          id,
          role: "assistant",
          content,
          citations: m.metadata?.citations ?? m.citations,
          confidence: m.metadata?.confidence,
        };
      });
      setMessages(msgs);
    } catch {
      toast.error("Could not load conversation");
      setMessages([]);
    }
  }

  async function createConversation(): Promise<string | null> {
    try {
      const response = await api.post<{ conversation?: { id?: number | string } }>("/conversations", { title: "New Chat", metadata: {} });
      if (!response.success || !response.data?.conversation) {
        toast.error(response.message ?? "Could not create conversation");
        return null;
      }
      const id = response.data.conversation.id;
      if (id != null) return String(id);
      return null;
    } catch {
      toast.error("Could not create conversation");
      return null;
    }
  }

  async function saveMessage(
    convId: string,
    role: "user" | "assistant",
    content: string,
    citations?: Citation[],
    confidence?: number
  ) {
    try {
      await api.post(`/conversations/${convId}/messages`, {
        role,
        content,
        metadata: { citations, confidence },
      });
    } catch {
      toast.error("Could not save message");
    }
  }

  async function updateConversationTitle(convId: string, title: string) {
    try {
      const response = await api.put(`/conversations/${convId}`, { title: title.slice(0, 80).trim() || "New Chat" });
      if (response.success) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title: title.slice(0, 80).trim() || "New Chat", updated_at: new Date().toISOString() } : c))
        );
      }
    } catch {
      // non-blocking
    }
  }

  async function handleCitationClick(citation: Citation) {
    try {
      const response = await api.get<{ documents?: { id: string; filename?: string }[] }>("/documents");
      if (!response.success || !response.data?.documents?.length) {
        toast.error("Could not load documents");
        return;
      }
      const docs = response.data.documents;
      const name = (citation.document_name ?? "").trim();
      const id = citation.document_id ?? null;
      const doc = id
        ? docs.find((d) => d.id === id)
        : docs.find((d) => (d.filename ?? "") === name || (name && (d.filename ?? "").toLowerCase() === name.toLowerCase()));
      if (!doc) {
        toast.error("Document not found");
        return;
      }
      const token = getAuthTokenForApi();
      if (!token) {
        toast.error("Please sign in to open the document");
        return;
      }
      toast.info("Opening document in new tab...");
      const res = await fetch(`${getApiBase()}/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Could not load document");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      toast.error("Could not open document");
    }
  }

  async function deleteConversation(convId: string) {
    try {
      const response = await api.delete(`/conversations/${convId}`);
      if (response.success) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (currentConversationId === convId) {
          setCurrentConversationId(null);
          setMessages([]);
          router.push("/chat");
        }
        toast.success("Conversation deleted");
      } else {
        toast.error(response.message ?? "Could not delete conversation");
      }
    } catch {
      toast.error("Could not delete conversation");
    }
  }

  async function handleNewChat() {
    const id = await createConversation();
    if (id) {
      router.push(`/chat?conversation=${id}`);
      setCurrentConversationId(id);
      setMessages([]);
      setInput("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || isStreaming) return;

    const token = getAuthTokenForApi();
    if (!token) {
      const role = getAuthUser()?.role;
      clearAuth();
      router.replace(getLoginRedirectForRole(role));
      return;
    }

    let convId = currentConversationId;
    if (!convId) {
      convId = await createConversation();
      if (convId) {
        skipLoadForConversationIdRef.current = convId;
        router.replace(`/chat?conversation=${convId}`);
        setCurrentConversationId(convId);
      } else return;
    }

    const isFirstMessage = messages.length === 0;
    await saveMessage(convId, "user", query);
    if (isFirstMessage) {
      setConversations((prev) => {
        if (prev.some((c) => c.id === convId)) return prev;
        return [
          { id: convId, title: query.slice(0, 80).trim() || "New Chat", updated_at: new Date().toISOString() },
          ...prev,
        ];
      });
      updateConversationTitle(convId, query);
    }

    setInput("");
    await runStream(query, convId, isFirstMessage, messages);
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

  const chatTourSteps = [
    {
      element: "[data-tour='chat-new-conversation']",
      route: "/chat",
      popover: {
        title: "New Conversation",
        description: "Start a new chat anytime. Each conversation is saved and you can return to it later.",
        side: "right" as const,
        align: "start" as const,
      },
    },
    {
      element: "[data-tour='chat-suggestions']",
      route: "/chat",
      popover: {
        title: "Quick Suggestions",
        description: "Click a suggestion to use it as your query, or type your own question about legal or compliance topics.",
        side: "top" as const,
        align: "center" as const,
      },
    },
    {
      element: "[data-tour='chat-input']",
      route: "/chat",
      popover: {
        title: "Ask Anything",
        description: "Type your question here and press Enter or click Send. Answers are grounded in your organization's approved documents.",
        side: "top" as const,
        align: "center" as const,
      },
    },
  ];

  return (
    <div className="flex flex-col h-screen min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <PageTour pageId="chat" steps={chatTourSteps} runOnMount autoAdvanceOnTargetClick />
      <AppNav />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ConversationList
          conversations={conversations}
          currentId={currentConversationId}
          onNewConversation={handleNewChat}
          onSelect={(id) => router.push(`/chat?conversation=${id}`)}
          onDelete={deleteConversation}
          userName={userName}
          conversationsLoading={conversationsLoading}
          conversationsError={conversationsError}
          onRetry={fetchConversations}
        />

        <div className="flex flex-1 flex-col min-h-0 min-w-0 h-full bg-slate-50 dark:bg-slate-950">
          <div className="flex flex-1 flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6">
              {messages.length === 0 && !isStreaming ? (
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full" data-tour="chat-suggestions">
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
                    <div key={msg.id} className="mb-4">
                      <ChatMessage
                        message={msg}
                        isPending={msg.id === pendingMessageId}
                        streamingContent={msg.id === pendingMessageId ? streamingContent : undefined}
                        onCitationClick={handleCitationClick}
                      />
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0" data-tour="chat-input">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about legal or compliance..."
                  className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isStreaming}
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  className="relative rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-white flex items-center justify-center min-w-[52px]"
                >
                  {isStreaming ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                  ) : (
                    <Send className="w-5 h-5" aria-hidden />
                  )}
                  <span className="sr-only">{isStreaming ? "Processing" : "Send"}</span>
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

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading…</span>
          </div>
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
