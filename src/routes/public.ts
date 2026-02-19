import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// a) GET /api/public/search?q={query}
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

// b) GET /api/public/catalog/:university/:course/:semester
router.get('/catalog/:university/:course/:semester', async (c) => {
  try {
    const uniSlug = c.req.param('university')
    const courseSlug = c.req.param('course')
    const semester = parseInt(c.req.param('semester'))

    const { results } = await c.env.DB.prepare(`
      SELECT s.* 
      FROM subjects s
      JOIN courses c ON s.course_id = c.id
      JOIN universities u ON c.university_id = u.id
      WHERE u.slug = ? AND c.slug = ? AND s.semester = ?
      ORDER BY s.subject_code ASC
    `).bind(uniSlug, courseSlug, semester).all()

    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// c) GET /api/public/subject/:subjectCode
router.get('/subject/:subjectCode', async (c) => {
  try {
    const subjectCode = c.req.param('subjectCode')

    // Fetch Subject Info
    const subject = await c.env.DB.prepare(
      'SELECT * FROM subjects WHERE subject_code = ?'
    ).bind(subjectCode).first()

    if (!subject) return c.json({ success: false, message: 'Subject not found' }, 404)

    // Fetch Chapters using the retrieved subject ID
    const { results: chapters } = await c.env.DB.prepare(
      'SELECT * FROM chapters WHERE subject_id = ? AND is_active = 1 ORDER BY chapter_number ASC'
    ).bind(subject.id).all()

    return c.json({ success: true, data: { subject, chapters } })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
