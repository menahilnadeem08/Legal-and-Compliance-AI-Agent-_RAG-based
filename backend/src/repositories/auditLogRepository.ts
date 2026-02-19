import pool from '../config/database';
import { AuditLog } from '../types';

/**
 * Repository layer for audit log operations
 */
export class AuditLogRepository {
  /**
   * Create audit log entry
   */
  static async createLog(
    adminId: number,
    action: string,
    actorId?: number,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuditLog> {
    const result = await pool.query(
      `INSERT INTO audit_logs (admin_id, actor_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        adminId,
        actorId || null,
        action,
        resourceType || null,
        resourceId || null,
        metadata ? JSON.stringify(metadata) : '{}',
        ipAddress || null,
        userAgent || null
      ]
    );
    return result.rows[0];
  }

  /**
   * Get audit logs for tenant
   */
  static async findByAdminId(
    adminId: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLog[]> {
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE admin_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [adminId, limit, offset]
    );
    return result.rows;
  }

  /**
   * Get audit logs for specific action
   */
  static async findByAction(
    adminId: number,
    action: string,
    limit: number = 100
  ): Promise<AuditLog[]> {
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE admin_id = $1 AND action = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [adminId, action, limit]
    );
    return result.rows;
  }

  /**
   * Get audit logs for specific resource
   */
  static async findByResource(
    adminId: number,
    resourceType: string,
    resourceId: string
  ): Promise<AuditLog[]> {
    const result = await pool.query(
      `SELECT * FROM audit_logs
       WHERE admin_id = $1 AND resource_type = $2 AND resource_id = $3
       ORDER BY created_at DESC`,
      [adminId, resourceType, resourceId]
    );
    return result.rows;
  }
}
