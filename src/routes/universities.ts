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

const universitySchema = z.object({
  name: z.string().max(150),
  slug: z.string().max(150).regex(/^[a-z0-9-]+$/, "Invalid slug format. Use only lowercase letters, numbers, and hyphens."),
  website_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  logo_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  search_aliases: z.string().max(150).nullable().optional().or(z.literal("")),
  is_active: z.number().optional(),
})

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
router.post('/', zValidator('json', universitySchema, handleZodError), async (c) => {
  try {
    const { name, slug, website_url, logo_url, search_aliases } = c.req.valid('json')

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO universities (id, name, slug, website_url, logo_url, search_aliases, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).bind(id, name, slug, website_url || null, logo_url || null, search_aliases || '').run()

    return c.json({ success: true, message: 'University created', data: { id, name, slug } })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'A university with this slug already exists' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/universities/:id
router.patch('/:id', zValidator('json', universitySchema, handleZodError), async (c) => {
  try {
    const id = c.req.param('id')
    const { name, slug, website_url, logo_url, search_aliases, is_active } = c.req.valid('json')

    await c.env.DB.prepare(
      'UPDATE universities SET name = ?, slug = ?, website_url = ?, logo_url = ?, search_aliases = ?, is_active = ? WHERE id = ?'
    ).bind(name, slug, website_url || null, logo_url || null, search_aliases || '', is_active ?? 1, id).run()

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
