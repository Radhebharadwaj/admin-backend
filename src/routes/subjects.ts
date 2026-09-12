import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { extractMediaKeys } from '../utils/mediaSync'

const handleZodError = (result: any, c: any) => {
  if (!result.success) {
    const errorMsg = result.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ')
    return c.json({ success: false, message: errorMsg || 'Invalid input' }, 400)
  }
}

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const subjectSchema = z.object({
  subject_code: z.string().max(150).regex(/^[a-zA-Z0-9-]+$/, "Invalid subject code format. Use only letters, numbers, and hyphens."),
  name: z.string().max(150),
  course_id: z.string().uuid().optional(),
  semester: z.union([z.string(), z.number()]),
  search_aliases: z.string().max(150).optional().or(z.literal("")),
})

// GET /api/subjects/search?q=XYZ — Global Search across ALL universities
router.get('/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q || q.length < 2) return c.json({ success: true, data: [] })

    const { results } = await c.env.DB.prepare(`
      SELECT 
        s.id, s.subject_code, s.name as subject_name, s.semester,
        c.id as course_id, c.name as course_name, c.slug as course_slug,
        u.id as university_id, u.name as university_name, u.slug as university_slug
      FROM subjects s
      JOIN courses c ON s.course_id = c.id
      JOIN universities u ON c.university_id = u.id
      WHERE s.subject_code LIKE ? OR s.name LIKE ?
      ORDER BY s.subject_code ASC
      LIMIT 50
    `).bind(`%${q}%`, `%${q}%`).all()

    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// GET /api/subjects?course_id=X&semester=Y
router.get('/', async (c) => {
  try {
    const course_id = c.req.query('course_id')
    const semester = c.req.query('semester')

    if (course_id && semester) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM subjects WHERE course_id = ? AND semester = ? ORDER BY subject_code ASC'
      ).bind(course_id, parseInt(semester)).all()
      return c.json({ success: true, data: results })
    }

    if (course_id) {
      const { results } = await c.env.DB.prepare(
        'SELECT * FROM subjects WHERE course_id = ? ORDER BY semester ASC, subject_code ASC'
      ).bind(course_id).all()
      return c.json({ success: true, data: results })
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM subjects ORDER BY subject_code ASC').all()
    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// GET /api/subjects/semesters?course_id=X — Get distinct semesters for a course
router.get('/semesters', async (c) => {
  try {
    const course_id = c.req.query('course_id')
    if (!course_id) return c.json({ success: false, message: 'course_id is required' }, 400)

    const { results } = await c.env.DB.prepare(
      'SELECT DISTINCT semester, COUNT(*) as subject_count FROM subjects WHERE course_id = ? GROUP BY semester ORDER BY semester ASC'
    ).bind(course_id).all()

    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// GET /api/subjects/:id
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await c.env.DB.prepare('SELECT * FROM subjects WHERE id = ?').bind(id).first()
    if (!result) return c.json({ success: false, message: 'Subject not found' }, 404)
    return c.json({ success: true, data: result })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/subjects
router.post('/', zValidator('json', subjectSchema, handleZodError), async (c) => {
  try {
    const { subject_code, name, course_id, semester, search_aliases } = c.req.valid('json')
    if (!course_id) return c.json({ success: false, message: 'course_id is required' }, 400)

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO subjects (id, subject_code, name, course_id, semester, search_aliases) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, subject_code, name, course_id, parseInt(String(semester)), search_aliases || '').run()

    return c.json({ success: true, message: 'Subject created', data: { id, subject_code, name, course_id, semester } })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'This subject code already exists in this course for this semester' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/subjects/:id
router.patch('/:id', zValidator('json', subjectSchema, handleZodError), async (c) => {
  try {
    const id = c.req.param('id')
    const { subject_code, name, semester, search_aliases } = c.req.valid('json')

    await c.env.DB.prepare(
      'UPDATE subjects SET subject_code = ?, name = ?, semester = ?, search_aliases = ? WHERE id = ?'
    ).bind(subject_code, name, parseInt(String(semester)), search_aliases || '', id).run()

    return c.json({ success: true, message: 'Subject updated' })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'This subject code already exists in this course for this semester' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// DELETE /api/subjects/:id (CASCADE deletes resources)
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Nuclear Wipe: Cleanup all resources media across the entire subject
    const resources = await c.env.DB.prepare('SELECT rich_text_content, thumbnail_url, r2_object_key FROM subject_resources WHERE subject_id = ?').bind(id).all();
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
          Promise.all(validKeys.map(key => bucket.delete(key).catch(e => console.error(`[MediaSync] Failed subject wipe:`, e))))
        );
      }
    }

    await c.env.DB.prepare('PRAGMA foreign_keys = ON').run()
    await c.env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Subject and all related resources deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
