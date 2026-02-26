"use client";

import ReactMarkdown from "react-markdown";
import { Scale } from "lucide-react";
import type { Message, AssistantMessage, Citation } from "../types";
import { isAssistantMessage } from "../types";
import { getFriendlyMessage } from "@/app/utils/getFriendlyMessage";

function stripCitationNumbers(text: string): string {
  return text.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();
}

export interface ChatMessageProps {
  message: Message;
  /** When this message is the pending one, pass live streamed content to show in same bubble */
  isPending?: boolean;
  streamingContent?: string;
}

/** Single message bubble: user, or assistant (thinking | streaming | complete | error) */
export function ChatMessage({
  message,
  isPending = false,
  streamingContent = "",
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <div className="flex flex-row-reverse items-start gap-2 max-w-[85%]">
          <div className="rounded-2xl px-4 py-3 bg-blue-600 text-white">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  const assistant = message as AssistantMessage;
  const showError = !!assistant.error;
  const showThinking =
    isPending && !showError && !streamingContent && (assistant.logs?.length ?? 0) > 0;
  const showStreaming = isPending && !showError && !!streamingContent;
  const lastLog = assistant.logs?.length
    ? assistant.logs[assistant.logs.length - 1]
    : "";
  const friendlyLabel = lastLog ? getFriendlyMessage(lastLog) : "⏳ Processing...";

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-start gap-2 max-w-[85%]">
        <div className="rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 min-w-0">
          {showError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {assistant.error}
            </p>
          )}
          {showThinking && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 chat-message-thinking">
              <span className="chat-pulsing-dot" aria-hidden />
              <p className="text-sm">{friendlyLabel}</p>
            </div>
          )}
          {showStreaming && (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 transition-opacity duration-200">
              <ReactMarkdown>{stripCitationNumbers(streamingContent)}</ReactMarkdown>
            </div>
          )}
          {!showError && !showThinking && !showStreaming && (
            <>
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                <ReactMarkdown>{stripCitationNumbers(assistant.content)}</ReactMarkdown>
              </div>
              {assistant.confidence !== undefined &&
                assistant.confidence !== null &&
                assistant.confidence > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800/50 overflow-hidden bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                    <Scale className="h-4 w-4 flex-shrink-0" />
                    <span>Confidence</span>
                  </div>
                  <div className="ml-auto px-3 py-2 text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                    {assistant.confidence}%
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {isAssistantMessage(assistant) &&
        !showError &&
        !showThinking &&
        assistant.citations &&
        assistant.citations.length > 0 && (
          <div className="mt-1.5 ml-1 w-[85%] max-w-[85%] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Sources &amp; Citations
            </p>
            <ul className="space-y-2">
              {assistant.citations.map((c: Citation, i: number) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-2.5 text-xs"
                >
                  <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                    [{i + 1}]
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {c.document_name ?? "Document"}
                    </p>
                    {c.section != null && String(c.section) !== "" && (
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Section: {c.section}
                      </p>
                    )}
                    {c.content && (
                      <p className="text-slate-500 dark:text-slate-400 mt-1 italic line-clamp-2">
                        &quot;
                        {typeof c.content === "string"
                          ? c.content.length > 120
                            ? c.content.substring(0, 120) + "…"
                            : c.content
                          : String(c.content).length > 120
                            ? String(c.content).substring(0, 120) + "…"
                            : String(c.content)}
                        &quot;
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}
