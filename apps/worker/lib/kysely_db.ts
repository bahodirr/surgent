import { Kysely } from 'kysely'
import { neon } from '@neondatabase/serverless'
import { NeonDialect } from 'kysely-neon'
import { Database as DatabaseInterface } from '@/types/db'

// Create Kysely instance with PostgreSQL dialect
export const db = new Kysely<DatabaseInterface>({
  dialect: new NeonDialect({
    neon: neon(process.env.DATABASE_URL!),
  }),
})

// Helper function to close the database connection
export const closeDatabase = async () => {
  try {
    await db.destroy()
    console.log('Database connection pool closed')
  } catch (error) {
    console.error('Error closing database connection:', error)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await closeDatabase()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await closeDatabase()
  process.exit(0)
}) 