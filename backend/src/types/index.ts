export interface Document {
    id: string;
    name: string;
    type: string;
    version: string;
    upload_date: Date;
    is_latest: boolean;
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
    section: string;
    page?: number;
    content: string;
  }