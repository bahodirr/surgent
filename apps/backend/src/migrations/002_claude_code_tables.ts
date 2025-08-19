import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Create profiles table
  await db.schema
    .createTable('profiles')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Create projects table
  await db.schema
    .createTable('projects')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('profile_id', 'text', (col) => col.notNull().references('profiles.id').onDelete('cascade'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('github', 'jsonb')
    .addColumn('settings', 'jsonb')
    .addColumn('sandbox_id', 'text')
    .addColumn('sandbox_metadata', 'jsonb')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Create sessions table
  await db.schema
    .createTable('sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('messages', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Create commits table
  await db.schema
    .createTable('commits')
    .addColumn('sha', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('sessions.id').onDelete('cascade'))
    .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('message', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Create indexes
  await db.schema
    .createIndex('idx_profiles_user_id')
    .on('profiles')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('idx_projects_profile_id')
    .on('projects')
    .column('profile_id')
    .execute()

  await db.schema
    .createIndex('idx_sessions_project_id')
    .on('sessions')
    .column('project_id')
    .execute()

  await db.schema
    .createIndex('idx_commits_proj')
    .on('commits')
    .columns(['project_id', 'created_at desc'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_commits_proj').execute()
  await db.schema.dropIndex('idx_sessions_project_id').execute()
  await db.schema.dropIndex('idx_projects_profile_id').execute()
  await db.schema.dropIndex('idx_profiles_user_id').execute()

  // Drop tables
  await db.schema.dropTable('commits').execute()
  await db.schema.dropTable('sessions').execute()
  await db.schema.dropTable('projects').execute()
  await db.schema.dropTable('profiles').execute()
}