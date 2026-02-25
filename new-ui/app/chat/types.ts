/** Citation from RAG/agent response */
export type Citation = {
  document_name?: string;
  section?: string;
  content?: string;
  page?: number;
  [key: string]: unknown;
};

/** Log entry from stream (stage or message) */
export type LogEntry = string;

/** User message (no streaming state) */
export interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

/**
 * Assistant message. Can be in one of three states:
 * - Thinking: content empty, logs.length > 0, streaming true
 * - Streaming: content or streamingContent, streaming true
 * - Complete: content set, streaming false, optional citations/confidence
 * - Error: error set, streaming false
 */
export interface AssistantMessage {
  id: string;
  role: "assistant";
  /** Final or current text (when complete or streaming) */
  content: string;
  /** Log stages for thinking state; show last via getFriendlyMessage */
  logs?: LogEntry[];
  /** True while waiting for answer or streaming content */
  streaming?: boolean;
  /** Inline error (replaces pending message) */
  error?: string;
  citations?: Citation[];
  confidence?: number;
}

export type Message = UserMessage | AssistantMessage;

export function isAssistantMessage(m: Message): m is AssistantMessage {
  return m.role === "assistant";
}

/** Final answer payload from stream answer event */
export interface StreamAnswer {
  answer?: string;
  citations?: Citation[];
  confidence?: number;
}

/** Stream event types (discriminated union) */
export type StreamEvent =
  | { type: "log"; log?: { stage?: string; message?: string } }
  | { type: "answer"; answer?: StreamAnswer }
  | { type: "complete" }
  | { type: "error"; error?: string };
