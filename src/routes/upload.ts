import { Hono } from 'hono'
import { Bindings, Variables } from '../index'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const MAX_IMAGE_SIZE = 1 * 1024 * 1024 // 1MB
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
const ALLOWED_DOCUMENT_TYPES = new Set(['application/pdf'])

// POST /api/upload/media
// Accepts: FormData with file, uploadType, entityType, universitySlug, courseSlug, subjectCode, filePrefix
router.post('/media', async (c) => {
  try {
    const r2 = c.env.BUCKET
    if (!r2) {
      return c.json({ success: false, message: 'R2 Bucket is not configured.' }, 500)
    }

    const formData = await c.req.parseBody()
    const file = formData.file as File | undefined
    const uploadType = formData.uploadType as string // 'image' | 'document'
    const entityType = formData.entityType as string
    const universitySlug = formData.universitySlug as string
    const courseSlug = formData.courseSlug as string | undefined
    const subjectCode = formData.subjectCode as string | undefined
    const filePrefix = formData.filePrefix as string

    if (!file || file.size === 0) {
      return c.json({ success: false, message: 'No file provided.' }, 400)
    }
    if (!uploadType || !entityType || !universitySlug) {
      return c.json({ success: false, message: 'Missing required relational context parameters.' }, 400)
    }

    const mimeType = file.type?.toLowerCase() || ''
    let ext = file.name.split('.').pop()?.toLowerCase() || 'bin'

    if (uploadType === 'image') {
      if (file.size > MAX_IMAGE_SIZE) return c.json({ success: false, message: `Image too large. Max ${MAX_IMAGE_SIZE / 1024 / 1024}MB.` }, 413)
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return c.json({ success: false, message: `Unsupported image type "${mimeType}".` }, 415)
      if (ext === 'bin' && mimeType === 'image/jpeg') ext = 'jpg';
      if (ext === 'bin' && mimeType === 'image/png') ext = 'png';
      if (ext === 'bin' && mimeType === 'image/webp') ext = 'webp';
      if (ext === 'bin' && mimeType === 'image/svg+xml') ext = 'svg';
    } else if (uploadType === 'document') {
      if (file.size > MAX_DOCUMENT_SIZE) return c.json({ success: false, message: `Document too large. Max ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB.` }, 413)
      if (!ALLOWED_DOCUMENT_TYPES.has(mimeType)) return c.json({ success: false, message: `Unsupported document type "${mimeType}". Only PDF is allowed.` }, 415)
      if (ext === 'bin' && mimeType === 'application/pdf') ext = 'pdf';
    } else {
      return c.json({ success: false, message: 'Invalid uploadType.' }, 400)
    }

    // Build the relational path dynamically
    let pathParts = ['uploads', entityType, universitySlug]
    if (courseSlug) pathParts.push(courseSlug)
    if (subjectCode) pathParts.push(subjectCode)
    if (uploadType === 'document') pathParts.push('documents')
    
    // Sanitize parts
    const safePath = pathParts.map(p => p.replace(/[^a-zA-Z0-9_-]/g, '')).join('/')
    const safePrefix = filePrefix ? filePrefix.replace(/[^a-zA-Z0-9_-]/g, '') : 'file'

    // Final key
    const fileName = `${safePrefix}-${Date.now()}`
    const objectKey = `${safePath}/${fileName}.${ext}`

    // Upload to R2
    const teamMember = c.get('teamMember')
    await r2.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        uploadedBy: teamMember?.email || 'unknown',
        originalName: file.name,
      },
    })

    const workerOrigin = new URL(c.req.url).origin;
    const baseUrl = c.env.PUBLIC_R2_URL || `${workerOrigin}/api/media`;
    const finalUrl = `${baseUrl.replace(/\/+$/, '')}/${objectKey}`;

    return c.json({
      success: true,
      message: 'Image uploaded successfully.',
      data: { url: finalUrl }
    })
  } catch (error: any) {
    return c.json({
      success: false,
      message: 'Upload failed.',
      debug: error.message
    }, 500)
  }
})

const MAX_DOC_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_DOC_TYPES = new Set([
  'application/pdf',
  'video/mp4',
  'video/webm',
  'application/epub+zip',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml'
])

// POST /api/upload/document
router.post('/document', async (c) => {
  try {
    const r2 = c.env.BUCKET
    if (!r2) {
      return c.json({ success: false, message: 'R2 Bucket is not configured.' }, 500)
    }

    const formData = await c.req.parseBody()
    const file = formData.file as File | undefined
    const folder = (formData.folder as string) || 'documents'

    if (!file || file.size === 0) {
      return c.json({ success: false, message: 'No file provided.' }, 400)
    }

    if (file.size > MAX_DOC_SIZE) {
      return c.json({ success: false, message: `File too large. Maximum size is ${MAX_DOC_SIZE / 1024 / 1024}MB.` }, 413)
    }

    const mimeType = file.type?.toLowerCase() || ''
    if (!ALLOWED_DOC_TYPES.has(mimeType)) {
      return c.json({
        success: false,
        message: `Unsupported file type "${mimeType}". Allowed: PDF, MP4, WebM, EPUB, ZIP`
      }, 415)
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_')
    const objectKey = `${safeFolder}/${Date.now()}-${crypto.randomUUID()}.${ext}`

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
      message: 'Document uploaded successfully.',
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
