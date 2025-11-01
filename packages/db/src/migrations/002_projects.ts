import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Create project table
  await db.schema
    .createTable('project')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('github', 'jsonb')
    .addColumn('settings', 'jsonb')
    .addColumn('deployment', 'jsonb')
    .addColumn('sandbox', 'jsonb')
    .addColumn('metadata', 'jsonb')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
    .execute()

  // Index for listing projects by user
  await db.schema
    .createIndex('project_userId_idx')
    .on('project')
    .column('userId')
    .execute()

  // Create project_session table (separate from auth "session")
  await db.schema
    .createTable('chats')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('projectId', 'uuid', (col) => col.notNull().references('project.id'))
    .addColumn('agentSessionId', 'text')
    .addColumn('title', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('stats', 'jsonb')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
    .execute()

  // Index for listing chats by project
  await db.schema
    .createIndex('chats_projectId_idx')
    .on('chats')
    .column('projectId')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('chats').execute()
  await db.schema.dropTable('project').execute()
}
