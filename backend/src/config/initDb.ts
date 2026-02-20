import pool from './database';

export async function initializeAuthTables() {
  const client = await pool.connect();
  
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        picture VARCHAR(255),
        username VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'employee',
        auth_provider VARCHAR(50) DEFAULT 'local',
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        is_temp_password BOOLEAN DEFAULT true,
        temp_password_expires_at TIMESTAMP,
        force_password_change BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add temp password columns if they don't exist (migration)
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_temp_password BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false
    `);

    // Create sessions table for JWT/session tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create documents table with admin_id for multi-tenant support
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(36) PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        version INTEGER DEFAULT 1,
        filename VARCHAR(255),
        filepath VARCHAR(512),
        content TEXT,
        metadata JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add category column if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS category VARCHAR(100)
    `);

    // Add version column if it doesn't exist and ensure it's numeric (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1
    `);

    // Add is_active column if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
    `);

    // Add upload_date column if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    // Drop type column if it exists (migration from old schema)
    await client.query(`
      ALTER TABLE documents
      DROP COLUMN IF EXISTS type
    `);

    // Add filename and filepath columns if they don't exist (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS filename VARCHAR(255),
      ADD COLUMN IF NOT EXISTS filepath VARCHAR(512)
    `);

    // Create conversations table for chat history
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create messages table for storing individual messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure foreign key relationship exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'messages_conversation_id_fkey'
        ) THEN
          ALTER TABLE messages
            ADD CONSTRAINT messages_conversation_id_fkey
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_documents_admin_id ON documents(admin_id);
      CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(conversation_id, sequence_number);
    `);

    // Create audit_logs table for comprehensive audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns to users table if they don't exist (migration)
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS otp_code VARCHAR(255),
      ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMP
    `);

    // Create indexes for audit_logs
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `);

    // ===== Category system: default_categories, admin_hidden_defaults, custom_categories =====
    await client.query(`
      CREATE TABLE IF NOT EXISTS default_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_hidden_defaults (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        default_category_id INTEGER NOT NULL REFERENCES default_categories(id) ON DELETE CASCADE,
        UNIQUE(admin_id, default_category_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_categories (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_hidden_defaults_admin_id ON admin_hidden_defaults(admin_id);
      CREATE INDEX IF NOT EXISTS idx_custom_categories_admin_id ON custom_categories(admin_id);
    `);

    // Seed default_categories (idempotent: insert only if not exists)
    const defaultCategoryNames = [
      'Constitution of Pakistan',
      'Federal Legislation / Acts',
      'Provincial Legislation / Acts',
      'Presidential & Governor Ordinances',
      'Statutory Rules & SROs',
      'Supreme Court Judgments',
      'High Court Judgments',
      'Federal Shariat Court Judgments',
      'District & Sessions Court Orders',
      'AJK & GB Court Judgments',
    ];
    for (const name of defaultCategoryNames) {
      await client.query(
        `INSERT INTO default_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name]
      );
    }

    console.log('Auth tables initialized successfully');
  } catch (error) {
    console.error('Error initializing auth tables:', error);
    throw error;
  } finally {
    client.release();
  }
}
