import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// GET /api/chapters?subject_id=X
router.get('/', async (c) => {
  try {
    const subject_id = c.req.query('subject_id')
    
    if (subject_id) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM chapters WHERE subject_id = ? ORDER BY chapter_number ASC'
      ).bind(subject_id).all()
      return c.json({ success: true, data: results })
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM chapters ORDER BY created_at DESC LIMIT 100'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/chapters
router.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { subject_id, chapter_number, title, unit_name } = body

    if (!subject_id || chapter_number === undefined || !title) {
      return c.json({ success: false, message: 'subject_id, chapter_number, and title are required' }, 400)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO chapters 
        (id, subject_id, chapter_number, title, unit_name, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(
      id, subject_id, chapter_number, title, unit_name || null
    ).run()

    return c.json({ success: true, message: 'Chapter created', data: { id } })
  } catch (error: any) {
    if (error.message && error.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
      return c.json({ success: false, message: 'A chapter with this number already exists in this subject.' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/chapters/:id
router.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { chapter_number, title, unit_name, is_active } = body

    await c.env.DB.prepare(`
      UPDATE chapters SET
        chapter_number = COALESCE(?, chapter_number),
        title = COALESCE(?, title),
        unit_name = ?,
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      chapter_number ?? null, title ?? null, unit_name || null, is_active ?? null, id
    ).run()

    return c.json({ success: true, message: 'Chapter updated' })
  } catch (error: any) {
    if (error.message && error.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
      return c.json({ success: false, message: 'A chapter with this number already exists in this subject.' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// DELETE /api/chapters/:id
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM chapters WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Chapter deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
