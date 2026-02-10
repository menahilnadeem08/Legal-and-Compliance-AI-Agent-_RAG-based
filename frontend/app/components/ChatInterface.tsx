'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import LogViewer from './LogViewer';
import Navigation from './Navigation';

interface Citation {
  document_name: string;
  document_version?: string;
  section?: string;
  section_id?: string;
  page?: number;
  content: string;
  relevance_score?: number;
  search_method?: string;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error';
  stage: string;
  message: string;
  data?: any;
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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  confidence?: number;
  version_warnings?: string[];
  sources_used?: {
    total_documents: number;
    versions: string[];
    has_outdated: boolean;
  };
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export default function ChatInterface() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const addLog = (
    message: string,
    level: 'info' | 'success' | 'warning' | 'error' = 'info'
  ) => {
    const now = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs((prev) => [...prev, { timestamp: now, level, message }]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLogs([]);
    setShowLogs(true);
    setSidebarOpen(true); // Auto-open sidebar when sending message

    addLog('🔍 Initializing query processing...', 'info');

    try {
      addLog('📚 Searching document database...', 'info');

      // Get token from localStorage (employee) or session (admin Google OAuth)
      let token: string | null =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token && session && (session.user as any)?.token) {
        token = (session.user as any).token;
      }

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/query`,
        {
          query: input,
        },
        {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined,
        }
      );

      addLog(
        `📖 Retrieved ${response.data.citations?.length || 0} relevant documents`,
        'success'
      );
      addLog('🧠 Generating answer with AI...', 'info');
      addLog('✅ Answer generated successfully', 'success');

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.answer,
        citations: response.data.citations,
        confidence: response.data.confidence,
        version_warnings: response.data.version_warnings,
        sources_used: response.data.sources_used,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Error:', error);
      addLog(`❌ Error: ${error.message || 'Failed to process query'}`, 'error');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '❌ Error processing your query. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="w-screen h-[calc(100vh-88px)] flex flex-col bg-gradient-to-br from-background to-background-alt overflow-hidden pt-6">
        {/* Main Content Area */}
        <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden min-h-0">
          {/* Center Welcome Message - Always visible when sidebar is closed */}
          {!sidebarOpen && (
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div className="text-center max-w-md px-4">
                <div className="text-6xl mb-6 animate-float">💬</div>
                <h2 className="text-3xl font-bold text-white mb-3">
                  Welcome to Chat Assistant
                </h2>
                <p className="text-gray-300 mb-8">
                  Ask questions about your uploaded legal documents. Get instant
                  answers with proper citations.
                </p>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-left">
                    <p className="text-lg font-semibold text-cyan-300 mb-1">
                      📚 Use Documents
                    </p>
                    <p className="text-sm text-gray-400">
                      Reference your uploaded files
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-left">
                    <p className="text-lg font-semibold text-cyan-300 mb-1">
                      🎯 Get Citations
                    </p>
                    <p className="text-sm text-gray-400">
                      See sources for every answer
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chat Sidebar - Toggleable */}
          {sidebarOpen && (
            <div className="w-96 flex flex-col animate-slide-in-left min-h-0">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 glass-border p-4 rounded-2xl min-h-0">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <div className="text-4xl mb-3">💬</div>
                      <p className="text-sm text-gray-400">Start a conversation</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Ask questions about your documents
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex animate-fade-in ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`message-bubble ${
                            msg.role === 'user'
                              ? 'message-user max-w-xs'
                              : 'message-assistant max-w-sm'
                          }`}
                        >
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-sm prose-invert max-w-none">
                              <ReactMarkdown
                                components={{
                                  h1: ({ node, ...props }) => (
                                    <h1
                                      className="text-lg font-bold mt-3 mb-2 text-cyan-300"
                                      {...props}
                                    />
                                  ),
                                  h2: ({ node, ...props }) => (
                                    <h2
                                      className="text-base font-bold mt-2 mb-1 text-cyan-300"
                                      {...props}
                                    />
                                  ),
                                  ul: ({ node, ...props }) => (
                                    <ul
                                      className="list-disc ml-4 my-1 space-y-1"
                                      {...props}
                                    />
                                  ),
                                  li: ({ node, ...props }) => (
                                    <li
                                      className="text-foreground-dim text-sm"
                                      {...props}
                                    />
                                  ),
                                  p: ({ node, ...props }) => (
                                    <p
                                      className="my-1 text-foreground-dim text-sm"
                                      {...props}
                                    />
                                  ),
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-white text-sm">{msg.content}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex justify-start animate-fade-in">
                        <div className="message-bubble message-assistant">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse-glow"></div>
                            <p className="text-foreground-dim text-sm">
                              Analyzing your query...
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input Area in Sidebar */}
              <form
                onSubmit={handleSubmit}
                className="glass-border flex gap-2 p-3 flex-shrink-0"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about documents..."
                  className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-all text-white bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed"
                >
                  {loading ? '⟳' : '➤'}
                </button>
              </form>
            </div>
          )}

          {/* Logs Sidebar */}
          {showLogs && (
            <div className="w-96 animate-slide-in-right min-h-0">
              <LogViewer logs={logs} isLoading={loading} />
            </div>
          )}
        </div>

        {/* Floating Chat Button - Bottom Left */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed bottom-8 left-8 w-16 h-16 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-2xl transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center text-2xl z-50 animate-float"
            title="Open Chat"
          >
            💬
          </button>
        )}

        {/* Close Chat Button - Shows when sidebar is open */}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="fixed bottom-8 left-8 w-12 h-12 rounded-full bg-gray-700/80 hover:bg-gray-600 text-white shadow-lg transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center text-xl z-50 backdrop-blur-sm border border-gray-600"
            title="Close Chat"
          >
            ✕
          </button>
        )}
      </div>
    </>
  );
}
