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
        type VARCHAR(50),
        version VARCHAR(20),
        filename VARCHAR(255),
        filepath VARCHAR(512),
        content TEXT,
        metadata JSONB,
        is_latest BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add is_active column if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
    `);

    // Add missing columns (migration)
    await client.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS version VARCHAR(20),
      ADD COLUMN IF NOT EXISTS metadata JSONB,
      ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true
    `);

    // Drop old unique constraint if it exists (migration for multi-admin support)
    await client.query(`
      ALTER TABLE documents
      DROP CONSTRAINT IF EXISTS documents_name_version_key
    `);

    // Add new unique constraint with admin_id
    await client.query(`
      ALTER TABLE documents
      ADD CONSTRAINT documents_admin_id_name_version_key UNIQUE (admin_id, name, version)
    `).catch(() => {
      // Constraint might already exist, ignore error
    });

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

    // Verify foreign key relationship exists
    await client.query(`
      ALTER TABLE messages
      DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey
    `).catch(() => {});

    await client.query(`
      ALTER TABLE messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    `).catch(() => {
      // Constraint might already exist
    });

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_documents_admin_id ON documents(admin_id);
      CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(conversation_id, sequence_number);
    `);

    // Create user_invitations table for multi-tenant employee invitations
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_invitations (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'employee',
        invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'PENDING',
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        activated_at TIMESTAMP,
        is_used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_tenant_email UNIQUE (admin_id, email)
      )
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
      ADD COLUMN IF NOT EXISTS tenant_id INTEGER,
      ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false
    `);

    // Create indexes for new tables
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_invitations_admin_id ON user_invitations(admin_id);
      CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
      CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);
      CREATE INDEX IF NOT EXISTS idx_user_invitations_token_hash ON user_invitations(token_hash);
      CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at ON user_invitations(expires_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `);

    // Add is_used column migration if it doesn't exist
    await client.query(`
      ALTER TABLE user_invitations
      ADD COLUMN IF NOT EXISTS is_used BOOLEAN DEFAULT false
    `);

    console.log('Auth tables initialized successfully');
  } catch (error) {
    console.error('Error initializing auth tables:', error);
    throw error;
  } finally {
    client.release();
  }
}
