import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { extractMediaKeys } from '../utils/mediaSync'

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
    const { subject_id, chapter_number, title, unit_name, unit_number, price_in_paise } = body

    if (!subject_id || chapter_number === undefined || !title) {
      return c.json({ success: false, message: 'subject_id, chapter_number, and title are required' }, 400)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO chapters
        (id, subject_id, chapter_number, title, unit_name, unit_number, price_in_paise, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      id, subject_id, chapter_number, title, unit_name || null, unit_number || null, price_in_paise || 0
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
    const { chapter_number, title, unit_name, unit_number, is_active, price_in_paise } = body

    await c.env.DB.prepare(`
      UPDATE chapters SET
        chapter_number = COALESCE(?, chapter_number),
        title = COALESCE(?, title),
        unit_name = ?,
        unit_number = COALESCE(?, unit_number),
        price_in_paise = COALESCE(?, price_in_paise),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      chapter_number ?? null, title ?? null, unit_name || null, unit_number ?? null, price_in_paise ?? null, is_active ?? null, id
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
    
    // Deep Cascading Wipe: Cleanup all resources media before deleting chapter
    const resources = await c.env.DB.prepare('SELECT rich_text_content, thumbnail_url, r2_object_key FROM subject_resources WHERE chapter_id = ?').bind(id).all();
    if (resources && resources.results.length > 0 && c.env.BUCKET) {
      const keysToDelete: string[] = [];
      for (const res of resources.results) {
        if (res.rich_text_content) keysToDelete.push(...extractMediaKeys(res.rich_text_content as string));
        if (res.thumbnail_url) {
          let k = res.thumbnail_url as string;
          if (k.startsWith('http')) { try { k = new URL(k).pathname.replace(/^\//, ''); } catch(e){} }
          keysToDelete.push(k);
        }
        if (res.r2_object_key) {
          let k = res.r2_object_key as string;
          if (k.startsWith('http')) { try { k = new URL(k).pathname.replace(/^\//, ''); } catch(e){} }
          keysToDelete.push(k);
        }
      }
      
      const validKeys = [...new Set(keysToDelete)].filter(k => k && k.trim() !== '');
      if (validKeys.length > 0) {
        const bucket = c.env.BUCKET;
        c.executionCtx.waitUntil(
          Promise.all(validKeys.map(key => bucket.delete(key).catch(e => console.error(`[MediaSync] Failed chapter wipe:`, e))))
        );
      }
    }

    await c.env.DB.prepare('DELETE FROM chapters WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Chapter deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
