import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { buildUniversitySearchEntity, buildCourseSearchEntity, buildSubjectSearchEntity } from '../utils/searchIndex'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * GET /api/search?q=XYZ
 * 
 * High-Performance Global Search with:
 * 1. Cloudflare Edge Cache (absorbs traffic spikes, sub-10ms for cached queries)
 * 2. FTS5 MATCH query (sub-millisecond full-text search on D1)
 */
router.get('/', async (c) => {
  const q = c.req.query('q')?.trim()

  if (!q || q.length < 2) {
    return c.json({ success: true, data: [] })
  }

  // Step A: Edge Cache Lookup
  const cacheUrl = new URL(c.req.url)
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
  const cache = caches.default

  const cachedResponse = await cache.match(cacheKey)
  if (cachedResponse) {
    return cachedResponse
  }

  // Step B: FTS5 Query (cache miss)
  try {
    // Sanitize query: remove FTS5 special characters to prevent injection
    const sanitized = q.replace(/['"*(){}[\]^~\\:]/g, '').trim()
    if (!sanitized) {
      return c.json({ success: true, data: [] })
    }

    // Build FTS5 prefix query: each word gets a wildcard
    const ftsQuery = sanitized.split(/\s+/).map(word => `"${word}"*`).join(' ')

    const { results } = await c.env.DB.prepare(`
      SELECT id, entity_type, title, subtitle
      FROM global_search_index
      WHERE global_search_index MATCH ?
      ORDER BY rank
      LIMIT 10
    `).bind(ftsQuery).all()

    const responseBody = JSON.stringify({ success: true, data: results })

    // Step C: Cache the response and return
    const response = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    })

    // Store in Edge Cache (non-blocking)
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))

    return response
  } catch (error: any) {
    console.error('[Search] FTS5 query failed:', error)
    return c.json({ success: false, message: 'Search failed', debug: error.message }, 500)
  }
})

/**
 * POST /api/search/seed
 * Admin route to seed existing universities, courses, and subjects into the FTS5 index.
 * You should secure this route with an admin token/middleware in production.
 */
router.post('/seed', async (c) => {
  try {
    const db = c.env.DB;
    
    // 1. Fetch Universities
    const { results: universities } = await db.prepare('SELECT * FROM universities').all();
    
    // 2. Fetch Courses with their University Name
    const { results: courses } = await db.prepare(`
      SELECT c.*, u.name as university_name 
      FROM courses c 
      LEFT JOIN universities u ON c.university_id = u.id
    `).all();
    
    // 3. Fetch Subjects with their Course Name and University Name
    const { results: subjects } = await db.prepare(`
      SELECT s.*, c.name as course_name, u.name as university_name 
      FROM subjects s 
      LEFT JOIN courses c ON s.course_id = c.id 
      LEFT JOIN universities u ON c.university_id = u.id
    `).all();

    // Prepare batch statements
    // We clear the table first to avoid duplicates
    const statements = [
      db.prepare('DELETE FROM global_search_index')
    ];

    const insertStmt = db.prepare('INSERT INTO global_search_index (id, entity_type, title, subtitle, search_terms) VALUES (?, ?, ?, ?, ?)');

    for (const u of (universities || [])) {
      const entity = buildUniversitySearchEntity(u.id as string, u.name as string, u.acronym as string | null, u.search_aliases as string | null);
      statements.push(insertStmt.bind(entity.id, entity.entity_type, entity.title, entity.subtitle, entity.search_terms));
    }

    for (const co of (courses || [])) {
      const entity = buildCourseSearchEntity(co.id as string, co.name as string, co.acronym as string | null, co.university_name as string | null, co.search_aliases as string | null);
      statements.push(insertStmt.bind(entity.id, entity.entity_type, entity.title, entity.subtitle, entity.search_terms));
    }

    for (const sub of (subjects || [])) {
      const entity = buildSubjectSearchEntity(sub.id as string, sub.subject_code as string, sub.name as string, sub.course_name as string | null, sub.university_name as string | null, sub.search_aliases as string | null);
      statements.push(insertStmt.bind(entity.id, entity.entity_type, entity.title, entity.subtitle, entity.search_terms));
    }

    // Execute in a single D1 batch
    await db.batch(statements);

    return c.json({ 
      success: true, 
      message: 'FTS5 search index successfully seeded!', 
      data: {
        universities_indexed: universities?.length || 0,
        courses_indexed: courses?.length || 0,
        subjects_indexed: subjects?.length || 0,
        total: statements.length - 1
      }
    });
  } catch (error: any) {
    console.error('[Search Seed] Failed:', error);
    return c.json({ success: false, message: 'Seeding failed', debug: error.message }, 500);
  }
})

export default router
