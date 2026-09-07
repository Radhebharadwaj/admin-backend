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
        s.id, s.subject_code, s.name as subject_name, s.semester, s.search_aliases as subject_search_aliases,
        c.id as course_id, c.name as course_name, c.slug as course_slug, c.search_aliases as course_search_aliases,
        u.id as university_id, u.name as university_name, u.slug as university_slug, u.search_aliases as university_search_aliases
      FROM subjects s
      JOIN courses c ON s.course_id = c.id
      JOIN universities u ON c.university_id = u.id
      WHERE s.subject_code LIKE ? OR s.name LIKE ? OR s.search_aliases LIKE ?
      ORDER BY s.subject_code ASC
      LIMIT 50
    `).bind(`%${q}%`, `%${q}%`, `%${q}%`).all()

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

// d) GET /api/public/universities
router.get('/universities', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, slug, icon, short_name, search_aliases FROM universities WHERE is_active = true ORDER BY name ASC'
    ).all()
    return c.json(results)
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// e) GET /api/public/universities/:univSlug/courses
router.get('/universities/:univSlug/courses', async (c) => {
  try {
    const univSlug = c.req.param('univSlug')
    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.name, c.slug, c.duration_years, c.search_aliases
      FROM courses c 
      INNER JOIN universities u ON c.university_id = u.id 
      WHERE u.slug = ? AND c.is_active = true 
      ORDER BY c.name ASC
    `).bind(univSlug).all()
    
    return c.json(results)
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// f) GET /api/public/courses/:courseSlug/semesters
router.get('/courses/:courseSlug/semesters', async (c) => {
  try {
    const courseSlug = c.req.param('courseSlug')
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT semester 
      FROM subjects s 
      INNER JOIN courses c ON s.course_id = c.id 
      WHERE c.slug = ? 
      ORDER BY semester ASC
    `).bind(courseSlug).all()
    
    // results is an array of objects like { semester: 1 }, { semester: 2 }
    return c.json(results)
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
