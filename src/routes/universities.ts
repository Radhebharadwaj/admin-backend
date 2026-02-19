import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// GET /api/universities
router.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM universities ORDER BY name ASC'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// GET /api/universities/:id
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await c.env.DB.prepare('SELECT * FROM universities WHERE id = ?').bind(id).first()
    if (!result) return c.json({ success: false, message: 'University not found' }, 404)
    return c.json({ success: true, data: result })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/universities
router.post('/', async (c) => {
  try {
    const { name, slug, website_url, logo_url } = await c.req.json()
    if (!name || !slug) return c.json({ success: false, message: 'Name and slug are required' }, 400)

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO universities (id, name, slug, website_url, logo_url, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(id, name, slug, website_url || null, logo_url || null).run()

    return c.json({ success: true, message: 'University created', data: { id, name, slug } })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'A university with this slug already exists' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/universities/:id
router.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { name, slug, website_url, logo_url, is_active } = await c.req.json()
    if (!name || !slug) return c.json({ success: false, message: 'Name and slug are required' }, 400)

    await c.env.DB.prepare(
      'UPDATE universities SET name = ?, slug = ?, website_url = ?, logo_url = ?, is_active = ? WHERE id = ?'
    ).bind(name, slug, website_url || null, logo_url || null, is_active ?? 1, id).run()

    return c.json({ success: true, message: 'University updated' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// DELETE /api/universities/:id (CASCADE deletes courses & subjects & resources)
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('PRAGMA foreign_keys = ON').run()
    await c.env.DB.prepare('DELETE FROM universities WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'University and all related data deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
