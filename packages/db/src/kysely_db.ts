import { Kysely } from 'kysely'
import { neon } from '@neondatabase/serverless'
import { NeonDialect } from 'kysely-neon'
import type { Database as DatabaseInterface } from './types'


export const dialect = new NeonDialect({
  neon: neon(process.env.DATABASE_URL!),
})
// Create Kysely instance with PostgreSQL dialect
export const db = new Kysely<DatabaseInterface>({
  dialect,
})

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await db.destroy()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await db.destroy()
  process.exit(0)
}) 