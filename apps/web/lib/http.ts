import ky from 'ky'

export const http = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  retry: { limit: 2 },
})


