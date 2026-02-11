import pool from './src/config/database';
import { hashPassword } from './src/utils/passwordUtils';

async function addDummyAdmin() {
  const client = await pool.connect();
  
  try {
    const email = 'admin@example.com';
    const password = 'Admin@123456';
    const name = 'Admin User';

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Insert admin user
    const result = await client.query(
      `INSERT INTO users (email, name, password_hash, role, auth_provider, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, name, role`,
      [email, name, passwordHash, 'admin', 'local', true]
    );

    console.log('✅ Dummy admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('User Details:', result.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

addDummyAdmin();
