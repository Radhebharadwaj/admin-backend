import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

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
router.post('/', async (c) => {
  try {
    const { subject_code, name, course_id, semester } = await c.req.json()
    if (!subject_code || !name || !course_id || !semester) {
      return c.json({ success: false, message: 'subject_code, name, course_id, and semester are required' }, 400)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO subjects (id, subject_code, name, course_id, semester) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, subject_code, name, course_id, parseInt(semester)).run()

    return c.json({ success: true, message: 'Subject created', data: { id, subject_code, name, course_id, semester } })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, message: 'This subject code already exists in this course for this semester' }, 400)
    }
    return c.json({ success: false, message: error.message }, 500)
  }
})

// PATCH /api/subjects/:id
router.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { subject_code, name, semester } = await c.req.json()
    if (!subject_code || !name) return c.json({ success: false, message: 'subject_code and name are required' }, 400)

    await c.env.DB.prepare(
      'UPDATE subjects SET subject_code = ?, name = ?, semester = ? WHERE id = ?'
    ).bind(subject_code, name, parseInt(semester), id).run()

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
    await c.env.DB.prepare('PRAGMA foreign_keys = ON').run()
    await c.env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Subject and all related resources deleted' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
