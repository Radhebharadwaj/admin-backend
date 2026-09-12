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
        grouped.universities.push({ 
          acronym: row.title !== row.subtitle ? row.title : null, 
          name: row.subtitle, 
          slug: params.slug || row.entity_id 
        });
      } else if (row.entity_type === 'course') {
        grouped.courses.push({ 
          acronym: row.title !== row.subtitle ? row.title : null,
          name: row.subtitle, 
          slug: params.slug, 
          university_slug: params.university_slug 
        });
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
      WHERE (u.slug = ? OR LOWER(u.acronym) = LOWER(?))
        AND (c.slug = ? OR LOWER(c.acronym) = LOWER(?))
        AND s.semester = ?
      ORDER BY s.subject_code ASC
    `).bind(uniSlug, uniSlug, courseSlug, courseSlug, semester).all()

    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// c) GET /api/public/subject/:subjectCode
router.get('/subject/:subjectCode', async (c) => {
  try {
    const subjectCode = c.req.param('subjectCode')

    // Fetch Subject Info with Course & University details
    const subject: any = await c.env.DB.prepare(`
      SELECT s.*, c.slug as course_slug, c.name as course_name, c.acronym as course_acronym, u.slug as uni_slug, u.name as uni_name, u.acronym as uni_acronym
      FROM subjects s
      LEFT JOIN courses c ON s.course_id = c.id
      LEFT JOIN universities u ON c.university_id = u.id
      WHERE s.subject_code = ? OR s.id = ?
    `).bind(subjectCode, subjectCode).first()

    if (!subject) return c.json({ success: false, message: 'Subject not found' }, 404)

    // Fetch Chapters sorted by unit_number and chapter_number
    const { results: chapters } = await c.env.DB.prepare(
      'SELECT * FROM chapters WHERE subject_id = ? AND is_active = 1 ORDER BY COALESCE(unit_number, 1) ASC, chapter_number ASC'
    ).bind(subject.id).all()

    // Fetch Resources sorted by sequence_number
    const { results: resources } = await c.env.DB.prepare(
      'SELECT * FROM subject_resources WHERE subject_id = ? ORDER BY sequence_number ASC'
    ).bind(subject.id).all()

    return c.json({ success: true, data: { subject, chapters, resources } })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// d) GET /api/public/universities
router.get('/universities', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, acronym, slug, logo_url, search_aliases FROM universities WHERE is_active = 1 ORDER BY name ASC'
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
      SELECT c.id, c.name, c.acronym, c.slug, c.duration_years, c.search_aliases
      FROM courses c 
      INNER JOIN universities u ON c.university_id = u.id 
      WHERE (u.slug = ? OR LOWER(u.acronym) = LOWER(?)) AND c.is_active = 1 
      ORDER BY c.name ASC
    `).bind(univSlug, univSlug).all()
    
    return c.json(results)
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// f) GET /api/public/courses/:courseSlug/semesters
router.get('/courses/:courseSlug/semesters', async (c) => {
  try {
    const courseSlug = c.req.param('courseSlug')
    const course: any = await c.env.DB.prepare(
      'SELECT total_semesters FROM courses WHERE (slug = ? OR LOWER(acronym) = LOWER(?)) AND is_active = 1'
    ).bind(courseSlug, courseSlug).first()
    
    if (!course) {
      return c.json([])
    }
    
    const results = []
    for (let i = 1; i <= course.total_semesters; i++) {
      results.push({ semester_number: i, slug: i.toString() })
    }
    
    return c.json(results)
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
