import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { contributors } from '../db/schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Helper to encode Basic Auth for Razorpay
const getRazorpayAuthHeader = (keyId: string, keySecret: string) => {
    return 'Basic ' + btoa(`${keyId}:${keySecret}`)
}

// Helper for Web Crypto HMAC SHA-256
async function generateHmacSha256(secret: string, data: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    
    const dataBuffer = encoder.encode(data)
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer)
    
    // Convert ArrayBuffer to Hex String
    return Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

router.post(
    '/order',
    zValidator('json', z.object({
        amount_in_paise: z.number().int().min(100), // Min 1 INR
    })),
    async (c) => {
        const { amount_in_paise } = c.req.valid('json')
        
        try {
            const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': getRazorpayAuthHeader(c.env.RAZORPAY_KEY_ID, c.env.RAZORPAY_KEY_SECRET)
                },
                body: JSON.stringify({
                    amount: amount_in_paise,
                    currency: 'INR',
                    receipt: `receipt_${crypto.randomUUID().substring(0, 8)}`
                })
            })

            if (!razorpayRes.ok) {
                const errorData = await razorpayRes.text()
                console.error("Razorpay Order Error:", errorData)
                return c.json({ success: false, message: 'Failed to create order with payment gateway.' }, 500)
            }

            const order = await razorpayRes.json() as any

            return c.json({
                success: true,
                order_id: order.id,
                amount: order.amount,
                currency: order.currency,
                key_id: c.env.RAZORPAY_KEY_ID
            })
        } catch (error: any) {
            return c.json({ success: false, message: 'Internal Server Error', debug: error.message }, 500)
        }
    }
)

router.post(
    '/verify',
    zValidator('json', z.object({
        razorpay_order_id: z.string(),
        razorpay_payment_id: z.string(),
        razorpay_signature: z.string(),
        name: z.string().min(1),
        github_or_twitter_link: z.string().optional(),
        amount_in_paise: z.number().int().min(100)
    })),
    async (c) => {
        const payload = c.req.valid('json')
        
        try {
            const dataToSign = `${payload.razorpay_order_id}|${payload.razorpay_payment_id}`
            const generatedSignature = await generateHmacSha256(c.env.RAZORPAY_KEY_SECRET, dataToSign)

            // Strictly secure timing-safe-like comparison is ideal, but standard string comparison works here for edge environment
            if (generatedSignature !== payload.razorpay_signature) {
                return c.json({ success: false, message: 'Invalid payment signature.' }, 400)
            }

            // Insert into D1
            const db = drizzle(c.env.DB)
            
            await db.insert(contributors).values({
                name: payload.name,
                githubOrTwitterLink: payload.github_or_twitter_link || null,
                amountInPaise: payload.amount_in_paise,
                razorpayOrderId: payload.razorpay_order_id,
                razorpayPaymentId: payload.razorpay_payment_id,
                isVerified: 1,
            }).onConflictDoNothing() // Assuming orderId is unique and handles idempotency

            return c.json({ success: true, message: 'Contributor successfully verified and recorded.' })
            
        } catch (error: any) {
            console.error("Razorpay Verify Error:", error)
            return c.json({ success: false, message: 'Internal Server Error', debug: error.message }, 500)
        }
    }
)

export default router
