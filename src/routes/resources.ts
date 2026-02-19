import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { checkResourceAccess } from '../utils/access'

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

    const hasAccess = await checkResourceAccess(c, id, result.price_in_inr as number)
    
    if (!hasAccess) {
      result.external_url = null
      result.r2_object_key = null
      result.rich_text_content = null
      result.is_purchased = false
    } else {
      result.is_purchased = true
    }

    return c.json({ success: true, data: result })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/resources
router.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { subject_id, chapter_id, category, title, external_url, thumbnail_url, description, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, content_type, r2_object_key, rich_text_content } = body

    if (!subject_id || !category || !title) {
      return c.json({ success: false, message: 'subject_id, category, and title are required' }, 400)
    }

    const validCategories = ['ASSIGNMENT', 'PROJECT', 'PYQ', 'SHORTNOTES', 'SOLUTION', 'VIDEO_LECTURE', 'EBOOK_MODULE']
    if (!validCategories.includes(category)) {
      return c.json({ success: false, message: `Category must be one of: ${validCategories.join(', ')}` }, 400)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO subject_resources 
        (id, subject_id, chapter_id, category, title, external_url, thumbnail_url, description, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, content_type, r2_object_key, rich_text_content, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      id, subject_id, chapter_id || null, category, title, external_url || null, thumbnail_url || null, description || null,
      is_public ? 1 : 0, price_in_inr || 0,
      free_after_date || null, valid_from || null,
      submission_deadline || null, academic_year || null,
      content_type || 'external_url', r2_object_key || null, rich_text_content || null
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
    const { chapter_id, category, title, external_url, thumbnail_url, description, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active, content_type, r2_object_key, rich_text_content } = body

    const validCategories = ['ASSIGNMENT', 'PROJECT', 'PYQ', 'SHORTNOTES', 'SOLUTION', 'VIDEO_LECTURE', 'EBOOK_MODULE']
    if (category && !validCategories.includes(category)) {
      return c.json({ success: false, message: `Category must be one of: ${validCategories.join(', ')}` }, 400)
    }

    // Garbage Collection: Delete old thumbnail from R2 if a new one is provided
    if (thumbnail_url) {
      const oldResource = await c.env.DB.prepare('SELECT thumbnail_url FROM subject_resources WHERE id = ?').bind(id).first();
      if (oldResource && oldResource.thumbnail_url && oldResource.thumbnail_url !== thumbnail_url) {
        let oldKey = oldResource.thumbnail_url as string;
        try {
          if (oldKey.startsWith('http')) {
            const urlObj = new URL(oldKey);
            oldKey = urlObj.pathname.replace(/^\//, ''); // Strip base URL and leading slash
          } else {
            oldKey = oldKey.replace(/^\//, ''); // Strip leading slash just in case
          }
          
          if (oldKey) {
            await c.env.BUCKET.delete(oldKey);
          }
        } catch (e) {
          console.error('Failed to parse or delete old thumbnail from R2:', e);
        }
      }
    }

    await c.env.DB.prepare(`
      UPDATE subject_resources SET
        chapter_id = COALESCE(?, chapter_id), category = COALESCE(?, category), title = COALESCE(?, title),
        external_url = COALESCE(?, external_url), thumbnail_url = COALESCE(?, thumbnail_url), description = COALESCE(?, description),
        is_public = COALESCE(?, is_public), price_in_inr = COALESCE(?, price_in_inr),
        free_after_date = COALESCE(?, free_after_date), valid_from = COALESCE(?, valid_from), submission_deadline = COALESCE(?, submission_deadline), academic_year = COALESCE(?, academic_year),
        content_type = COALESCE(?, content_type), r2_object_key = COALESCE(?, r2_object_key), rich_text_content = COALESCE(?, rich_text_content),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      chapter_id ?? null, category ?? null, title ?? null,
      external_url ?? null, thumbnail_url ?? null, description ?? null,
      is_public !== undefined ? (is_public ? 1 : 0) : null, price_in_inr ?? null,
      free_after_date ?? null, valid_from ?? null,
      submission_deadline ?? null, academic_year ?? null,
      content_type ?? null, r2_object_key ?? null, rich_text_content ?? null,
      is_active ?? null, id
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
