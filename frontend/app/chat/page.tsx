'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import Navigation from '../components/Navigation';
import PageContainer from '../components/PageContainer';

interface Citation {
  document_name: string;
  section?: string;
  content: string;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error';
  stage: string;
  message: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  citations?: Citation[];
  logs?: LogEntry[];
}

const getFriendlyMessage = (stage: string, message: string): string => {
  const stageMap: { [key: string]: string } = {
    'QUERY_START': '📋 Processing your question...',
    'QUERY_REWRITE_START': '🔍 Analyzing how to search for this...',
    'QUERY_REWRITE_VARIANTS': '🎯 Understanding different ways to ask this...',
    'RETRIEVAL': '📚 Searching your documents...',
    'VECTOR_SEARCH': '🔎 Finding relevant sections...',
    'VECTOR_SEARCH_COMPLETE': '✓ Found matching content',
    'KEYWORD_SEARCH': '🔤 Searching for specific terms...',
    'KEYWORD_SEARCH_COMPLETE': '✓ Keyword search complete',
    'DEDUPLICATION': '♻️ Removing duplicate information...',
    'DEDUPLICATION_COMPLETE': '✓ Cleaned up results',
    'RERANKING': '⭐ Ranking results by relevance...',
    'RERANKING_COMPLETE': '✓ Results ranked',
    'COMPRESSION': '📦 Preparing context for analysis...',
    'COMPRESSION_COMPLETE': '✓ Context ready',
    'GENERATION': '⚡ Generating your answer...',
    'GENERATION_COMPLETE': '✓ Answer generated',
    'QUERY_COMPLETE': '✅ Done!',
    'RETRIEVAL_COMPLETE': '✓ Document search complete',
  };

  return stageMap[stage] || message;
};

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* Redirect if unauthenticated */
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  // Ensure a sessionId exists in sessionStorage for short-term memory
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = 'rag_session_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      if (typeof (window as any).crypto?.randomUUID === 'function') {
        id = (window as any).crypto.randomUUID();
      } else {
        id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      }
      sessionStorage.setItem(key, id);
    }
    setSessionId(id);
  }, []);

  /* Auto scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    const userQuery = input;

    // Add user message AND an empty pending assistant message
    setMessages(prev => [
      ...prev,
      userMessage,
      { role: 'assistant', content: '', logs: [], confidence: undefined }
    ]);
    setInput('');
    setLoading(true);


    try {
      let token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token && session && (session.user as any)?.token) {
        token = (session.user as any).token;
      }

      if (!token) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: '❌ Authentication required. Please sign in again.',
          };
          return updated;
        });
        setLoading(false);
        return;
      }

      // === REAL STREAMING API CALL ===
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query: userQuery, sessionId }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response does not support streaming');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalAnswer: any = null;
      const logs: LogEntry[] = [];
      let hasError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messagesChunks = buffer.split('\n\n');
        buffer = messagesChunks.pop() || '';

        for (const msgChunk of messagesChunks) {
          if (!msgChunk.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(msgChunk.slice(6));

            if (data.type === 'log') {
              logs.push(data.log);
              // Update the pending assistant message with new logs
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  logs: [...logs],
                };
                return updated;
              });
            } else if (data.type === 'answer') {
              finalAnswer = data.answer;
            } else if (data.type === 'complete') {
              if (finalAnswer) {
                // Replace pending message with final answer
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: finalAnswer.answer || 'No answer generated',
                    citations: finalAnswer.citations,
                    confidence: finalAnswer.confidence,
                    logs,
                  };
                  return updated;
                });
              }
            } else if (data.type === 'error') {
              hasError = true;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: `❌ Error: ${data.error}`,
                  logs,
                };
                return updated;
              });
            }
          } catch (err) {
            console.error('Failed to parse SSE chunk:', err, msgChunk);
          }
        }
      }

      if (!hasError && !finalAnswer) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: '❌ No response from server',
            logs,
          };
          return updated;
        });
      }
    } catch (err: any) {
      console.error('Error:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `❌ Error: ${err.message || 'Error processing your query.'}`,
        };
        return updated;
      });
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleClearSession = async () => {
    if (!sessionId) return;
    let token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token && session && (session.user as any)?.token) token = (session.user as any).token;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/session/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        // clear local session storage entry and append a system message
        const key = 'rag_session_id';
        sessionStorage.removeItem(key);
        // generate a fresh session id for subsequent queries
        let newId = typeof (window as any).crypto?.randomUUID === 'function'
          ? (window as any).crypto.randomUUID()
          : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem(key, newId);
        setSessionId(newId);
        setMessages(prev => ([...prev, { role: 'assistant', content: '🧹 Short-term session memory cleared.' }]));
      } else {
        const json = await res.json();
        setMessages(prev => ([...prev, { role: 'assistant', content: `❌ Failed to clear session: ${json?.error || res.status}` }]));
      }
    } catch (err: any) {
      setMessages(prev => ([...prev, { role: 'assistant', content: `❌ Error clearing session: ${err.message || err}` }]));
    }
  };

  if (status === 'loading') return null;

  return (
    <>
      <Navigation />
      <PageContainer>
        <div className="w-full h-full flex items-center justify-center">
          <div className="max-w-3xl w-full h-full flex overflow-hidden flex-col">

            {/* ================= MESSAGES ================= */}
            <div className="flex-1 overflow-y-auto space-y-4 px-3 py-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12">
                  {/* Welcome Message Card */}
                  <div className="w-full max-w-2xl p-6 glass-border rounded-lg text-center !mt-8 !mb-8">
                    <p className="text-gray-300 text-base leading-relaxed">
                      Hello! I&apos;m here to help with legal and compliance questions.
                      Ask me about policies, regulations, contracts, or any compliance-related matters.
                    </p>
                  </div>

                  {/* Feature Cards */}
                  <div className="flex gap-6 w-full max-w-2xl justify-center">
                    <div className="flex-1 max-w-[280px] p-6 glass-border rounded-lg text-center flex flex-col items-center">
                      <p className="text-base font-semibold text-gray-200 mb-2">📚 Use Documents</p>
                      <p className="text-sm text-gray-400">Reference your uploaded files</p>
                    </div>

                    <div className="flex-1 max-w-[280px] p-6 glass-border rounded-lg text-center flex flex-col items-center">
                      <p className="text-base font-semibold text-gray-200 mb-2">🎯 Get Citations</p>
                      <p className="text-sm text-gray-400">See sources for every answer</p>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`w-full mb-6 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`message-bubble ${msg.role === 'user' ? 'message-user max-w-[70%]' : 'message-assistant max-w-[78%]'}`}>
                      {/* If assistant message has content, show it; otherwise show pending logs */}
                      {msg.role === 'assistant' && !msg.content && msg.logs && msg.logs.length > 0 ? (
                        <div className="flex items-center gap-2 text-gray-300">
                          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                          <p className="text-sm">
                            {getFriendlyMessage(msg.logs[msg.logs.length - 1].stage, msg.logs[msg.logs.length - 1].message)}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="prose prose-sm prose-invert max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>

                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-600">
                              <p className="text-sm font-semibold text-cyan-300 mb-3">📚 Sources & Citations</p>
                              <div className="space-y-3">
                                {msg.citations.map((cite, i) => (
                                  <div
                                    key={i}
                                    className="p-3 rounded-lg bg-background/50 border border-gray-600/20 hover:border-gray-500/40 transition-all"
                                  >
                                    <div className="flex gap-2">
                                      <span className="text-cyan-300 font-bold flex-shrink-0">[{i + 1}]</span>
                                      <div>
                                        <p className="font-semibold text-gray-200">{cite.document_name}</p>
                                        {cite.section && (
                                          <p className="text-xs text-gray-500 mt-1">📍 Section: {cite.section}</p>
                                        )}
                                        {cite.content && (
                                          <p className="text-xs text-gray-500 mt-2 italic">&quot;{cite.content.substring(0, 100)}...&quot;</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {msg.role === 'assistant' && msg.confidence !== undefined && (
                        <div className="mt-3">
                          <div className="confidence-row rounded-lg overflow-hidden border border-cyan-400/20 flex">
                            <div className="confidence-label px-3 py-2 bg-cyan-500/8 text-cyan-300 text-sm font-semibold flex items-center gap-2">
                              <span>🎯</span>
                              <span>Confidence Score</span>
                            </div>
                            <div className="confidence-percent px-3 py-2 text-sm bg-background-alt text-cyan-300 font-bold text-right ml-auto">{msg.confidence}%</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}


              {/* no separate logs panel - logs render inside the assistant bubble */}

              <div ref={messagesEndRef} />
            </div>

            {/* ================= INPUT ================= */}
            <form
              onSubmit={handleSubmit}
              className="flex gap-3 border-t border-gray-700 px-3 py-4"
            >
              <button
                type="button"
                onClick={handleClearSession}
                className="px-3 py-2 rounded-lg bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
              >
                Clear Memory
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about compliance, regulations, policies..."
                className="flex-1 rounded-lg px-4 py-3 bg-background-alt border border-gray-700 text-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="px-6 py-3 rounded-lg bg-cyan-600 text-white font-semibold hover:bg-cyan-500 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
