# Legal & Compliance RAG Agent

A Retrieval-Augmented Generation (RAG) based system designed to assist organizations in navigating complex legal documents, regulatory requirements, and internal compliance policies. The system provides accurate, source-backed answers strictly grounded in approved legal and compliance documents.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/typescript-%5E5.0.0-blue.svg)

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## ✨ Features

- 🔍 **Hybrid Search**: Combines semantic (vector) and keyword (BM25) search for optimal retrieval
- 🎯 **Cross-Encoder Reranking**: Uses Cohere's reranking API for precision
- 📚 **Multi-Document Support**: Handles PDFs and DOCX files
- 📝 **Version-Aware**: Automatically prioritizes the latest document versions
- 🔗 **Source Citations**: Provides document references with every answer
- 💬 **Intelligent Q&A**: GPT-powered responses grounded in your documents
- 📊 **Confidence Scoring**: Transparent confidence metrics for each response
- 🎨 **Modern UI**: Clean Next.js interface with dark mode support

---

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │  Next.js + React + TailwindCSS
│  (Next.js)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Backend   │  Express.js + TypeScript
│  (Express)  │
└──────┬──────┘
       │
       ├──────────────┐
       ▼              ▼
┌─────────────┐  ┌──────────────┐
│  PostgreSQL │  │  External    │
│  + pgvector │  │  APIs        │
│             │  │  - OpenAI    │
│  Documents  │  │  - Cohere    │
│  Chunks     │  │              │
│  Embeddings │  └──────────────┘
└─────────────┘
```

### Technology Stack

**Backend:**
- Node.js + TypeScript
- Express.js
- PostgreSQL with pgvector extension
- LangChain (for LLM orchestration)
- OpenAI API (embeddings + GPT)
- Cohere API (reranking)

**Frontend:**
- Next.js 14+ (App Router)
- React
- TailwindCSS
- Axios

**Document Processing:**
- Mammoth (DOCX parsing)
- pdf-parse / pdfjs-dist (PDF parsing)

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **PostgreSQL** >= 14 ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/))

You'll also need API keys for:
- **OpenAI API** ([Get API Key](https://platform.openai.com/api-keys))
- **Cohere API** (Optional, for reranking) ([Get API Key](https://dashboard.cohere.com/api-keys))

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/legal-compliance-rag.git
cd legal-compliance-rag
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## 🗄️ Database Setup

### Step 1: Create PostgreSQL Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE legal_compliance_rag;

# Connect to the database
\c legal_compliance_rag
```

### Step 2: Enable pgvector Extension

```sql
-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;
```

### Step 3: Create Database Schema

```sql
-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'policy', 'contract', 'regulation'
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    is_latest BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
);

-- Chunks table with vector embeddings
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), 
    section_name VARCHAR(255),
    page_number INTEGER,
    chunk_index INTEGER NOT NULL,
);
```


### Database Schema Diagram

```
┌──────────────────────┐
│     documents        │
├──────────────────────┤
│ id (PK)              │
│ name                 │
│ type                 │
│ version              │
│ is_latest            │
│ metadata (JSONB)     │
│ upload_date          │
└──────────┬───────────┘
           │
           │ 1:N
           │
┌──────────▼───────────┐
│      chunks          │
├──────────────────────┤
│ id (PK)              │
│ document_id (FK)     │
│ content              │
│ embedding (vector)   │
│ section_name         │
│ page_number          │
│ chunk_index          │
└──────────────────────┘
```

---

## ⚙️ Configuration

### Backend Configuration

Create a `.env` file in the `backend` directory:

```bash
cd backend
touch .env
```

Add the  environment variables

## 🏃 Running the Application

### Development Mode

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

The backend will start on `http://localhost:5000`

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:3000`


### Verify Setup

1. Open `http://localhost:3000` in your browser
2. Upload a test PDF or DOCX document
3. Ask a question about the uploaded document
4. Verify you receive a response with citations

---

## 📁 Project Structure

```
LEGAL-COMPLIANCE-RAG/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts         # PostgreSQL connection
│   │   │   └── openai.ts           # OpenAI & LangChain config
│   │   │
│   │   ├── controllers/
│   │   │   ├── documentController.ts   # Document CRUD operations
│   │   │   ├── queryController.ts      # Query handling
│   │   │   └── uploadController.ts     # File upload handling
│   │   │
│   │   ├── services/
│   │   │   ├── documentService.ts      # Document business logic
│   │   │   ├── queryService.ts         # RAG query processing
│   │   │   └── uploadService.ts        # Document ingestion
│   │   │
│   │   ├── utils/
│   │   │   ├── documentParser.ts       # PDF/DOCX parsing
│   │   │   ├── embedding.ts            # Embedding generation
│   │   │   ├── queryRewriter.ts        # Query expansion
│   │   │   └── reranker.ts             # Cohere reranking
│   │   │
│   │   ├── routes/
│   │   │   └── index.ts                # API routes
│   │   │
│   │   ├── types/
│   │   │   └── index.ts                # TypeScript interfaces
│   │   │
│   │   └── index.ts                    # Express app entry point
│   │
│   ├── uploads/                    # Temporary file storage
│   ├── .env                        # Environment variables
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── frontend/
│   ├── app/
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx       # Chat UI component
│   │   │   ├── DocumentList.tsx        # Document list component
│   │   │   └── FileUpload.tsx          # File upload component
│   │   │
│   │   ├── globals.css             # Global styles
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page
│   │
│   ├── public/                     # Static assets
│   ├── next.config.js
│   ├── package.json
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── .env.example                    # Example environment variables
├── .gitignore
├── package.json                    # Root package.json (optional)
└── README.md                       # This file
```

