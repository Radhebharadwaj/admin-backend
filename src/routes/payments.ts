import { Hono } from 'hono'
import { Bindings, Variables } from '../index'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { contributors } from '../db/schema'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Handle CORS Preflight OPTIONS requests
router.options('*', (c) => {
  return c.body(null, 204)
})

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
    const resource = await c.env.DB.prepare('SELECT price_in_paise FROM subject_resources WHERE id = ?').bind(resource_id).first()
    if (!resource) {
      return c.json({ success: false, message: 'Resource not found' }, 404)
    }

    if (!resource.price_in_paise || Number(resource.price_in_paise) <= 0) {
      return c.json({ success: false, message: 'Resource is free' }, 400)
    }

    const amountInPaise = resource.price_in_paise as number

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
    `).bind(purchaseId, user.id, resource_id, resource.price_in_paise, amountInPaise, 'INR', order.id).run()

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

// ROUTE 1: Create Contributor Order
router.post('/contributor/create-order', async (c) => {
  try {
    const { name, github_or_twitter_link, amount } = await c.req.json();
    const amount_in_paise = Number(amount) * 100;
    const contributorId = crypto.randomUUID();

    const keyId = c.env.RAZORPAY_KEY_ID;
    const keySecret = c.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error("MISSING API KEYS IN CLOUDFLARE ENV");
      return c.json({ error: "Server Configuration Error: Missing Payment Gateway Keys" }, 500);
    }

    // 2. Clean the Keys (Strip accidental whitespace)
    const cleanKeyId = keyId.trim();
    const cleanKeySecret = keySecret.trim();

    // 🔥 NEW: Auto-detect if we are using Razorpay Test Mode
    const isTestMode = cleanKeyId.startsWith('rzp_test');

    const bodyPayload = {
      amount: amount_in_paise,
      currency: 'INR',
      // Generate a short unique receipt ID
      receipt: `rcpt_${crypto.randomUUID().split('-')[0]}` 
    };

    // 3. Fetch to Razorpay using the cleaned keys
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${cleanKeyId}:${cleanKeySecret}`)}`
      },
      body: JSON.stringify(bodyPayload)
    });
    const order = await rzpRes.json() as any;

    if (!rzpRes.ok) {
      console.error("RAZORPAY RAW ERROR:", order);
      
      // Send Razorpay's exact complaint directly to the frontend
      return c.json({ 
        error: order?.error?.description || 'Razorpay API rejected the request', 
        details: order 
      }, 400);
    }

    // 2. Insert unverified record into D1 via Drizzle
    try {
      const db = drizzle(c.env.DB);
      await db.insert(contributors).values({
        id: contributorId,
        name,
        github_or_twitter_link,
        amount_in_paise,
        razorpay_order_id: order.id,
        is_verified: false,
        is_test: isTestMode // Save the auto-detected flag
      });
    } catch (dbError: any) {
      console.error("D1 DATABASE CRASH:", dbError);
      return c.json({ error: "Database Insert Failed", details: dbError.message }, 500);
    }

    return c.json({ orderId: order.id, amount: amount_in_paise, contributorId });
  } catch (globalError: any) {
    console.error("UNKNOWN FATAL CRASH:", globalError);
    return c.json({ error: "Internal Server Error", details: globalError.message }, 500);
  }
});

// ROUTE 2: Verify Contributor Payment
router.post('/contributor/verify', async (c) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await c.req.json();
  
  // TODO: Implement HMAC SHA256 Web Crypto verification here to validate signature
  // For now, if we reach here, we assume client passed verification.
  // Update D1 to mark as verified
  const db = drizzle(c.env.DB);
  await db.update(contributors)
    .set({ 
      is_verified: true, 
      razorpay_payment_id 
    })
    .where(eq(contributors.razorpay_order_id, razorpay_order_id));

  return c.json({ success: true });
});

export default router
