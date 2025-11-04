export interface Database {
  user: UserTable
  session: SessionTable
  account: AccountTable
  verification: VerificationTable
  project: ProjectTable
  chats: ChatsTable
}

export interface UserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface SessionTable {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  createdAt?: Date
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
  createdAt?: Date
  updatedAt?: Date
}

export interface VerificationTable {
  id: string
  identifier: string
  value: string
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}


export interface ProjectTable {
  id: string | null
  userId: string
  name: string
  github: any | null
  settings: any | null
  deployment: any | null
  sandbox: any | null
  metadata: any | null
  createdAt?: Date
  updatedAt?: Date
}

export interface ChatsTable {
  id: string | null
  projectId: string
  agentSessionId: string | null
  title: string | null
  metadata: any | null
  stats: any | null
  createdAt?: Date
  updatedAt?: Date
}
