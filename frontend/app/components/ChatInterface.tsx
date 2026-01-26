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
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Legal Compliance Assistant</h1>
      
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`p-4 rounded ${msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <p className="font-semibold">{msg.role === 'user' ? 'You' : 'Assistant'}</p>
            <p className="mt-2">{msg.content}</p>
            
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-4 border-t pt-2">
                <p className="text-sm font-semibold">Citations:</p>
                {msg.citations.map((cite, i) => (
                  <div key={i} className="text-sm mt-2">
                    <p className="font-medium">[{i + 1}] {cite.document_name}</p>
                    <p className="text-gray-600">Section: {cite.section}</p>
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