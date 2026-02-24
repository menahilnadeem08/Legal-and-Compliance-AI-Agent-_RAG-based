"use client";

import Link from "next/link";
import { Gavel, MessageSquare, Plus, Trash2 } from "lucide-react";

export type ConversationItem = {
  id: string;
  title?: string;
  updated_at?: string;
  created_at?: string;
};

/** Format latest activity time as HH:MM (e.g. "2:35") from conversation updated_at. */
function formatConversationTime(updatedAt?: string): string {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

type Props = {
  conversations: ConversationItem[];
  currentId: string | null;
  onNewConversation: () => void;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  userName?: string;
};

export function ConversationList({
  conversations,
  currentId,
  onNewConversation,
  onSelect,
  onDelete,
  userName = "Your Name",
}: Props) {
  const initial = userName.slice(0, 1).toUpperCase();

  return (
    <aside className="flex h-full w-64 min-w-[16rem] flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* Logo + name */}
      <Link
        href="/dashboard"
        className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-800 hover:opacity-90"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 dark:bg-blue-500 text-white">
          <Gavel className="h-5 w-5" />
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">Legal RAG</span>
      </Link>

      {/* New Conversation */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-3 py-2.5 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </button>
      </div>

      {/* RECENT */}
      <div className="flex flex-1 flex-col min-h-0">
        <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Recent
        </p>
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 ? (
            <li className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
              No conversations yet
            </li>
          ) : (
            conversations.map((c) => (
              <li key={c.id} className="group">
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    currentId === c.id
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate flex-1">{c.title?.trim() || "New Chat"}</span>
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      className="flex-shrink-0 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-opacity"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {c.updated_at && (
                  <p className="pl-9 pr-3 pb-1.5 text-xs text-slate-400 dark:text-slate-500">
                    {formatConversationTime(c.updated_at)}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      {/* User profile at bottom */}
      <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{userName}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Legal Team</p>
        </div>
      </div>
    </aside>
  );
}
