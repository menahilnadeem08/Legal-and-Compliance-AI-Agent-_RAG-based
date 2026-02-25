/**
 * Maps technical log types/stages from the stream to user-friendly labels with emojis.
 * Used for the "thinking" state in the chat message bubble.
 */
const STAGE_MAP: Record<string, string> = {
  fetching: "⚡ Fetching video...",
  transcribing: "🎙️ Transcribing audio...",
  processing: "🤔 Processing...",
  generating: "✨ Generating summary...",
  analyzing: "🔍 Analyzing content...",
  // Backend agent-stream stages (legal/compliance RAG)
  QUERY_START: "📋 Processing your question...",
  QUERY_REWRITE_START: "🔍 Analyzing how to search...",
  QUERY_REWRITE_VARIANTS: "🎯 Understanding your question...",
  RETRIEVAL: "📚 Searching your documents...",
  VECTOR_SEARCH: "🔎 Finding relevant sections...",
  VECTOR_SEARCH_COMPLETE: "✓ Found matching content",
  KEYWORD_SEARCH: "🔤 Searching for specific terms...",
  KEYWORD_SEARCH_COMPLETE: "✓ Keyword search complete",
  DEDUPLICATION: "♻️ Removing duplicates...",
  DEDUPLICATION_COMPLETE: "✓ Cleaned up results",
  RERANKING: "⭐ Ranking by relevance...",
  RERANKING_COMPLETE: "✓ Results ranked",
  COMPRESSION: "📦 Preparing context...",
  COMPRESSION_COMPLETE: "✓ Context ready",
  GENERATION: "⚡ Generating your answer...",
  GENERATION_COMPLETE: "✓ Answer generated",
  QUERY_COMPLETE: "✅ Done!",
  RETRIEVAL_COMPLETE: "✓ Document search complete",
  AGENT_START: "🤖 Processing your question...",
  LLM_THINKING: "🧠 Analyzing and deciding...",
  GENERATING: "✨ Generating final answer...",
};

/**
 * Returns a user-friendly message for a given log type or stage.
 * Accepts stage (e.g. "GENERATION") or message (e.g. "generating") and normalizes for lookup.
 */
export function getFriendlyMessage(logType: string): string {
  if (!logType || typeof logType !== "string") return "⏳ Processing...";
  const trimmed = logType.trim();
  const byStage = STAGE_MAP[trimmed];
  if (byStage) return byStage;
  const lower = trimmed.toLowerCase();
  const byLower = STAGE_MAP[lower];
  if (byLower) return byLower;
  // Fallback: capitalize first letter
  return trimmed.length > 0
    ? `⏳ ${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}...`
    : "⏳ Processing...";
}
