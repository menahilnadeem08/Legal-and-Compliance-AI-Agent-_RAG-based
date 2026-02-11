'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Conversation {
  id: number;
  user_id: number;
  title?: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface ConversationListProps {
  onSelectConversation?: (conversationId: number) => void;
  currentConversationId?: number;
  token?: string | null;
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

export default function ConversationList({ onSelectConversation, currentConversationId, token, sidebarOpen, setSidebarOpen }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchConversations();
  }, [token]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      
      if (!token) {
        setError('Authentication required');
        return;
      }

      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/conversations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      setConversations(response.data.conversations || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (conversationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!window.confirm('Delete this conversation?')) {
      return;
    }

    if (!token) {
      alert('Authentication required');
      return;
    }

    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/conversations/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (currentConversationId === conversationId) {
        router.push('/chat');
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
      alert('Failed to delete conversation');
    }
  };

  const handleSelectConversation = (conversationId: number) => {
    onSelectConversation?.(conversationId);
    router.push(`/chat?conversation=${conversationId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffHours < 168) { // 7 days
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="h-full bg-gray-900 border-r border-gray-800 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="px-6 py-6 border-b border-gray-700 flex-shrink-0 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Chat History</h2>
        {setSidebarOpen && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        )}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-4">
            <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
          </div>
        ) : error ? (
          <div className="text-xs text-red-400 p-2 bg-red-950 rounded">{error}</div>
        ) : conversations.filter(c => c.message_count > 0).length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4">No conversations yet</div>
        ) : (
          <div className="space-y-5">
            {conversations.filter(c => c.message_count > 0).map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation.id)}
                className={`group p-6 rounded-lg cursor-pointer transition-all ${
                  currentConversationId === conversation.id
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-semibold truncate">
                      {conversation.title || `Chat ${conversation.id}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {conversation.message_count} message{conversation.message_count !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(conversation.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conversation.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all flex-shrink-0"
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
