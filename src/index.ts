import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'

import teamRouter from './routes/team'
import universitiesRouter from './routes/universities'
import coursesRouter from './routes/courses'
import subjectsRouter from './routes/subjects'
import chaptersRouter from './routes/chapters'
import resourcesRouter from './routes/resources'
import uploadRouter from './routes/upload'

export type Bindings = {
  DB: D1Database
  BUCKET?: R2Bucket
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ROOT_ADMIN_EMAIL?: string
}

export type Variables = {
  teamMember: {
    id: string
    email: string
    role: string
    scope: string
    is_active: boolean
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ==========================================
// Middleware Configuration
// ==========================================
// CORS Middleware
app.use('/api/*', cors({
  origin: ['http://localhost:3000', 'https://admin.quduhub.com', 'https://qudu.pages.dev'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
  allowMethods: ['POST', 'GET', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

// Auth Middleware logic
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  let sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

  if (!sessionToken) {
    sessionToken = c.req.header('x-admin-token') || null
  }

  // Dev fallback
  if (!sessionToken && c.env.SUPABASE_URL === 'dev') {
    c.set('teamMember', { id: "dev", email: "dev@quduhub.com", role: "SUPER_ADMIN", scope: "ALL", is_active: true })
    return await next()
  }

  if (!sessionToken) {
    return c.json({ success: false, message: '401 Unauthorized — Missing Token' }, 401)
  }

  try {
    const supabaseAdmin = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

    // Validate JWT token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(sessionToken)

    if (authError || !user) {
      return c.json({
        success: false,
        message: '401 Unauthorized — Invalid Token',
        debug: authError?.message || 'No user returned'
      }, 401)
    }

    // Root Admin Bypass
    if (c.env.ROOT_ADMIN_EMAIL && user.email?.toLowerCase() === c.env.ROOT_ADMIN_EMAIL.toLowerCase()) {
      c.set('teamMember', {
        id: "root",
        email: user.email,
        member_name: "Root Administrator",
        role: "SUPER_ADMIN",
        scope: "ALL",
        is_active: true
      })
      return await next()
    }

    // Check team_members table
    const { data: teamMember, error: dbError } = await supabaseAdmin
      .from('team_members')
      .select('id, email, member_name, role, scope, is_active')
      .eq('email', user.email)
      .eq('is_active', true)
      .single()

    if (dbError || !teamMember) {
      return c.json({ success: false, message: '403 Forbidden — Not an active team member.' }, 403)
    }

    c.set('teamMember', teamMember)
    await next()
  } catch (error: any) {
    return c.json({ success: false, message: '500 Internal Server Error — Auth failed.', debug: error?.message || 'unknown' }, 500)
  }
}

// Health check (no auth required)
app.get('/api/health', async (c) => {
  return c.json({
    status: 'ok',
    env: {
      SUPABASE_URL_PREFIX: c.env.SUPABASE_URL ? c.env.SUPABASE_URL.substring(0, 15) + '***' : 'NOT SET',
      SUPABASE_SERVICE_ROLE_KEY: !!c.env.SUPABASE_SERVICE_ROLE_KEY,
      ROOT_ADMIN_EMAIL: !!c.env.ROOT_ADMIN_EMAIL,
      ROOT_ADMIN_EMAIL_VALUE: c.env.ROOT_ADMIN_EMAIL ? c.env.ROOT_ADMIN_EMAIL.substring(0, 5) + '***' : 'NOT SET',
      DB: !!c.env.DB,
      BUCKET: !!c.env.BUCKET,
    }
  })
})

// Proxy Route (Bypass CORS & X-Frame-Options for External PDFs)
app.get('/api/proxy-resource', async (c) => {
  try {
    const resourceId = c.req.query('id')
    if (!resourceId) {
      return c.json({ success: false, message: 'Missing id parameter' }, 400)
    }

    // Fetch the external URL from the database
    const resource = await c.env.DB.prepare(
      'SELECT external_url FROM subject_resources WHERE id = ?'
    ).bind(resourceId).first()

    if (!resource || !resource.external_url) {
      return c.json({ success: false, message: 'Resource not found or no external URL associated' }, 404)
    }

    const externalUrl = resource.external_url as string

    const response = await fetch(externalUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    })

    if (!response.ok) {
      return c.json({ success: false, message: `Failed to fetch external resource: ${response.statusText}` }, response.status)
    }

    const contentType = response.headers.get('Content-Type') || 'application/pdf'
    const arrayBuffer = await response.arrayBuffer()

    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'inline', // Ensures it displays in browser instead of downloading
      },
    })
  } catch (error: any) {
    return c.json({ success: false, message: 'Error fetching proxy resource', debug: error.message }, 500)
  }
})

// Apply Auth Middleware
app.use('/api/admin/*', authMiddleware)
app.use('/api/team/*', authMiddleware)
app.use('/api/team', authMiddleware)
app.use('/api/universities/*', authMiddleware)
app.use('/api/universities', authMiddleware)
app.use('/api/courses/*', authMiddleware)
app.use('/api/courses', authMiddleware)
app.use('/api/subjects/*', authMiddleware)
app.use('/api/subjects', authMiddleware)
app.use('/api/chapters/*', authMiddleware)
app.use('/api/chapters', authMiddleware)
app.use('/api/resources/*', authMiddleware)
app.use('/api/resources', authMiddleware)
app.use('/api/upload/*', authMiddleware)
app.use('/api/upload', authMiddleware)

// RBAC Middleware
export const requireRole = (allowedRoles: string[]) => async (c: any, next: any) => {
  if (c.req.method === 'GET') return await next();
  const teamMember = c.get('teamMember');
  if (!teamMember || !allowedRoles.includes(teamMember.role)) {
    return c.json({ success: false, message: '403 Forbidden — You do not have permission for this action.' }, 403);
  }
  await next();
}

// Apply RBAC to mutations
app.use('/api/universities/*', requireRole(['SUPER_ADMIN']))
app.use('/api/universities', requireRole(['SUPER_ADMIN']))
app.use('/api/courses/*', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER']))
app.use('/api/courses', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER']))
app.use('/api/subjects/*', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER']))
app.use('/api/subjects', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER']))
app.use('/api/chapters/*', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER', 'DATA_ENTRY']))
app.use('/api/chapters', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER', 'DATA_ENTRY']))
app.use('/api/resources/*', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER', 'DATA_ENTRY']))
app.use('/api/resources', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER', 'DATA_ENTRY']))
app.use('/api/upload/*', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER']))
app.use('/api/upload', requireRole(['SUPER_ADMIN', 'CONTENT_MANAGER']))

// GET Dashboard Stats
app.get('/api/admin/me', async (c) => {
  const teamMember = c.get('teamMember')
  return c.json({ success: true, data: teamMember })
})

// GET Dashboard Stats
app.get('/api/admin/dashboard', async (c) => {
  try {
    const db = c.env.DB
    // Removed purchases query since table doesn't exist yet
    const [uniRes, courseRes, subjRes] = await db.batch([
      db.prepare("SELECT COUNT(*) as count FROM universities"),
      db.prepare("SELECT COUNT(*) as count FROM courses"),
      db.prepare("SELECT COUNT(*) as count FROM subjects")
    ])

    let teamCount = 0
    try {
      const supabaseAdmin = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
      const { count } = await supabaseAdmin.from('team_members').select('*', { count: 'exact', head: true })
      teamCount = count || 0
    } catch (e) { }

    return c.json({
      success: true,
      data: {
        universities: (uniRes.results[0] as any)?.count || 0,
        courses: (courseRes.results[0] as any)?.count || 0,
        subjects: (subjRes.results[0] as any)?.count || 0,
        teamMembers: teamCount,
        totalSales: 0 // Hardcoded to 0 until purchases table is created
      }
    })
  } catch (error: any) {
    return c.json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      debug: error.message
    }, 500)
  }
})

// GET Dropdown Data
app.get('/api/admin/dropdown', async (c) => {
  try {
    const db = c.env.DB
    const [unis, courses, subjects] = await db.batch([
      db.prepare("SELECT id, name, slug FROM universities"),
      db.prepare("SELECT id, name, slug, university_id FROM courses"),
      db.prepare("SELECT id, subject_code, name, course_id FROM subjects")
    ])

    return c.json({
      success: true,
      data: {
        universities: unis.results || [],
        courses: courses.results || [],
        subjects: subjects.results || [],
      }
    })
  } catch (error) {
    return c.json({
      success: true,
      data: { universities: [], courses: [], subjects: [] }
    })
  }
})

// POST Publish Assignment
app.post('/api/admin/publish', async (c) => {
  const teamMember = c.get('teamMember')

  let formData: Record<string, any>
  try {
    formData = await c.req.parseBody()
  } catch (e) {
    return c.json({ success: false, message: "Invalid form data" }, 400)
  }

  const universitySlug = formData.university as string | undefined
  const userScope = teamMember.scope

  // RBAC scope check
  if (userScope !== "ALL" && universitySlug && universitySlug.toUpperCase() !== userScope.toUpperCase()) {
    return c.json({
      success: false,
      message: `Unauthorized: Your scope is limited to "${userScope}". You cannot publish content for "${universitySlug}".`,
    }, 403)
  }


  const subjectCode = formData.subject_code as string | undefined
  if (!subjectCode) {
    return c.json({ success: false, message: "Subject code is required." }, 400)
  }

  const price = Number(formData.price || 49)
  const sessionYear = (formData.session_year as string) || "2026-27"
  const richTextContent = (formData.rich_text as string) || ""

  const resourceFile = formData.resource_file as File | undefined

  let r2ObjectKey = ""
  const r2 = c.env.BUCKET

  if (!r2) {
    return c.json({ success: false, message: "R2 Bucket is not configured." }, 500)
  }

  // File sanitization
  if (resourceFile && resourceFile.size > 0) {
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    const ALLOWED_MIME_TYPES = new Set(["application/pdf", "application/json"])

    if (resourceFile.size > MAX_FILE_SIZE) {
      return c.json({ success: false, message: "File too large (Max 10MB)" }, 413)
    }

    const mimeType = resourceFile.type?.toLowerCase() || ""
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return c.json({ success: false, message: "Unsupported media type" }, 415)
    }

    const ext = resourceFile.name.split(".").pop()?.toLowerCase()
    if (ext !== "pdf" && ext !== "json") {
      return c.json({ success: false, message: "Invalid extension" }, 415)
    }

    try {
      const mimeToExt: Record<string, string> = { "application/pdf": "pdf", "application/json": "json" }
      const finalExt = mimeToExt[mimeType] || "pdf"
      r2ObjectKey = `assignments/${subjectCode}/${Date.now()}-${crypto.randomUUID()}.${finalExt}`

      await r2.put(r2ObjectKey, await resourceFile.arrayBuffer(), {
        httpMetadata: { contentType: mimeType },
        customMetadata: { uploadedBy: teamMember.email, subjectCode, sessionYear },
      })
    } catch (e: any) {
      if (!e.message?.includes("is not defined")) {
        return c.json({ success: false, message: `R2 upload failed: ${e.message}` }, 500)
      }
    }
  } else if (richTextContent) {
    try {
      r2ObjectKey = `assignments/${subjectCode}/${Date.now()}-${crypto.randomUUID()}.json`
      const payload = JSON.stringify({
        subjectCode, sessionYear, content: richTextContent,
        uploadedBy: teamMember.email, createdAt: new Date().toISOString(),
      })
      await r2.put(r2ObjectKey, payload, { httpMetadata: { contentType: "application/json" } })
    } catch (e: any) { }
  }

  // D1 Insert
  const assignmentId = crypto.randomUUID()
  const now = new Date().toISOString()

  try {
    await c.env.DB.prepare(
      `INSERT INTO assignment_metadata
         (id, subject_code, session_year, price, r2_payload_url, status, is_active,
          valid_from, valid_until, is_expired, uploaded_by)
       VALUES (?, ?, ?, ?, ?, 'SOLVED', 1, ?, '2027-03-31', 0, ?)`
    ).bind(assignmentId, subjectCode, sessionYear, price, r2ObjectKey, now, teamMember.email).run()

    return c.json({ success: true, message: `✅ Published! Assignment "${subjectCode}" (${sessionYear}) is now live.` })
  } catch (dbError: any) {
    if (dbError.message?.includes("no such table")) {
      return c.json({ success: true, message: "Published (Mocked — DB table missing in dev)" })
    }
    return c.json({ success: false, message: "Database insert failed." }, 500)
  }
})

// Mount sub-router
app.route('/api/team', teamRouter)
app.route('/api/universities', universitiesRouter)
app.route('/api/courses', coursesRouter)
app.route('/api/subjects', subjectsRouter)
app.route('/api/chapters', chaptersRouter)
app.route('/api/resources', resourcesRouter)
app.route('/api/upload', uploadRouter)

export default app