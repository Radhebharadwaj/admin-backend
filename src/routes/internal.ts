import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Strict Internal Middleware for Service-to-Service communication
router.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Missing Authorization header' }, 401)
  }

  const token = authHeader.substring(7)
  
  // INTERNAL_API_SECRET must be configured in wrangler.jsonc or .env
  if (token !== c.env.INTERNAL_API_SECRET) {
    return c.json({ success: false, message: 'Invalid Internal Token' }, 403)
  }

  await next()
})

const syncSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
  google_id: z.string()
})

// POST /api/internal/students/sync
router.post('/students/sync', zValidator('json', syncSchema), async (c) => {
  try {
    const { email, name, avatar_url, google_id } = c.req.valid('json')
    const db = c.env.DB
    const now = new Date().toISOString()

    // Generate a unique ID (matches UUID v4 format)
    const newId = crypto.randomUUID()

    // UPSERT logic: If email exists, update last_login_at, avatar_url, and name. If not, insert.
    const query = `
      INSERT INTO students (id, email, name, avatar_url, google_id, last_login_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        google_id = excluded.google_id,
        last_login_at = excluded.last_login_at
      RETURNING id;
    `

    const result = await db.prepare(query)
      .bind(newId, email, name || null, avatar_url || null, google_id, now, now)
      .first()

    if (!result || !result.id) {
      throw new Error("Failed to return id from upsert")
    }

    return c.json({ 
      success: true, 
      data: {
        id: result.id
      }
    })

  } catch (error: any) {
    return c.json({ success: false, message: 'Sync failed', debug: error.message }, 500)
  }
})

export default router
