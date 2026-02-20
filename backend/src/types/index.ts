import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email?: string;
    username?: string;
    name?: string;
    picture?: string;
    role?: string;
    admin_id?: number;
    auth_provider?: string;
    email_verified?: boolean;
    forcePasswordChange?: boolean;
  };
  document?: {
    id: string;
    admin_id: number;
  };
}

export interface Document {
    id: string;
    name: string;
    category: string;
    version: string;
    upload_date: Date;
    is_active: boolean;
    metadata?: Record<string, any>;
  }
  
  export interface Chunk {
    id: string;
    document_id: string;
    content: string;
    embedding?: number[];
    page_number?: number;
    section_name?: string;
    chunk_index: number;
    metadata?: Record<string, any>;
  }
  
  export interface QueryResult {
    answer: string;
    citations: Citation[];
    confidence: number;
  }
  
  export interface Citation {
    document_name: string;
    document_version?: string;  // Version of the document
    section?: string;            // Section/clause name
    section_id?: string;         // Clause or section identifier
    page?: number;               // Page number
    content: string;             // Quote from the document
    relevance_score?: number;    // How relevant this citation is (0-1)
    search_method?: string;      // 'vector', 'keyword', or 'both'
  }

  export interface AuditLog {
    id: number;
    admin_id: number;
    actor_id?: number;
    action: string;
    resource_type?: string;
    resource_id?: string;
    metadata: Record<string, any>;
    ip_address?: string;
    user_agent?: string;
    created_at: Date;
  }