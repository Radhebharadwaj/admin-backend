import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])

// POST /api/upload/image
// Accepts: FormData with a "file" field and an optional "folder" field
// Returns: { success: true, data: { url: "logos/uuid.ext" } }
router.post('/image', async (c) => {
  try {
    const r2 = c.env.BUCKET
    if (!r2) {
      return c.json({ success: false, message: 'R2 Bucket is not configured.' }, 500)
    }

    const formData = await c.req.parseBody()
    const file = formData.file as File | undefined
    const folder = (formData.folder as string) || 'uploads'

    if (!file || file.size === 0) {
      return c.json({ success: false, message: 'No file provided.' }, 400)
    }

    // Validate size
    if (file.size > MAX_IMAGE_SIZE) {
      return c.json({ success: false, message: `File too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB.` }, 413)
    }

    // Validate MIME type
    const mimeType = file.type?.toLowerCase() || ''
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      return c.json({
        success: false,
        message: `Unsupported file type "${mimeType}". Allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`
      }, 415)
    }

    // Validate extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg'])
    if (!ext || !allowedExtensions.has(ext)) {
      return c.json({ success: false, message: `Invalid file extension ".${ext}".` }, 415)
    }

    // Sanitize folder name
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_')

    // Build object key: folder/timestamp-uuid.ext
    const objectKey = `${safeFolder}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    // Upload to R2
    const teamMember = c.get('teamMember')
    await r2.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        uploadedBy: teamMember?.email || 'unknown',
        originalName: file.name,
      },
    })

    return c.json({
      success: true,
      message: 'Image uploaded successfully.',
      data: { url: objectKey }
    })
  } catch (error: any) {
    return c.json({
      success: false,
      message: 'Upload failed.',
      debug: error.message
    }, 500)
  }
})

export default router
