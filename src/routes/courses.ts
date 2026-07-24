import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const handleZodError = (result: any, c: any) => {
  if (!result.success) {
    const errorMsg = result.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ')
    return c.json({ success: false, message: errorMsg || 'Invalid input' }, 400)
  }
}

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const courseSchema = z.object({
  name: z.string().max(150),
  slug: z.string().max(150).regex(/^[a-z0-9-]+$/, "Invalid slug format. Use only lowercase letters, numbers, and hyphens."),
  acronym: z.string().max(20).optional().nullable().or(z.literal("")),
  university_id: z.string().uuid().optional(),
  duration_years: z.number().optional().nullable(),
  total_semesters: z.number(),
  search_aliases: z.string().max(150).optional().or(z.literal("")),
  is_active: z.number().optional(),
})

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
router.post('/', zValidator('json', courseSchema, handleZodError), async (c) => {
  try {
    const { name, slug, acronym, university_id, duration_years, total_semesters, search_aliases } = c.req.valid('json')

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO courses (id, university_id, name, slug, acronym, duration_years, total_semesters, search_aliases, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(id, university_id, name, slug, acronym || null, duration_years || null, total_semesters, search_aliases || '').run()

    return c.json({ success: true, message: 'Course created', data: { id, name, slug, university_id } })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'A course with this slug already exists in this university' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/courses/:id
router.patch('/:id', zValidator('json', courseSchema, handleZodError), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, slug, acronym, duration_years, total_semesters, search_aliases, is_active } = c.req.valid('json')

    await c.env.DB.prepare(
      'UPDATE courses SET name = ?, slug = ?, acronym = ?, duration_years = ?, total_semesters = ?, search_aliases = ?, is_active = ? WHERE id = ?'
    ).bind(name, slug, acronym || null, duration_years || null, total_semesters, search_aliases || '', is_active ?? 1, id).run()

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
