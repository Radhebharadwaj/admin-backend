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

// POST /api/payments/create-order
router.post('/create-order', async (c) => {
  try {
    const user = await getUserFromAuth(c)
    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    const { resource_id } = await c.req.json()
    if (!resource_id) {
      return c.json({ success: false, message: 'Resource ID is required' }, 400)
    }

    // Verify resource
    const resource = await c.env.DB.prepare('SELECT price_in_inr FROM subject_resources WHERE id = ?').bind(resource_id).first()
    if (!resource) {
      return c.json({ success: false, message: 'Resource not found' }, 404)
    }

    if (!resource.price_in_inr || resource.price_in_inr <= 0) {
      return c.json({ success: false, message: 'Resource is free' }, 400)
    }

    const amountInPaise = Math.round((resource.price_in_inr as number) * 100)

    // Call Razorpay API to create order
    const authHeaderRaw = btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`)
    
    const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeaderRaw}`
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${resource_id.substring(0, 8)}_${Date.now()}`
      })
    })

    if (!rzpResponse.ok) {
      const err = await rzpResponse.text()
      return c.json({ success: false, message: 'Failed to create Razorpay order', debug: err }, 500)
    }

    const order = await rzpResponse.json() as any

    // Ensure student exists in DB (sync from Supabase)
    await c.env.DB.prepare(`
      INSERT INTO students (id, email, name) VALUES (?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(user.id, user.email || '', user.user_metadata?.name || '').run()

    // Create pending purchase record
    const purchaseId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO purchases (id, student_id, resource_id, amount, amount_in_paise, currency, status, gateway_order_id)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).bind(purchaseId, user.id, resource_id, resource.price_in_inr, amountInPaise, 'INR', order.id).run()

    return c.json({ success: true, order_id: order.id, amount: amountInPaise, key_id: c.env.RAZORPAY_KEY_ID })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// POST /api/payments/verify
router.post('/verify', async (c) => {
  try {
    const user = await getUserFromAuth(c)
    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, resource_id } = await c.req.json()
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !resource_id) {
      return c.json({ success: false, message: 'Missing required parameters' }, 400)
    }

    // Cryptographic Verification using Web Crypto API
    const encoder = new TextEncoder()
    const data = `${razorpay_order_id}|${razorpay_payment_id}`
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(c.env.RAZORPAY_KEY_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
    const hashArray = Array.from(new Uint8Array(signatureBuffer))
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (expectedSignature !== razorpay_signature) {
      return c.json({ success: false, message: 'Invalid signature' }, 400)
    }

    // Update purchase record to COMPLETED
    const result = await c.env.DB.prepare(`
      UPDATE purchases 
      SET status = 'COMPLETED', gateway_payment_id = ?
      WHERE gateway_order_id = ? AND student_id = ? AND resource_id = ?
    `).bind(razorpay_payment_id, razorpay_order_id, user.id, resource_id).run()

    if (!result.success) {
       return c.json({ success: false, message: 'Failed to update purchase record' }, 500)
    }

    return c.json({ success: true, message: 'Payment verified successfully' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

export default router