### Key Components Explained

#### Backend

**Controllers** (`src/controllers/`)
- Handle HTTP requests and responses
- Validate input data
- Delegate business logic to services

**Services** (`src/services/`)
- `queryService.ts`: Core RAG implementation
  - Hybrid search (vector + BM25)
  - Query rewriting
  - Reranking
  - Answer generation
- `uploadService.ts`: Document ingestion pipeline
- `documentService.ts`: Document management

**Utils** (`src/utils/`)
- `documentParser.ts`: Extracts text from PDFs and DOCX
- `embedding.ts`: Generates vector embeddings
- `queryRewriter.ts`: Expands queries for better retrieval
- `reranker.ts`: Cross-encoder reranking with Cohere

#### Frontend

**Components** (`app/components/`)
- `ChatInterface.tsx`: Main chat interface with message history
- `FileUpload.tsx`: Document upload form
- `DocumentList.tsx`: Display and manage uploaded documents

---

## 📡 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Endpoints

#### 1. Query Documents

**POST** `/api/query`

Process a natural language query against indexed documents.

**Request:**
```json
{
  "query": "What are the requirements for GDPR compliance?"
}
```

**Response:**
```json
{
  "answer": "According to the GDPR compliance policy, organizations must...",
  "citations": [
    {
      "document_name": "GDPR_Policy_v2.pdf",
      "section": "Article 5",
      "page": 3,
      "content": "Personal data shall be processed lawfully..."
    }
  ],
  "confidence": 85
}
```

#### 2. Upload Document

**POST** `/api/upload`

Upload and ingest a new legal/compliance document.

**Request (multipart/form-data):**
```
file: [PDF or DOCX file]
version: "2.0"
type: "policy" | "contract" | "regulation"
```

**Response:**
```json
{
  "message": "Document uploaded and ingested successfully",
  "documentId": "123e4567-e89b-12d3-a456-426614174000"
}
```

#### 3. List Documents

**GET** `/api/documents`

Retrieve all uploaded documents.

**Response:**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "GDPR_Policy_v2.pdf",
    "type": "policy",
    "version": "2.0",
    "upload_date": "2024-01-27T10:30:00Z",
    "is_latest": true
  }
]
```

#### 4. Delete Document

**DELETE** `/api/documents/:id`

Delete a specific document and its associated chunks.

**Response:**
```json
{
  "message": "Document deleted successfully"
}
```

---

## 💡 Usage Examples

### 1. Uploading Documents

```bash
# Using curl
curl -X POST http://localhost:5000/api/upload \
  -F "file=@/path/to/policy.pdf" \
  -F "version=2.0" \
  -F "type=policy"
```

### 2. Querying Documents

```bash
# Using curl
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is our data retention policy?"}'
```

### 3. Using the Web Interface

1. **Upload Documents:**
   - Click "Choose File" in the left sidebar
   - Select a PDF or DOCX file
   - Enter version and select document type
   - Click "Upload"

2. **Ask Questions:**
   - Type your question in the chat input
   - Press "Send"
   - View the AI response with citations

3. **Manage Documents:**
   - See all uploaded documents in the left sidebar
   - Click "Delete" to remove a document

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Error:** `Database connection error: password authentication failed`

**Solution:**
```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Check credentials in .env file
# Ensure DB_USER and DB_PASSWORD are correct
```

#### 2. pgvector Extension Not Found

**Error:** `extension "vector" does not exist`

**Solution:**
```bash
# Install pgvector extension
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# Then in PostgreSQL:
psql -U postgres -d legal_compliance_rag
CREATE EXTENSION vector;
```

#### 3. OpenAI API Rate Limit

**Error:** `Rate limit exceeded`

**Solution:**
- Check your OpenAI API quota and billing


#### 4. PDF Parsing Errors

**Error:** `Failed to parse PDF`

**Solution:**
```bash
# Install additional dependencies
npm install canvas
npm install pdf-parse

# For pdfjs-dist fallback
npm install pdfjs-dist
```

#### 5. CORS Errors

**Error:** `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solution:**
Add to `backend/src/index.ts`:
```typescript
import cors from 'cors';

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
```

---


## 🔒 Security Considerations

### Current Limitations

⚠️ **This implementation does NOT include:**
- User authentication
- Authorization/access controls
- API rate limiting
- Input sanitization
- HTTPS/SSL

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use TypeScript for type safety
- Follow ESLint configuration
- Write meaningful commit messages
- Add comments for complex logic

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [LangChain](https://js.langchain.com/) - LLM orchestration framework
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search
- [OpenAI](https://openai.com/) - GPT and embedding models
- [Cohere](https://cohere.com/) - Reranking API
- [Next.js](https://nextjs.org/) - React framework

---