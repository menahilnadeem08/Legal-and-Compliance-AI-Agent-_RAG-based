'use client';

import { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

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
          <div key={idx} className={`p-4 rounded ${msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <p className="font-semibold">{msg.role === 'user' ? 'You' : 'Assistant'}</p>
            
            {/* Use ReactMarkdown for assistant messages */}
            {msg.role === 'assistant' ? (
              <div className="mt-2 prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-base font-semibold mt-2 mb-1" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc ml-5 my-2" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal ml-5 my-2" {...props} />,
                    li: ({node, ...props}) => <li className="my-1" {...props} />,
                    p: ({node, ...props}) => <p className="my-2" {...props} />,
                    hr: ({node, ...props}) => <hr className="my-4 border-gray-300" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="mt-2">{msg.content}</p>
            )}
            
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-4 border-t pt-2">
                <p className="text-sm font-semibold">Citations:</p>
                {msg.citations.map((cite, i) => (
                  <div key={i} className="text-sm mt-2">
                    <p className="font-medium">[{i + 1}] {cite.document_name}</p>
                    {cite.section && (
                      <p className="text-gray-600">Section: {cite.section}</p>
                    )}
                    {cite.content && (
                      <p className="text-gray-700 mt-1">{cite.content}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {msg.confidence !== undefined && (
              <p className="text-sm text-gray-600 mt-2">Confidence: {msg.confidence}%</p>
            )}
          </div>
        ))}
        {loading && <p className="text-gray-500">Thinking...</p>}
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