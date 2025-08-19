import {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely'

export interface Database {
  user: UserTable
  session: SessionTable
  account: AccountTable
  verification: VerificationTable
  profiles: ProfilesTable
  projects: ProjectsTable
  sessions: SessionsTable
  commits: CommitsTable
}

// Better Auth Tables

export interface UserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}

export interface SessionTable {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AccountTable {
  id: string
  userId: string
  accountId: string
  providerId: string
  accessToken: string | null
  refreshToken: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  scope: string | null
  idToken: string | null
  password: string | null
  createdAt: Date
  updatedAt: Date
}

export interface VerificationTable {
  id: string
  identifier: string
  value: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

// Claude Code Tables

export interface ProfilesTable {
  id: string
  user_id: string
  metadata: JSONColumnType<any> | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ProjectsTable {
  id: Generated<string>
  profile_id: string
  name: string
  github: JSONColumnType<any> | null
  settings: JSONColumnType<any> | null
  sandbox_id: string | null
  sandbox_metadata: JSONColumnType<any> | null
  metadata: JSONColumnType<any> | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface SessionsTable {
  id: Generated<string>
  project_id: string
  title: string | null
  metadata: JSONColumnType<any> | null
  messages: JSONColumnType<any>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface CommitsTable {
  sha: string
  session_id: string
  project_id: string
  message: string | null
  metadata: JSONColumnType<any> | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// Helper types

export type User = Selectable<UserTable>
export type NewUser = Insertable<UserTable>
export type UserUpdate = Updateable<UserTable>

export type Session = Selectable<SessionTable>
export type NewSession = Insertable<SessionTable>
export type SessionUpdate = Updateable<SessionTable>

export type Account = Selectable<AccountTable>
export type NewAccount = Insertable<AccountTable>
export type AccountUpdate = Updateable<AccountTable>

export type Verification = Selectable<VerificationTable>
export type NewVerification = Insertable<VerificationTable>
export type VerificationUpdate = Updateable<VerificationTable>

export type Profile = Selectable<ProfilesTable>
export type NewProfile = Insertable<ProfilesTable>
export type ProfileUpdate = Updateable<ProfilesTable>

export type Project = Selectable<ProjectsTable>
export type NewProject = Insertable<ProjectsTable>
export type ProjectUpdate = Updateable<ProjectsTable>

export type ClaudeSession = Selectable<SessionsTable>
export type NewClaudeSession = Insertable<SessionsTable>
export type ClaudeSessionUpdate = Updateable<SessionsTable>

export type Commit = Selectable<CommitsTable>
export type NewCommit = Insertable<CommitsTable>
export type CommitUpdate = Updateable<CommitsTable>