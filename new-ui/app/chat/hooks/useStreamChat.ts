"use client";

import { useCallback, useRef, useState } from "react";
import type { Message, AssistantMessage, StreamEvent, StreamAnswer, Citation } from "../types";

const NO_RESPONSE_MESSAGE = "No response from server";

function stripCitationNumbers(text: string): string {
  return text.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();
}

function getLogEntry(ev: StreamEvent): string | null {
  if (ev.type !== "log" || !ev.log) return null;
  return ev.log.stage ?? ev.log.message ?? null;
}

export interface UseStreamChatOptions {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  getApiBase: () => string;
  getToken: () => string | null;
  onUnauthorized: () => void;
  saveMessage: (
    convId: string,
    role: "user" | "assistant",
    content: string,
    citations?: Citation[],
    confidence?: number
  ) => Promise<void>;
  toast: { error: (msg: string) => void };
}

export interface UseStreamChatResult {
  runStream: (
    query: string,
    convId: string,
    isFirstMessage: boolean,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  ) => Promise<void>;
  isStreaming: boolean;
  /** Content streaming in for the current pending message (show in same bubble) */
  streamingContent: string;
  /** Id of the pending assistant message so UI can match and show thinking/streaming */
  pendingMessageId: string | null;
  abort: () => void;
}

export function useStreamChat(options: UseStreamChatOptions): UseStreamChatResult {
  const {
    setMessages,
    getApiBase,
    getToken,
    onUnauthorized,
    saveMessage,
    toast,
  } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const runStream = useCallback(
    async (
      query: string,
      convId: string,
      isFirstMessage: boolean,
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
    ) => {
      const token = getToken();
      if (!token) {
        onUnauthorized();
        return;
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: query,
      };
      const pendingId = crypto.randomUUID();
      const pendingMessage: AssistantMessage = {
        id: pendingId,
        role: "assistant",
        content: "",
        logs: [],
        streaming: true,
      };

      setMessages((prev) => [...prev, userMessage, pendingMessage]);
      setPendingMessageId(pendingId);
      setStreamingContent("");
      setIsStreaming(true);
      abortRef.current = new AbortController();

      const history =
        conversationHistory?.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : "",
        })) ?? [];

      let finalAnswer: StreamAnswer | null = null;
      let lastStreamedContent = "";

      try {
        const res = await fetch(`${getApiBase()}/query/agent-stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query, conversationHistory: history }),
          signal: abortRef.current.signal,
        });

        if (res.status === 401) {
          onUnauthorized();
          setMessages((prev) => prev.filter((m) => m.id !== pendingId));
          setPendingMessageId(null);
          setIsStreaming(false);
          setStreamingContent("");
          return;
        }

        if (!res.ok) {
          throw new Error(res.statusText || "Query failed");
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
                if (json.type === "log") {
                  const entry = getLogEntry(json);
                  if (entry) {
                    setMessages((prev) => {
                      const next = [...prev];
                      const idx = next.findIndex((m) => m.id === pendingId);
                      if (idx === -1) return prev;
                      const msg = next[idx];
                      if (msg.role !== "assistant" || !("logs" in msg)) return prev;
                      next[idx] = {
                        ...msg,
                        logs: [...(msg.logs ?? []), entry],
                      };
                      return next;
                    });
                  }
                } else if (json.type === "answer" && json.answer) {
                  finalAnswer = json.answer;
                  if (json.answer.answer) {
                    lastStreamedContent = json.answer.answer;
                    setStreamingContent(json.answer.answer);
                  }
                } else if (json.type === "error") {
                  const errMsg = json.error ?? "Something went wrong";
                  toast.error(errMsg);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === pendingId && m.role === "assistant"
                        ? {
                            ...m,
                            role: "assistant" as const,
                            content: "",
                            error: `❌ ${errMsg}`,
                            streaming: false,
                            logs: undefined,
                          }
                        : m
                    )
                  );
                  setPendingMessageId(null);
                  setIsStreaming(false);
                  setStreamingContent("");
                  abortRef.current = null;
                  return;
                }
              } catch {
                // ignore non-JSON chunks
              }
            }
          }
        }

        const displayContent = stripCitationNumbers(
          finalAnswer?.answer ?? lastStreamedContent ?? ""
        );
        const hasContent = displayContent.trim().length > 0;
        const contentToSave = hasContent ? displayContent : NO_RESPONSE_MESSAGE;
        const finalCitations = finalAnswer?.citations ?? [];
        const confidence = finalAnswer?.confidence;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId && m.role === "assistant"
              ? {
                  id: m.id,
                  role: "assistant" as const,
                  content: hasContent ? displayContent : NO_RESPONSE_MESSAGE,
                  citations: finalCitations.length ? finalCitations : undefined,
                  confidence,
                  streaming: false,
                  logs: undefined,
                }
              : m
          )
        );
        setPendingMessageId(null);
        setStreamingContent("");
        await saveMessage(convId, "assistant", contentToSave, finalCitations, confidence);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setMessages((prev) => prev.filter((m) => m.id !== pendingId));
          setPendingMessageId(null);
          setStreamingContent("");
          setIsStreaming(false);
          abortRef.current = null;
          return;
        }
        const errMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        toast.error(errMessage);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId && m.role === "assistant"
              ? {
                  ...m,
                  role: "assistant" as const,
                  content: "",
                  error: `❌ ${errMessage}`,
                  streaming: false,
                  logs: undefined,
                }
              : m
          )
        );
        setPendingMessageId(null);
        setStreamingContent("");
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      getToken,
      getApiBase,
      onUnauthorized,
      saveMessage,
      toast,
      setMessages,
    ]
  );

  return {
    runStream,
    isStreaming,
    streamingContent,
    pendingMessageId,
    abort,
  };
}
