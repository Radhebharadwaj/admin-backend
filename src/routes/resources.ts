import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// GET /api/resources?subject_id=X&category=Y
router.get('/', async (c) => {
  try {
    const subject_id = c.req.query('subject_id')
    const category = c.req.query('category')

    if (subject_id && category) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM subject_resources WHERE subject_id = ? AND category = ? ORDER BY created_at DESC'
      ).bind(subject_id, category).all()
      return c.json({ success: true, data: results })
    }

    if (subject_id) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM subject_resources WHERE subject_id = ? ORDER BY category ASC, created_at DESC'
      ).bind(subject_id).all()
      return c.json({ success: true, data: results })
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM subject_resources ORDER BY created_at DESC LIMIT 100'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// GET /api/resources/:id
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await c.env.DB.prepare('SELECT * FROM subject_resources WHERE id = ?').bind(id).first()
    if (!result) return c.json({ success: false, message: 'Resource not found' }, 404)
    return c.json({ success: true, data: result })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/resources
router.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { subject_id, category, title, r2_object_key, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year } = body

    if (!subject_id || !category || !title || !r2_object_key) {
      return c.json({ success: false, message: 'subject_id, category, title, and r2_object_key are required' }, 400)
    }

    const validCategories = ['ASSIGNMENT', 'PROJECT', 'PYQ', 'SHORTNOTES', 'SOLUTION']
    if (!validCategories.includes(category)) {
      return c.json({ success: false, message: `Category must be one of: ${validCategories.join(', ')}` }, 400)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO subject_resources 
        (id, subject_id, category, title, r2_object_key, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      id, subject_id, category, title, r2_object_key,
      is_public ? 1 : 0, price_in_inr || 0,
      free_after_date || null, valid_from || null,
      submission_deadline || null, academic_year || null
    ).run()

    return c.json({ success: true, message: 'Resource created', data: { id } })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/resources/:id
router.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { category, title, r2_object_key, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active } = body

    await c.env.DB.prepare(`
      UPDATE subject_resources SET
        category = ?, title = ?, r2_object_key = ?, is_public = ?, price_in_inr = ?,
        free_after_date = ?, valid_from = ?, submission_deadline = ?, academic_year = ?, is_active = ?
      WHERE id = ?
    `).bind(
      category, title, r2_object_key,
      is_public ? 1 : 0, price_in_inr || 0,
      free_after_date || null, valid_from || null,
      submission_deadline || null, academic_year || null,
      is_active ?? 1, id
    ).run()

    return c.json({ success: true, message: 'Resource updated' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// DELETE /api/resources/:id
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM subject_resources WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Resource deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
