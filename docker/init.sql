-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL DEFAULT 'RFP',
    raw_content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: extractions (SME items extracted from documents)
CREATE TABLE IF NOT EXISTS extractions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    batch_id VARCHAR(100) NOT NULL,
    section_title VARCHAR(255),
    requirement_code VARCHAR(100),
    requirement_text TEXT NOT NULL,
    category VARCHAR(100),
    engineering_discipline VARCHAR(100),
    compliance_level VARCHAR(50) DEFAULT 'Mandatory',
    estimated_cost_impact VARCHAR(50),
    confidence_score FLOAT,
    status VARCHAR(50) DEFAULT 'Pending Review', -- 'Pending Review', 'Approved', 'Rejected', 'Edited'
    sme_reviewer VARCHAR(100),
    sme_comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Table: requirement_embeddings (pgvector vectors for RAG & matching)
CREATE TABLE IF NOT EXISTS requirement_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for HNSW approximate nearest neighbor search (Cosine distance)
CREATE INDEX IF NOT EXISTS idx_requirement_embeddings_hnsw 
ON requirement_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Index for fast status and document queries
CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status);
CREATE INDEX IF NOT EXISTS idx_extractions_batch_id ON extractions(batch_id);
