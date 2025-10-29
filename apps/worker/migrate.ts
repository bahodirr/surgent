import * as path from 'path'
import { promises as fs } from 'fs'
import { Migrator, FileMigrationProvider } from 'kysely'
import { db } from '@/lib/kysely_db'

async function runMigrations() {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // This needs to be an absolute path.
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  })

  const command = process.argv[2]

  let result
  if (command === 'down') {
    console.log('🔄 Rolling back latest migration...')
    result = await migrator.migrateDown()
  } else {
    console.log('🔄 Running migrations...')
    result = await migrator.migrateToLatest()
  }

  const { error, results } = result

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`✅ Migration "${it.migrationName}" was executed successfully`)
    } else if (it.status === 'Error') {
      console.error(`❌ Failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    console.error('💥 Failed to migrate')
    console.error(error)
    process.exit(1)
  }

  await db.destroy()
  console.log('🎉 Migration completed successfully')
}

runMigrations() 