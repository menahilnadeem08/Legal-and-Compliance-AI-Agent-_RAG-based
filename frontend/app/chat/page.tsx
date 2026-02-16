'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import Navigation from '../components/Navigation';
import PageContainer from '../components/PageContainer';
import ConversationList from '../components/ConversationList';

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
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<LogEntry[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversation = useCallback(async (conversationId: number) => {
    try {
      if (!token) {
        console.error('No token available');
        return;
      }

      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${conversationId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        }
      );

      const data = response.data;
      setCurrentConversationId(conversationId);
      
      // Convert DB messages to UI format
      const convertedMessages: Message[] = data.messages.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        citations: msg.metadata?.citations,
        confidence: msg.metadata?.confidence,
      }));
      
      setMessages(convertedMessages);
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  }, [token]);

  // Load conversation from URL
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && token && messages.length === 0) {
      // Only load if we don't already have messages (avoid overwriting pending state)
      loadConversation(parseInt(conversationId));
    }
  }, [searchParams, token]);

  useEffect(() => {
    const localToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

    if (localToken && userStr) {
      setIsEmployee(true);
      setToken(localToken);
      return;
    }

    // Check for NextAuth session token
    if (session && (session.user as any)?.token) {
      setToken((session.user as any).token);
      return;
    }

    if (status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }
  }, [status, router, session]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createNewConversation = useCallback(async () => {
    try {
      if (!token) {
        console.error('No token available');
        return null;
      }

      console.log('Creating new conversation with token:', token.substring(0, 20) + '...');
      
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations`,
        {
          title: 'New Chat',
          metadata: {}
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        }
      );

      console.log('Conversation created:', response.data);
      
      const newConvId = response.data.id;
      setCurrentConversationId(newConvId);
      await router.push(`/chat?conversation=${newConvId}`);
      return newConvId;
    } catch (err) {
      console.error('Error creating conversation:', err);
      alert('Failed to create conversation: ' + (err instanceof Error ? err.message : String(err)));
      return null;
    }
  }, [router, token]);

  const saveMessage = useCallback(async (conversationId: number, role: 'user' | 'assistant', content: string, metadata?: any) => {
    try {
      if (!token) {
        console.error('No token available');
        return;
      }

      if (!conversationId) {
        console.error('No conversation ID provided');
        return;
      }

      console.log('Saving message to conversation:', conversationId, 'role:', role);

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${conversationId}/messages`,
        {
          role,
          content,
          metadata: metadata || {}
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        }
      );
      console.log('Message saved successfully');
    } catch (err) {
      console.error('Error saving message:', err);
    }
  }, [token]);

  /* Auto scroll */
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    router.push('/chat');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    const userQuery = input;

    setInput('');
    setLoading(true);

    // Add user message AND an empty pending assistant message FIRST
    setMessages(prev => [
      ...prev,
      userMessage,
      { role: 'assistant', content: '', logs: [], confidence: undefined }
    ]);

    // Create or get conversation ID
    let convId = currentConversationId;
    if (!convId) {
      convId = await createNewConversation();
      if (!convId) {
        setLoading(false);
        return;
      }
    }

    // Save user message
    await saveMessage(convId, 'user', userQuery);

    try {
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

        buffer += decoder.decode(value, { stream: true });
        const messagesChunks = buffer.split('\n\n');
        buffer = messagesChunks.pop() || '';

        for (const msgChunk of messagesChunks) {
          if (!msgChunk.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(msgChunk.slice(6));

            if (data.type === 'log') {
              logs.push(data.log);
              setCurrentLogs([...logs]);
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

      if (!hasError && finalAnswer) {
        // Save assistant message with the same conversation ID
        await saveMessage(convId, 'assistant', finalAnswer.answer || 'No answer generated', {
          citations: finalAnswer.citations,
          confidence: finalAnswer.confidence,
        });
      } else if (!hasError && !finalAnswer) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: '❌ No response from server',
            logs,
          };
          return updated;
        });
        await saveMessage(convId, 'assistant', '❌ No response from server');
      } else if (hasError) {
        // Error was already saved in the error block
      }
    } catch (err: any) {
      console.error('Error:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '❌ No response from server',
          logs: logs,
        };
        return updated;
      });
      await saveMessage(convId, 'assistant', `❌ Error: ${err.message || 'Error processing your query.'}`);
    } finally {
      setLoading(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (status === 'loading') return null;

  const anyUserMessages = messages.some(m => m.role === 'user' && m.content && m.content.trim() !== '');

  return (
    <>
      <Navigation />
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - Collapsible Conversation List */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-gray-900 border-r border-gray-800 overflow-hidden transition-all duration-300 flex-shrink-0 mr-4`}>
          <ConversationList
            onSelectConversation={loadConversation}
            currentConversationId={currentConversationId || undefined}
            token={token}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        </div>

        {/* Main Content Area */}
        <PageContainer className="flex-1 overflow-hidden">
          <div className="w-full h-full flex flex-col overflow-hidden">
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-3">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
                    title="Open sidebar"
                  >
                    ▶
                  </button>
                )}
              </div>
              <h2 className="text-white font-semibold absolute left-1/2 transform -translate-x-1/2">Legal Compliance Chat</h2>
              <button
                onClick={handleNewChat}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                + New Chat
              </button>
            </div>
            {/* ================= MESSAGES ================= */}
            <div className="!flex-1 !overflow-y-auto !space-y-6 !px-6 !py-6">
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
                messages.map((msg, idx) => {
                  const shouldShowLogs = msg.role === 'assistant' && !msg.content && msg.logs && msg.logs.length > 0 && anyUserMessages;
                  return (
                    <div key={idx} className={`w-full !mb-6 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`message-bubble ${msg.role === 'user' ? 'message-user max-w-[70%]' : 'message-assistant max-w-[78%]'}`}>
                        {/* If assistant message has content, show it; otherwise show pending logs */}
                        {shouldShowLogs && msg.logs ? (
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
                  );
                })
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

            {/* ================= INPUT ================= */}
            <form
              onSubmit={handleSubmit}
              className="flex gap-3 border-t border-gray-700 px-3 py-4"
            >
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
        </PageContainer>
      </div>
    </>
  );
}