import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Helper: Get the start date based on timeframe
function getStartDate(timeframe: string): string | null {
  const now = new Date()
  switch (timeframe) {
    case '7d':
      now.setDate(now.getDate() - 7)
      return now.toISOString()
    case '30d':
      now.setDate(now.getDate() - 30)
      return now.toISOString()
    case '1y':
      now.setFullYear(now.getFullYear() - 1)
      return now.toISOString()
    case 'all':
      return null // No date filter
    default:
      now.setDate(now.getDate() - 30)
      return now.toISOString()
  }
}

// Helper: Format date label based on timeframe
function formatDateLabel(dateStr: string, timeframe: string): string {
  const d = new Date(dateStr)
  if (timeframe === '7d') {
    return d.toLocaleDateString('en-US', { weekday: 'short' }) // Mon, Tue
  }
  if (timeframe === '30d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) // Jan 5
  }
  // 1y / all — group by month
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) // Jan '26
}

// Helper: Group purchases into chart buckets
function buildChartData(purchases: any[], timeframe: string): { date: string; revenue: number; orders: number }[] {
  const bucketMap = new Map<string, { revenue: number; orders: number }>()

  for (const p of purchases) {
    const label = formatDateLabel(p.created_at, timeframe)
    const existing = bucketMap.get(label)
    if (existing) {
      existing.revenue += p.amount_paid || 0
      existing.orders += 1
    } else {
      bucketMap.set(label, { revenue: p.amount_paid || 0, orders: 1 })
    }
  }

  return Array.from(bucketMap.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    orders: data.orders,
  }))
}

// Helper: Group by product_id and sum
function buildTopProducts(purchases: any[]): { product_id: string; totalRevenue: number; orderCount: number }[] {
  const map = new Map<string, { totalRevenue: number; orderCount: number }>()

  for (const p of purchases) {
    const pid = p.product_id
    if (!pid) continue
    const existing = map.get(pid)
    if (existing) {
      existing.totalRevenue += p.amount_paid || 0
      existing.orderCount += 1
    } else {
      map.set(pid, { totalRevenue: p.amount_paid || 0, orderCount: 1 })
    }
  }

  return Array.from(map.entries())
    .map(([product_id, data]) => ({ product_id, ...data }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10) // Top 10
}

// GET /api/analytics?timeframe=7d|30d|1y|all
router.get('/', async (c) => {
  try {
    const timeframe = (c.req.query('timeframe') || '30d') as string
    const startDate = getStartDate(timeframe)

    // Step A: Fetch successful purchases from Supabase
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY)

    let query = supabase
      .from('purchases')
      .select('id, product_id, amount_paid, created_at, payment_status')
      .eq('payment_status', 'SUCCESS')
      .order('created_at', { ascending: true })

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    const { data: purchases, error: supaError } = await query

    if (supaError) {
      // If the purchases table doesn't exist yet, return zeroed-out data gracefully
      if (supaError.code === '42P01' || supaError.message?.includes('does not exist')) {
        return c.json({
          success: true,
          data: {
            totalRevenue: 0,
            totalOrders: 0,
            chartData: [],
            topPerformers: [],
          }
        })
      }
      throw supaError
    }

    const safePurchases = purchases || []

    // Step B: Aggregate
    const totalRevenue = safePurchases.reduce((sum, p) => sum + (p.amount_paid || 0), 0)
    const totalOrders = safePurchases.length
    const chartData = buildChartData(safePurchases, timeframe)
    const topProducts = buildTopProducts(safePurchases)

    // Step C: Enrich top products with names from D1
    const topPerformers: { id: string; title: string; revenue: number; orders: number }[] = []

    if (topProducts.length > 0) {
      const db = c.env.DB
      const productIds = topProducts.map((p) => p.product_id)

      // Try subject_resources first (most likely product source)
      const placeholders = productIds.map(() => '?').join(',')
      const resourceResults = await db
        .prepare(`SELECT id, title FROM subject_resources WHERE id IN (${placeholders})`)
        .bind(...productIds)
        .all()

      const resourceMap = new Map<string, string>()
      for (const r of (resourceResults.results || []) as any[]) {
        resourceMap.set(r.id, r.title)
      }

      // Also try courses table for product_ids that didn't match resources
      const unmatchedIds = productIds.filter((id) => !resourceMap.has(id))
      if (unmatchedIds.length > 0) {
        const ph2 = unmatchedIds.map(() => '?').join(',')
        const courseResults = await db
          .prepare(`SELECT id, name FROM courses WHERE id IN (${ph2})`)
          .bind(...unmatchedIds)
          .all()
        for (const cr of (courseResults.results || []) as any[]) {
          resourceMap.set(cr.id, cr.name)
        }
      }

      for (const p of topProducts) {
        topPerformers.push({
          id: p.product_id,
          title: resourceMap.get(p.product_id) || `Product ${p.product_id.substring(0, 8)}...`,
          revenue: p.totalRevenue,
          orders: p.orderCount,
        })
      }
    }

    return c.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        chartData,
        topPerformers,
      }
    })
  } catch (error: any) {
    return c.json({
      success: false,
      message: 'Analytics query failed.',
      debug: error.message,
    }, 500)
  }
})

export default router
