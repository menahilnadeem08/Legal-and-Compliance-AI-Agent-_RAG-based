type SessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
};

type SessionEntry = {
  messages: SessionMessage[];
  lastUpdated: number;
};

class SessionMemory {
  private store: Map<string, SessionEntry> = new Map();
  private maxMessages = 50;
  private ttlMs: number;
  private cleanupIntervalMs = 60 * 1000; // 1 minute
  private cleanerHandle: NodeJS.Timeout | null = null;

  constructor() {
    const envTtl = process.env.SESSION_TTL_MS;
    this.ttlMs = envTtl ? parseInt(envTtl, 10) : 30 * 60 * 1000; // default 30 minutes
    this.startCleaner();
  }

  private startCleaner() {
    if (this.cleanerHandle) return;
    this.cleanerHandle = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.store.entries()) {
        if (now - entry.lastUpdated > this.ttlMs) {
          this.store.delete(id);
        }
      }
    }, this.cleanupIntervalMs);
    if (typeof this.cleanerHandle.unref === 'function') {
      // allow node to exit if only the cleaner is running
      this.cleanerHandle.unref();
    }
  }

  appendMessage(sessionId: string, role: SessionMessage['role'], content: string) {
    if (!sessionId) return;
    const now = Date.now();
    const entry = this.store.get(sessionId) || { messages: [], lastUpdated: now };
    entry.messages.push({ role, content, timestamp: now });
    // keep only the most recent messages
    if (entry.messages.length > this.maxMessages) {
      entry.messages.splice(0, entry.messages.length - this.maxMessages);
    }
    entry.lastUpdated = now;
    this.store.set(sessionId, entry);
  }

  getMessages(sessionId: string): SessionMessage[] {
    if (!sessionId) return [];
    const entry = this.store.get(sessionId);
    return entry ? entry.messages : [];
  }

  clearSession(sessionId: string) {
    if (!sessionId) return;
    this.store.delete(sessionId);
  }

  // Return a textual representation suitable for including in prompts
  getSessionContextText(sessionId: string, maxItems = 20): string {
    const msgs = this.getMessages(sessionId);
    if (!msgs || msgs.length === 0) return '';
    const slice = msgs.slice(-maxItems);
    return slice
      .map(m => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`)
      .join('\n');
  }
}

export const sessionMemory = new SessionMemory();
