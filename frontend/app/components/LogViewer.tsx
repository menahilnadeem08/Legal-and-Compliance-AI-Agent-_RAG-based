'use client';

import { useEffect, useRef } from 'react';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface LogViewerProps {
  logs: LogEntry[];
  isLoading?: boolean;
}

export default function LogViewer({ logs, isLoading = false }: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelStyles = (level: string) => {
    switch (level) {
      case 'success':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  return (
    <div className="glass-border h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground-dim uppercase tracking-wider">
          Processing Logs
        </h3>
        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse-glow"></div>
            <span className="text-xs text-foreground-dim">Live</span>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-foreground-dim">
            <p>Logs will appear here...</p>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              className={`p-2 rounded border-l-4 animate-fade-in ${getLevelStyles(
                log.level
              )}`}
            >
              <div className="flex gap-2">
                <span className="flex-shrink-0 font-bold">
                  {getLevelIcon(log.level)}
                </span>
                <span className="text-foreground-dim flex-shrink-0 min-w-fit">
                  [{log.timestamp}]
                </span>
                <span className="break-words">{log.message}</span>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="p-2 rounded border-l-4 bg-blue-500/20 text-blue-300 border-blue-500/30 animate-shimmer">
            <div className="flex gap-2">
              <span className="flex-shrink-0">⟳</span>
              <span className="text-foreground-dim flex-shrink-0">Processing...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
