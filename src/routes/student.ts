import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { createClient } from '@supabase/supabase-js'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

async function getUserFromAuth(c: any) {
  const authHeader = c.req.header('Authorization')
  let sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

  if (!sessionToken) return null;

  try {
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user } } = await supabase.auth.getUser(sessionToken)
    return user
  } catch {
    return null
  }
}

// GET /api/student/library
router.get('/library', async (c) => {
  try {
    const user = await getUserFromAuth(c)
    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    // Fetch all resources where the student has a COMPLETED purchase
    const { results } = await c.env.DB.prepare(`
      SELECT r.* 
      FROM subject_resources r
      INNER JOIN purchases p ON r.id = p.resource_id
      WHERE p.student_id = ? AND p.status = 'COMPLETED'
      ORDER BY p.created_at DESC
    `).bind(user.id).all()

    return c.json({ success: true, data: results })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
