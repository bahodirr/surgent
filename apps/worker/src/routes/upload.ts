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

  // Generate unique key: userId/timestamp-random-filename
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const key = `${user.id}/${timestamp}-${random}-${safeName}`

  // Upload to R2
  const bucket = c.env.UPLOADS as R2Bucket
  await bucket.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  })

  // Construct public URL
  // R2 public access URL pattern: https://<bucket>.<account>.r2.cloudflarestorage.com/<key>
  // Or custom domain if configured
  const publicUrl = `https://uploads.surgent.dev/${key}`

  return c.json({
    url: publicUrl,
    key,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  })
})

export default upload



