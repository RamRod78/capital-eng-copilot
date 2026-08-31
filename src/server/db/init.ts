import { pool } from './index.js';

export async function initDatabase(retries = 5, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔌 Checking database connection and schema (attempt ${attempt}/${retries})...`);
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE EXTENSION IF NOT EXISTS vector;
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

          CREATE TABLE IF NOT EXISTS documents (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              filename VARCHAR(255) NOT NULL,
              document_type VARCHAR(50) NOT NULL DEFAULT 'Standard',
              owner_sme VARCHAR(100) DEFAULT 'Engineering Lead',
              version VARCHAR(50) DEFAULT '1.0',
              raw_content TEXT NOT NULL,
              metadata JSONB DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS extractions (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
              batch_id VARCHAR(100) NOT NULL,
              section_title VARCHAR(255),
              requirement_code VARCHAR(100),
              requirement_text TEXT NOT NULL,
              item_type VARCHAR(50) DEFAULT 'Requirement',
              category VARCHAR(100),
              engineering_discipline VARCHAR(100) NOT NULL DEFAULT 'General',
              compliance_level VARCHAR(50) DEFAULT 'Mandatory',
              estimated_cost_impact VARCHAR(50),
              document_owner VARCHAR(100),
              confidence_score FLOAT DEFAULT 1.0,
              confidence_reasoning TEXT,
              status VARCHAR(50) DEFAULT 'Pending Review',
              sme_reviewer VARCHAR(100),
              sme_comments TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              reviewed_at TIMESTAMP WITH TIME ZONE
          );

          CREATE TABLE IF NOT EXISTS requirement_embeddings (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              extraction_id UUID REFERENCES extractions(id) ON DELETE CASCADE,
              chunk_text TEXT NOT NULL,
              embedding vector(768),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS project_scopes (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              project_name VARCHAR(255) NOT NULL,
              project_code VARCHAR(100),
              facility_type VARCHAR(100) NOT NULL,
              operating_conditions TEXT,
              scope_description TEXT NOT NULL,
              disciplines JSONB DEFAULT '[]'::jsonb,
              status VARCHAR(50) DEFAULT 'Draft',
              created_by VARCHAR(100) DEFAULT 'Engineering Lead',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS scoping_items (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              project_scope_id UUID REFERENCES project_scopes(id) ON DELETE CASCADE,
              extraction_id UUID REFERENCES extractions(id) ON DELETE SET NULL,
              requirement_code VARCHAR(100),
              requirement_text TEXT NOT NULL,
              item_type VARCHAR(50) DEFAULT 'Requirement',
              engineering_discipline VARCHAR(100) NOT NULL DEFAULT 'General',
              compliance_level VARCHAR(50) DEFAULT 'Mandatory',
              relevance_score FLOAT DEFAULT 1.0,
              is_selected BOOLEAN DEFAULT TRUE,
              custom_notes TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS feedback_lessons (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              extraction_id UUID REFERENCES extractions(id) ON DELETE SET NULL,
              project_scope_id UUID REFERENCES project_scopes(id) ON DELETE SET NULL,
              original_text TEXT NOT NULL,
              reviewed_text TEXT,
              original_status VARCHAR(50),
              final_status VARCHAR(50) NOT NULL,
              reviewer VARCHAR(100) NOT NULL,
              reason TEXT NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS document_revision_flags (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
              document_title VARCHAR(255) NOT NULL,
              document_owner VARCHAR(100) NOT NULL,
              flagged_by VARCHAR(100) NOT NULL,
              issue_description TEXT NOT NULL,
              suggested_action VARCHAR(255) DEFAULT 'Review and Update Standard',
              is_resolved BOOLEAN DEFAULT FALSE,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              resolved_at TIMESTAMP WITH TIME ZONE
          );

          CREATE INDEX IF NOT EXISTS idx_requirement_embeddings_hnsw 
          ON requirement_embeddings 
          USING hnsw (embedding vector_cosine_ops);

          CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON extractions(document_id);
          CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status);
          CREATE INDEX IF NOT EXISTS idx_extractions_batch_id ON extractions(batch_id);
          CREATE INDEX IF NOT EXISTS idx_extractions_owner ON extractions(document_owner);
          CREATE INDEX IF NOT EXISTS idx_extractions_confidence ON extractions(confidence_score);
          CREATE INDEX IF NOT EXISTS idx_scoping_items_scope_id ON scoping_items(project_scope_id);
          CREATE INDEX IF NOT EXISTS idx_doc_flags_resolved ON document_revision_flags(is_resolved);
        `);
        console.log('✅ PostgreSQL database schema verified and initialized.');
        return;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn(`⚠️ Database init attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        console.error('❌ Could not connect/initialize database. The application will continue running and retry on incoming requests.');
      }
    }
  }
}
