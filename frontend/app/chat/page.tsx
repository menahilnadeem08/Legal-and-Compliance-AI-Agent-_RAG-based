'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import Navigation from '../components/Navigation';

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

// Friendly message translations for non-technical users
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

interface LogEntry {
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error';
  stage: string;
  message: string;
  data?: any;
}

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
  logs?: LogEntry[];
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<LogEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check authentication and user type
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

    // Employees can access chat
    if (token && userStr) {
      setIsEmployee(true);
      return;
    }

    // Redirect to login if not authenticated
    if (status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }
  }, [status, router]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow access if admin or employee
  if (!session && !isEmployee) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    const userQuery = input;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setCurrentLogs([]);

    try {
      // Get token from localStorage (employee) or session (admin)
      let token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token && session && (session.user as any)?.token) {
        token = (session.user as any).token;
      }

      if (!token) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: '❌ Authentication required. Please sign in again.' },
        ]);
        setLoading(false);
        return;
      }

      // Use fetch with streaming
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query: userQuery }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response does not support streaming');
      }

      const decoder = new TextDecoder();
      let hasError = false;
      let finalAnswer: any = null;
      let buffer = '';

      const logs: LogEntry[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (message.startsWith('data: ')) {
            try {
              const data = JSON.parse(message.slice(6));

              if (data.type === 'log') {
                logs.push(data.log);
                setCurrentLogs([...logs]);
              } else if (data.type === 'answer') {
                finalAnswer = data.answer;
              } else if (data.type === 'complete') {
                if (finalAnswer) {
                  const assistantMessage: Message = {
                    role: 'assistant',
                    content: finalAnswer.answer || 'No answer generated',
                    citations: finalAnswer.citations,
                    confidence: finalAnswer.confidence,
                    version_warnings: finalAnswer.version_warnings,
                    sources_used: finalAnswer.sources_used,
                    logs: logs,
                  };
                  setMessages(prev => [...prev, assistantMessage]);
                }
              } else if (data.type === 'error') {
                hasError = true;
                const errorMessage: Message = {
                  role: 'assistant',
                  content: `❌ Error: ${data.error}`,
                  logs: logs,
                };
                setMessages(prev => [...prev, errorMessage]);
                break;
              }
            } catch (err) {
              console.error('Failed to parse SSE message:', err, message);
            }
          }
        }
      }

      if (!hasError && !finalAnswer) {
        const errorMessage: Message = {
          role: 'assistant',
          content: '❌ No response from server',
          logs: logs,
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error: any) {
      console.error('Error:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ Error: ${error.message || 'Error processing your query. Please try again.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="w-full h-screen bg-gradient-to-br from-background to-background-alt flex flex-col overflow-hidden pt-32">
        <div className="flex-1 flex gap-4 overflow-hidden p-4 max-w-7xl mx-auto w-full justify-center">
          {/* Messages Column */}
          <div className="flex-1 flex flex-col overflow-hidden max-w-2xl">
            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="text-6xl mb-4 animate-float">💬</div>
                  <h2 className="text-2xl font-bold text-gray-300 mb-2">Welcome to Chat Assistant</h2>
                  <p className="text-gray-400 max-w-md mb-6">
                    Ask questions about your uploaded legal documents. Get instant answers with proper citations.
                  </p>
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    <div className="p-4 glass-border text-left">
                      <p className="text-sm font-semibold text-gray-300 mb-2">📚 Use Documents</p>
                      <p className="text-xs text-gray-500">Reference your uploaded files</p>
                    </div>
                    <div className="p-4 glass-border text-left">
                      <p className="text-sm font-semibold text-gray-300 mb-2">🎯 Get Citations</p>
                      <p className="text-xs text-gray-500">See sources for every answer</p>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex animate-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`message-bubble ${
                        msg.role === 'user' ? 'message-user max-w-xs' : 'message-assistant max-w-2xl'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="space-y-4">
                          <div className="prose prose-sm prose-invert max-w-none">
                            <ReactMarkdown
                              components={{
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2 text-cyan-300" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2 text-cyan-300" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-semibold mt-2 mb-1 text-cyan-300" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc ml-5 my-2 space-y-1" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />,
                                li: ({node, ...props}) => <li className="text-gray-300" {...props} />,
                                p: ({node, ...props}) => <p className="my-2 text-gray-300" {...props} />,
                                hr: ({node, ...props}) => <hr className="my-4 border-gray-600" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-bold text-gray-200" {...props} />,
                                code: ({node, ...props}) => <code className="bg-background-alt px-2 py-1 rounded text-cyan-300 font-mono text-sm" {...props} />,
                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-cyan-400/50 pl-4 my-2 italic text-gray-400" {...props} />,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
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
                                          <p className="text-xs text-gray-500 mt-1">
                                            📍 Section: {cite.section}
                                          </p>
                                        )}
                                        {cite.relevance_score && (
                                          <p className="text-xs text-gray-500">
                                            Relevance: {(cite.relevance_score * 100).toFixed(0)}%
                                          </p>
                                        )}
                                        {cite.content && (
                                          <p className="text-xs text-gray-500 mt-2 italic">
                                            "{cite.content.substring(0, 100)}..."
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {msg.confidence !== undefined && (
                            <div className="mt-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-400/30">
                              <div className="flex items-center gap-2">
                                <span className="text-cyan-300">🎯</span>
                                <div>
                                  <p className="text-xs font-semibold text-cyan-300">Confidence Score</p>
                                  <div className="w-32 h-2 bg-background-alt rounded-full mt-1 overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                                      style={{ width: `${msg.confidence}%` }}
                                    ></div>
                                  </div>
                                </div>
                                <span className="text-cyan-300 font-bold text-sm">{msg.confidence}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-white">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="message-bubble message-assistant">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse-glow"></div>
                      <p className="text-gray-400">
                        {currentLogs.length > 0
                          ? getFriendlyMessage(
                              currentLogs[currentLogs.length - 1].stage,
                              currentLogs[currentLogs.length - 1].message
                            )
                          : '🔍 Searching your documents...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="glass-border flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about compliance, regulations, policies..."
                className="flex-1"
                disabled={loading}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-8 py-3 rounded-lg font-bold transition-all flex items-center gap-2 text-white bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed shadow-lg hover:shadow-cyan-500/50 hover:shadow-lg"
              >
                {loading ? '⟳' : '➤'} {loading ? 'Processing' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
