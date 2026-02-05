'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import LogViewer from './LogViewer';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const addLog = (message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const now = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs(prev => [...prev, { timestamp: now, level, message }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLogs([]);
    setShowLogs(true);

    addLog('🔍 Initializing query processing...', 'info');

    try {
      addLog('📚 Searching document database...', 'info');
      
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/query`, {
        query: input,
      });

      addLog(`📖 Retrieved ${response.data.citations?.length || 0} relevant documents`, 'success');
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

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Error:', error);
      addLog(`❌ Error: ${error.message || 'Failed to process query'}`, 'error');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '❌ Error processing your query. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gradient-to-br from-background to-background-alt">
      {/* Header */}
      <div className="glass-border m-4 mb-0 rounded-b-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg animate-float">
              ⚖️
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gradient">Legal Compliance Assistant</h1>
              <p className="text-xs text-gray-400">AI-Powered Legal Document Analysis</p>
            </div>
          </div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`px-8 py-4 rounded-lg font-medium transition-all text-sm ${
              showLogs
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400'
                : 'bg-gray-600/30 text-gray-300 border border-gray-500/50 hover:bg-gray-600/50'
            }`}
          >
            {showLogs ? '👁️ Hide Logs' : '📋 Show Logs'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-6xl mb-4 animate-float">📋</div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Legal Compliance Assistant</h2>
                <p className="text-foreground-dim max-w-md mb-8">
                  Upload your legal documents and ask questions about compliance, regulations, and legal matters. Our AI will provide detailed answers with proper citations.
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="p-4 glass-border text-left">
                    <p className="text-sm font-semibold text-gray-300 mb-2">📄 Upload Documents</p>
                    <p className="text-xs text-gray-400">Add PDFs or Word documents to your knowledge base</p>
                  </div>
                  <div className="p-4 glass-border text-left">
                    <p className="text-sm font-semibold text-secondary mb-2">💬 Ask Questions</p>
                    <p className="text-xs text-foreground-dim">Query your documents with AI-powered search</p>
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
                              li: ({node, ...props}) => <li className="text-foreground-dim" {...props} />,
                              p: ({node, ...props}) => <p className="my-2 text-foreground-dim" {...props} />,
                              hr: ({node, ...props}) => <hr className="my-4 border-foreground-dim/30" {...props} />,
                              strong: ({node, ...props}) => <strong className="font-bold text-foreground" {...props} />,
                              code: ({node, ...props}) => <code className="bg-background-alt px-2 py-1 rounded text-cyan-300 font-mono text-sm" {...props} />,
                              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/50 pl-4 my-2 italic text-foreground-dim" {...props} />,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-foreground-dim/20">
                            <p className="text-sm font-semibold text-cyan-300 mb-3">📚 Sources & Citations</p>
                            <div className="space-y-3">
                              {msg.citations.map((cite, i) => (
                                <div
                                  key={i}
                                  className="p-3 rounded-lg bg-background/50 border border-foreground-dim/10 hover:border-primary/30 transition-all"
                                >
                                  <div className="flex gap-2">
                                    <span className="text-cyan-300 font-bold flex-shrink-0">[{i + 1}]</span>
                                    <div>
                                      <p className="font-semibold text-foreground">{cite.document_name}</p>
                                      {cite.section && (
                                        <p className="text-xs text-foreground-dim mt-1">
                                          📍 Section: {cite.section}
                                        </p>
                                      )}
                                      {cite.relevance_score && (
                                        <p className="text-xs text-foreground-dim">
                                          Relevance: {(cite.relevance_score * 100).toFixed(0)}%
                                        </p>
                                      )}
                                      {cite.content && (
                                        <p className="text-xs text-foreground-dim mt-2 italic">
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
                    <p className="text-foreground-dim">Analyzing your query...</p>
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

        {/* Logs Sidebar */}
        {showLogs && (
          <div className="w-96 animate-slide-in-right">
            <LogViewer logs={logs} isLoading={loading} />
          </div>
        )}
      </div>
    </div>
  );
}