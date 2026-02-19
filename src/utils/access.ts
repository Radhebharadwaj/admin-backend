import { createClient } from '@supabase/supabase-js'

export async function checkResourceAccess(c: any, resourceId: string, priceInInr: number): Promise<boolean> {
  // Free resources are always accessible
  if (!priceInInr || priceInInr === 0) {
    return true
  }

  // Parse Authorization Header
  const authHeader = c.req.header('Authorization')
  let sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

  if (!sessionToken) {
    sessionToken = c.req.header('x-admin-token') || null
  }

  // If no token, deny access to paid resource
  if (!sessionToken) {
    return false
  }

  // Dev bypass
  if (c.env.SUPABASE_URL === 'dev') {
    return true
  }

  try {
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error } = await supabase.auth.getUser(sessionToken)

    if (error || !user) {
      return false
    }

    // 1. Root Admin Bypass
    if (c.env.ROOT_ADMIN_EMAIL && user.email?.toLowerCase() === c.env.ROOT_ADMIN_EMAIL.toLowerCase()) {
      return true
    }

    // 2. VIP JWT Role Bypass (Admins & Team Members)
    const role = user.user_metadata?.role || user.app_metadata?.role;
    if (role === 'admin' || role === 'team_member' || role === 'SUPER_ADMIN' || role === 'CONTENT_MANAGER') {
      return true;
    }

    // 3. Team Member (Admin) Bypass via DB
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('email', user.email)
      .eq('is_active', true)
      .single()

    if (teamMember) {
      return true
    }

    // 3. Check Student Purchase
    const purchase = await c.env.DB.prepare(
      "SELECT id FROM purchases WHERE student_id = ? AND resource_id = ? AND status = 'COMPLETED'"
    ).bind(user.id, resourceId).first()

    if (purchase) {
      return true
    }

    return false
  } catch (error) {
    console.error("Access Check Error:", error)
    return false
  }
}
