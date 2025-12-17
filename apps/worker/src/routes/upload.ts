import { Hono } from 'hono'
import type { AppContext } from '@/types/application'
import { requireAuth } from '../middleware/auth'

const upload = new Hono<AppContext>()

// POST /api/upload - Upload file to R2
upload.post('/', requireAuth, async (c) => {
  const user = c.get('user')!
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return c.json({ error: 'No file provided' }, 400)
  }

  console.log('[upload.post] start', {
    origin: new URL(c.req.url).origin,
    userId: user.id,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  })

  // Generate unique key: userId/timestamp-random-filename
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const key = `${user.id}/${timestamp}-${random}-${safeName}`

  console.log('[upload.post] key', { key })

  // Upload to R2
  await c.env.UPLOADS.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  })

  const head = await c.env.UPLOADS.head(key)
  console.log('[upload.post] stored', {
    key,
    head: head ? { size: head.size, httpEtag: head.httpEtag } : null,
    uploadsPublicUrl: c.env.UPLOADS_PUBLIC_URL,
  })

  // Public R2 URL (bucket has public access enabled)
  const publicBase = c.env.UPLOADS_PUBLIC_URL.replace(/\/$/, '')
  const publicUrl = `${publicBase}/${key}`

  return c.json({
    url: publicUrl,
    key,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  })
})

export default upload



