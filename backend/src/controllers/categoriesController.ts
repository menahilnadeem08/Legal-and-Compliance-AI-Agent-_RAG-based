import { Response } from 'express';
import pool from '../config/database';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAdminIdForUser } from '../utils/adminIdUtils';
import { AuthenticatedRequest } from '../types';

/**
 * GET /categories
 * Returns the full category list visible to the current admin:
 * - Default categories not in admin_hidden_defaults for this admin
 * - Plus all custom_categories for this admin
 * Each item has: id, name, type ('default' | 'custom')
 */
export const getCategories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  const defaults = await pool.query(
    `SELECT d.id, d.name, 'default' as type
     FROM default_categories d
     WHERE d.id NOT IN (
       SELECT default_category_id FROM admin_hidden_defaults WHERE admin_id = $1
     )
     ORDER BY d.name`,
    [adminId]
  );
  const custom = await pool.query(
    `SELECT id, name, 'custom' as type
     FROM custom_categories
     WHERE admin_id = $1
     ORDER BY name`,
    [adminId]
  );

  const combined = [
    ...defaults.rows.map((r: any) => ({ id: r.id, name: r.name, type: 'default' as const })),
    ...custom.rows.map((r: any) => ({ id: r.id, name: r.name, type: 'custom' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return res.json(combined);
});

/**
 * GET /categories/hidden-defaults
 * Returns default categories that the current admin has hidden (for "Unhide" UI).
 */
export const getHiddenDefaultCategories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Only admins can view hidden categories', 403);
  }
  const adminId = req.user.id;
  const result = await pool.query(
    `SELECT d.id, d.name
     FROM default_categories d
     INNER JOIN admin_hidden_defaults h ON h.default_category_id = d.id
     WHERE h.admin_id = $1
     ORDER BY d.name`,
    [adminId]
  );
  return res.json(result.rows);
});

/**
 * POST /custom-categories
 * Create a new custom category for the current admin.
 * Body: { name }
 */
export const createCustomCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Only admins can create custom categories', 403);
  }
  const adminId = req.user.id;
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Category name is required', 400);
  }
  const trimmed = name.trim();
  const existing = await pool.query(
    'SELECT id FROM custom_categories WHERE admin_id = $1 AND LOWER(name) = LOWER($2)',
    [adminId, trimmed]
  );
  if (existing.rows.length > 0) {
    throw new AppError('A custom category with this name already exists', 400);
  }
  const insert = await pool.query(
    `INSERT INTO custom_categories (admin_id, name) VALUES ($1, $2)
     RETURNING id, admin_id, name, created_at, updated_at`,
    [adminId, trimmed]
  );
  return res.status(201).json(insert.rows[0]);
});

/**
 * PATCH /custom-categories/:id
 * Rename a custom category. Only if it belongs to the current admin.
 */
export const updateCustomCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Only admins can update custom categories', 403);
  }
  const adminId = req.user.id;
  const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(paramId ?? '', 10);
  if (Number.isNaN(id)) {
    throw new AppError('Invalid category id', 400);
  }
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Category name is required', 400);
  }
  const trimmed = name.trim();
  const check = await pool.query(
    'SELECT id FROM custom_categories WHERE id = $1 AND admin_id = $2',
    [id, adminId]
  );
  if (check.rows.length === 0) {
    throw new AppError('Custom category not found or access denied', 403);
  }
  const existingName = await pool.query(
    'SELECT id FROM custom_categories WHERE admin_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
    [adminId, trimmed, id]
  );
  if (existingName.rows.length > 0) {
    throw new AppError('A custom category with this name already exists', 400);
  }
  const update = await pool.query(
    `UPDATE custom_categories SET name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND admin_id = $3
     RETURNING id, admin_id, name, created_at, updated_at`,
    [trimmed, id, adminId]
  );
  return res.json(update.rows[0]);
});

/**
 * DELETE /custom-categories/:id
 * Delete a custom category. Only if it belongs to the current admin.
 * Block if any documents use this category name.
 */
export const deleteCustomCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Only admins can delete custom categories', 403);
  }
  const adminId = req.user.id;
  const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(paramId ?? '', 10);
  if (Number.isNaN(id)) {
    throw new AppError('Invalid category id', 400);
  }
  const cat = await pool.query(
    'SELECT id, name FROM custom_categories WHERE id = $1 AND admin_id = $2',
    [id, adminId]
  );
  if (cat.rows.length === 0) {
    throw new AppError('Custom category not found or access denied', 403);
  }
  const categoryName = cat.rows[0].name;
  const docsUsing = await pool.query(
    'SELECT COUNT(*) as cnt FROM documents WHERE admin_id = $1 AND category = $2',
    [adminId, categoryName]
  );
  const count = parseInt(docsUsing.rows[0].cnt, 10);
  if (count > 0) {
    throw new AppError(
      `Cannot delete this category because ${count} document(s) use it. Reassign or remove those documents first.`,
      400
    );
  }
  await pool.query('DELETE FROM custom_categories WHERE id = $1 AND admin_id = $2', [id, adminId]);
  return res.status(204).send();
});

/**
 * POST /categories/hide-default/:defaultCategoryId
 * Hide a default category for the current admin.
 */
export const hideDefaultCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Only admins can hide default categories', 403);
  }
  const adminId = req.user.id;
  const paramId = Array.isArray(req.params.defaultCategoryId) ? req.params.defaultCategoryId[0] : req.params.defaultCategoryId;
  const defaultCategoryId = parseInt(paramId ?? '', 10);
  if (Number.isNaN(defaultCategoryId)) {
    throw new AppError('Invalid default category id', 400);
  }
  const exists = await pool.query('SELECT id FROM default_categories WHERE id = $1', [defaultCategoryId]);
  if (exists.rows.length === 0) {
    throw new AppError('Default category not found', 404);
  }
  await pool.query(
    `INSERT INTO admin_hidden_defaults (admin_id, default_category_id)
     VALUES ($1, $2)
     ON CONFLICT (admin_id, default_category_id) DO NOTHING`,
    [adminId, defaultCategoryId]
  );
  return res.status(204).send();
});

/**
 * DELETE /categories/hide-default/:defaultCategoryId
 * Unhide/restore a default category for the current admin.
 */
export const unhideDefaultCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Only admins can unhide default categories', 403);
  }
  const adminId = req.user.id;
  const paramId = Array.isArray(req.params.defaultCategoryId) ? req.params.defaultCategoryId[0] : req.params.defaultCategoryId;
  const defaultCategoryId = parseInt(paramId ?? '', 10);
  if (Number.isNaN(defaultCategoryId)) {
    throw new AppError('Invalid default category id', 400);
  }
  await pool.query(
    'DELETE FROM admin_hidden_defaults WHERE admin_id = $1 AND default_category_id = $2',
    [adminId, defaultCategoryId]
  );
  return res.status(204).send();
});
