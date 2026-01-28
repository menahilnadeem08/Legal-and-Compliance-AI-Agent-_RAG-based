'use client';

import { useState } from 'react';
import axios from 'axios';

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

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null);

  const getRelevanceColor = (score?: number): string => {
    if (!score) return 'bg-gray-100 text-gray-800';
    if (score >= 0.9) return 'bg-green-100 text-green-800';
    if (score >= 0.7) return 'bg-blue-100 text-blue-800';
    if (score >= 0.5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getSearchMethodIcon = (method?: string): string => {
    switch (method) {
      case 'both':
        return '🎯';
      case 'vector':
        return '🔍';
      case 'keyword':
        return '📝';
      default:
        return '📄';
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/api/query', {
        query: input,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.answer,
        citations: response.data.citations,
        confidence: response.data.confidence,
        version_warnings: response.data.version_warnings,
        sources_used: response.data.sources_used,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Error processing query' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Legal Compliance Assistant</h1>
      
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`p-4 rounded-lg ${
              msg.role === 'user' 
                ? 'bg-teal-900 bg-opacity-50 border border-teal-700' 
                : 'bg-gray-800 bg-opacity-50 border border-gray-700'
            }`}
          >
            <p className="font-semibold text-white mb-2">
              {msg.role === 'user' ? '👤 You' : '⚖️ Assistant'}
            </p>
            
            {/* Main Answer */}
            <p className="text-gray-200 whitespace-pre-wrap mb-3">{msg.content}</p>

            {/* Confidence Badge */}
            {msg.confidence !== undefined && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400">Confidence:</span>
                <div className="w-32 h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      msg.confidence >= 70
                        ? 'bg-green-500'
                        : msg.confidence >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${msg.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-gray-300">{msg.confidence}%</span>
              </div>
            )}

            {/* Version Warnings */}
            {msg.version_warnings && msg.version_warnings.length > 0 && (
              <div className="mb-3 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded p-3">
                <p className="text-xs font-semibold text-yellow-200 mb-1">⚠️ Version Notice:</p>
                {msg.version_warnings.map((warning, i) => (
                  <p key={i} className="text-xs text-yellow-100 mb-1">{warning}</p>
                ))}
              </div>
            )}

            {/* Sources Summary */}
            {msg.sources_used && (
              <div className="mb-3 text-xs text-gray-400 bg-gray-700 bg-opacity-30 rounded p-2">
                <p className="font-semibold text-gray-300 mb-1">📚 Sources Used:</p>
                <ul className="space-y-1">
                  {msg.sources_used.versions.map((v, i) => (
                    <li key={i}>• {v}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Citations Section */}
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <p className="text-sm font-semibold text-white mb-3">📖 Grounded Citations:</p>
                <div className="space-y-2">
                  {msg.citations.map((citation, i) => (
                    <div
                      key={i}
                      className="bg-gray-700 bg-opacity-50 rounded-lg p-3 border border-gray-600 hover:border-gray-500 transition-colors cursor-pointer"
                      onClick={() => setExpandedCitation(expandedCitation === i ? null : i)}
                    >
                      {/* Citation Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-semibold text-white text-sm">
                            [{i + 1}] {citation.document_name}
                            {citation.document_version && (
                              <span className="text-xs text-gray-400 ml-2">v{citation.document_version}</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {citation.section && (
                              <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
                                {citation.section}
                              </span>
                            )}
                            <span className="text-xs bg-gray-600 text-gray-200 px-2 py-1 rounded">
                              {citation.page ? `Page: ${citation.page}` : 'N/A'}
                            </span>
                            {citation.search_method && (
                              <span className="text-xs text-gray-300">
                                {getSearchMethodIcon(citation.search_method)} {citation.search_method}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {expandedCitation === i && (
                        <div className="mt-3 pt-3 border-t border-gray-600">
                          <div className="bg-gray-800 bg-opacity-50 rounded p-2 mb-2">
                            <p className="text-xs font-semibold text-gray-300 mb-1">Quote:</p>
                            <blockquote className="text-xs text-gray-200 italic border-l-2 border-blue-500 pl-2">
                              "{citation.content}"
                            </blockquote>
                          </div>
                          {citation.section_id && (
                            <p className="text-xs text-gray-400">
                              <span className="font-semibold">Section ID:</span> {citation.section_id}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-pulse">●</div>
            <p>Analyzing documents and generating answer...</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a legal or compliance question..."
          className="flex-1 p-2 border rounded"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
        >
          Send
        </button>
      </form>
    </div>
  );
}