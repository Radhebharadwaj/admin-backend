import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { Bindings, Variables } from '../index'

const team = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Middleware: Require SUPER_ADMIN
team.use('*', async (c, next) => {
  const teamMember = c.get('teamMember')
  if (!teamMember || teamMember.role !== 'SUPER_ADMIN') {
    return c.json({ success: false, message: '403 Forbidden: Require SUPER_ADMIN role.' }, 403)
  }
  await next()
})

// GET /api/team
team.get('/', async (c) => {
  const supabaseAdmin = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('id, email, role, scope, is_active')

  if (error) {
    return c.json({ success: false, message: 'Failed to fetch team members' }, 500)
  }

  return c.json({ success: true, data })
})

// POST /api/team
team.post('/', async (c) => {
  const supabaseAdmin = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)
  const body = await c.req.json()

  // Create an auth user first
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: body.email,
    email_confirm: true,
    password: crypto.randomUUID() + "Aa1!", // auto-generated temp password
  })

  if (authError && authError.status !== 422) {
    return c.json({ success: false, message: authError.message }, 500)
  }

  // Insert into team_members table
  const userId = authData?.user?.id || crypto.randomUUID()

  const { data, error } = await supabaseAdmin
    .from('team_members')
    .insert([{ 
       id: userId,
       email: body.email, 
       role: body.role || 'EDITOR', 
       scope: body.scope || 'ALL', 
       is_active: true 
    }])
    .select()
    .single()

  if (error) {
    return c.json({ success: false, message: error.message }, 500)
  }

  return c.json({ success: true, data })
})

// PATCH /api/team/:id
team.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const supabaseAdmin = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

  // Fetch target user to check safeguard
  const { data: targetUser } = await supabaseAdmin
    .from('team_members')
    .select('email')
    .eq('id', id)
    .single()

  if (targetUser && c.env.ROOT_ADMIN_EMAIL && targetUser.email === c.env.ROOT_ADMIN_EMAIL) {
    return c.json({ success: false, message: '403 Forbidden: Cannot modify the Root Founder.' }, 403)
  }

  const { data, error } = await supabaseAdmin
    .from('team_members')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return c.json({ success: false, message: error.message }, 500)
  }

  return c.json({ success: true, data })
})

// DELETE /api/team/:id
team.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const supabaseAdmin = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

  // Fetch target user to check safeguard
  const { data: targetUser } = await supabaseAdmin
    .from('team_members')
    .select('email')
    .eq('id', id)
    .single()

  if (targetUser && c.env.ROOT_ADMIN_EMAIL && targetUser.email === c.env.ROOT_ADMIN_EMAIL) {
    return c.json({ success: false, message: '403 Forbidden: Cannot modify the Root Founder.' }, 403)
  }

  // Delete from team_members and from auth
  await supabaseAdmin.from('team_members').delete().eq('id', id)
  await supabaseAdmin.auth.admin.deleteUser(id)

  return c.json({ success: true })
})

export default team
