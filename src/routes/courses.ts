import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// GET /api/courses?university_id=X
router.get('/', async (c) => {
  try {
    const university_id = c.req.query('university_id')

    if (university_id) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM courses WHERE university_id = ? ORDER BY name ASC'
      ).bind(university_id).all()
      return c.json({ success: true, data: results })
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM courses ORDER BY name ASC').all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// GET /api/courses/:id
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await c.env.DB.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first()
    if (!result) return c.json({ success: false, message: 'Course not found' }, 404)
    return c.json({ success: true, data: result })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/courses
router.post('/', async (c) => {
  try {
    const { name, slug, university_id, duration_years, total_semesters } = await c.req.json()
    if (!name || !slug || !university_id || !total_semesters) {
      return c.json({ success: false, message: 'Name, slug, university_id, and total_semesters are required' }, 400)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO courses (id, university_id, name, slug, duration_years, total_semesters, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).bind(id, university_id, name, slug, duration_years || null, total_semesters).run()

    return c.json({ success: true, message: 'Course created', data: { id, name, slug, university_id } })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'A course with this slug already exists in this university' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/courses/:id
router.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { name, slug, duration_years, total_semesters, is_active } = await c.req.json()
    if (!name || !slug) return c.json({ success: false, message: 'Name and slug are required' }, 400)

    await c.env.DB.prepare(
      'UPDATE courses SET name = ?, slug = ?, duration_years = ?, total_semesters = ?, is_active = ? WHERE id = ?'
    ).bind(name, slug, duration_years || null, total_semesters, is_active ?? 1, id).run()

    return c.json({ success: true, message: 'Course updated' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// DELETE /api/courses/:id (CASCADE deletes subjects & resources)
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('PRAGMA foreign_keys = ON').run()
    await c.env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Course and all related data deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
