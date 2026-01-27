'use client';

import { useState } from 'react';
import axios from 'axios';

interface Citation {
  document_name: string;
  section: string;
  page?: number;
  content: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  confidence?: number;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Function to group citations by document name
  const groupCitations = (citations: Citation[]) => {
    const grouped = citations.reduce((acc, cite) => {
      if (!acc[cite.document_name]) {
        acc[cite.document_name] = [];
      }
      acc[cite.document_name].push(cite);
      return acc;
    }, {} as Record<string, Citation[]>);
    
    return Object.entries(grouped);
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
    <div className="flex flex-col h-full">
      <h1 className="text-2xl font-bold mb-4 text-white">Legal Compliance Assistant</h1>
      
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
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
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </p>
            <p className="text-gray-200 whitespace-pre-wrap">{msg.content}</p>
            
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <p className="text-sm font-semibold text-white mb-2">Citations:</p>
                {groupCitations(msg.citations).map(([docName, cites], i) => (
                  <div key={i} className="text-sm mt-2 text-gray-300">
                    <p className="font-medium text-white">
                      [{i + 1}] {docName}
                    </p>

                    {cites.length > 1 && (
                      <p className="text-xs text-gray-500 mt-1">
                        ({cites.length} relevant sections found)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {msg.confidence !== undefined && (
              <p className="text-sm text-gray-400 mt-2">
                Confidence: {msg.confidence}%
              </p>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400">
            <div className="animate-pulse">●</div>
            <p>Thinking...</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mt-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a legal or compliance question..."
          className="flex-1 p-3 border border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-600 hover:bg-blue-700 transition-colors font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}