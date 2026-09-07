import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// a) GET /api/public/search?q={query}
router.get('/search', async (c) => {
  try {
    const q = c.req.query('q')
    if (!q || q.length < 2) return c.json({ success: true, data: [] })

    // Sanitize and format the query for FTS5
    // Example: "delhi university" -> "delhi* AND university*"
    const sanitizedQuery = q
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .trim()
      .split(/\s+/) // Split by spaces
      .filter(term => term.length > 0)
      .map(term => `${term}*`) // Append wildcard to each term for prefix matching
      .join(' AND ')

    if (!sanitizedQuery) return c.json({ success: true, data: [] })

    const { results } = await c.env.DB.prepare(`
      SELECT entity_id, entity_type, title, subtitle, search_aliases, route_params
      FROM global_search_index
      WHERE global_search_index MATCH ?
      ORDER BY rank
      LIMIT 50
    `).bind(sanitizedQuery).all()

    const grouped: any = { universities: [], courses: [], subjects: [] };

    results.forEach((row: any) => {
      let params: any = {};
      try {
        if (row.route_params) params = JSON.parse(row.route_params as string);
      } catch (e) {}

      if (row.entity_type === 'university') {
        grouped.universities.push({ name: row.title, slug: params.slug || row.entity_id });
      } else if (row.entity_type === 'course') {
        grouped.courses.push({ name: row.title, slug: params.slug, university_slug: params.university_slug });
      } else if (row.entity_type === 'subject') {
        grouped.subjects.push({ subject_code: row.subtitle, subject_name: row.title, course_slug: params.course_slug, university_slug: params.university_slug });
      }
    });

    return c.json({ success: true, results: grouped })
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
      'SELECT id, name, slug, icon, short_name, search_aliases FROM universities WHERE is_active = 1 ORDER BY name ASC'
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
      WHERE u.slug = ? AND c.is_active = 1 
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
