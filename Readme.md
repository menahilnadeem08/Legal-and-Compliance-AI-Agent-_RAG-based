# RAG Document Query System

A production-grade Retrieval-Augmented Generation (RAG) system for legal and compliance document search with hybrid retrieval and intelligent answer generation.

## Features

- **Hybrid Search**: Combines vector embeddings + BM25 keyword search with adaptive weighting
- **Smart Reranking**: Cross-encoder reranking for improved relevance
- **Multi-Format Support**: PDF and DOCX document ingestion with chunking
- **Query Expansion**: Automatic query rewriting for better recall
- **Confidence Scoring**: Multi-factor confidence calculation for answers

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with pgvector
- **AI**: OpenAI (GPT-4, text-embedding-3-small), Hugging Face reranker
- **Parsing**: pdf-parse, pdfjs-dist, mammoth

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add: DATABASE_URL, OPENAI_API_KEY

# Initialize database
psql -d your_db -f schema.sql

# Run server
npm run dev
```

## API Endpoints

- `POST /api/upload` - Upload PDF/DOCX documents
- `POST /api/query` - Query documents and get AI-generated answers
- `GET /api/documents` - List all documents
- `DELETE /api/documents/:id` - Delete a document

## Architecture

1. **Ingestion**: Documents → Parsed → Chunked → Embedded → Stored
2. **Retrieval**: Query → Rewritten → Vector + Keyword Search → Hybrid Scoring
3. **Reranking**: Cross-encoder rescoring for top results
4. **Generation**: Context + Query → LLM → Answer + Citations

## Example Query

```javascript
POST /api/query
{
  "query": "What is the policy on data retention?"
}

Response:
{
  "answer": "According to the Data Governance Policy...",
  "citations": [...],
  "confidence": 87
}
```

## Configuration

Adjust search parameters in `retrieval.ts`:
- `vectorWeight` / `keywordWeight`: Balance semantic vs keyword search
- `bm25Params`: Tune BM25 (k1, b) for your corpus
- `topK`: Number of results to return

---

Built for accurate, explainable document retrieval with legal/compliance focus.