export interface ProjectSandbox {
  id?: string
  previewUrl?: string
  status?: string
  isInitialized?: boolean
  deployed?: boolean
}

export interface Project {
  id: string
  userId: string
  name: string
  github: any | null
  settings: any | null
  deployment: any | null
  sandbox: ProjectSandbox | null
  metadata: any | null
  createdAt: string
  updatedAt: string
}


