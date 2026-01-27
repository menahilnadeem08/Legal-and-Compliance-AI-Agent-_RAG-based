RAG SYSTEM ARCHITECTURE
========================

┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         EXPRESS API                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   /upload    │  │    /query    │  │  /documents  │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
         │                      │                     │
         ▼                      ▼                     ▼
┌─────────────────┐   ┌─────────────────────────────────────┐
│  INGESTION      │   │     RETRIEVAL PIPELINE              │
│  PIPELINE       │   │                                     │
│                 │   │  1. Query Rewriter                  │
│  1. Parser      │   │     ├─ Original query               │
│     ├─ PDF      │   │     └─ 2-3 variations               │
│     └─ DOCX     │   │                                     │
│                 │   │  2. Hybrid Search                   │
│  2. Chunker     │   │     ├─ Vector Search (cosine)       │
│     ├─ 1000ch   │   │     └─ BM25 Keyword Search          │
│     └─ 200 ovlp │   │                                     │
│                 │   │  3. Fusion & Scoring                │
│  3. Embedder    │   │     ├─ Weight: 0.7 vector           │
│     └─ OpenAI   │   │     ├─ Weight: 0.3 keyword          │
│                 │   │     └─ Query boost                  │
│  4. Store       │   │                                     │
│     └─ pgvector │   │  4. Cross-Encoder Reranker          │
│                 │   │     └─ HuggingFace MiniLM           │
│                 │   │                                     │
│                 │   │  5. Context Compressor              │
│                 │   │     ├─ Deduplicate                  │
│                 │   │     └─ Token limit            │
│                 │   │                                     │
│                 │   │  6. Answer Generator                │
│                 │   │     ├─ GPT-4 mini                   │
│                 │   │     ├─ Citations                    │
│                 │   │     └─ Confidence score             │
└─────────────────┘   └─────────────────────────────────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL + pgvector                                       │  │
│  │                                                              │  │
│  │  Tables:                                                     │  │
│  │  • documents (id, name, type, version, metadata)            │  │
│  │  • chunks (id, content, embedding[], page, section)          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘


DATA FLOW
=========

INGESTION:
Document → Parse → Chunk → Embed → Store in DB

QUERY:
User Query → Rewrite (3 variants) 
          → Vector Search + BM25 Search 
          → Hybrid Scoring 
          → Rerank (top 10) 
          → Compress Context 
          → Generate Answer 
          → Return with Citations


KEY COMPONENTS
==============

Services:
• documentParser.ts    - PDF/DOCX parsing & chunking
• ingestion.ts         - Document processing pipeline
• queryRewriter.ts     - Query expansion (LLM)
• retrieval.ts         - Hybrid search (vector + BM25)
• reranker.ts          - Cross-encoder scoring
• compressor.ts        - Deduplication & token limiting
• generator.ts         - Answer generation with citations

Controllers:
• uploadController.ts  - File upload handling
• queryController.ts   - Query orchestration
• documentController.ts - CRUD operations

Config:
• database.ts          - PostgreSQL connection
• openai.ts            - LLM & embeddings setup