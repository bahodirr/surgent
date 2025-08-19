import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { Database as DatabaseInterface } from './types/db'

// Create PostgreSQL connection pool
const createPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    keepAlive: true,
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  })
}

// Create Kysely instance with PostgreSQL dialect
export const db = new Kysely<DatabaseInterface>({
  dialect: new PostgresDialect({
    pool: createPool(),
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