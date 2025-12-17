export type FilePart = {
  type: "file"
  mime: string
  filename: string
  url: string
  size: number
}

export type UploadResult = {
  url: string
  size: number
}

export type UploadingAttachment = {
  id: string
  file: File
  preview?: string
  status: "uploading" | "done" | "error"
  url?: string
  size?: number
}

/** Convert file to data URL for local previews only */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/** Upload file to R2 and return url + size */
export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const base = process.env.NEXT_PUBLIC_BACKEND_URL
  const endpoint = base ? `${base}/api/upload` : '/api/upload'

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`)
  }

  const json = await res.json()
  return { url: json.url, size: json.size }
}

/** Format bytes to human readable size */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Convert uploaded attachments to FileParts for sending */
export function attachmentsToParts(attachments: UploadingAttachment[]): FilePart[] {
  return attachments
    .filter((a) => a.status === "done" && a.url)
    .map((a) => ({
      type: "file" as const,
      mime: a.file.type,
      filename: a.file.name,
      url: a.url!,
      size: a.size ?? a.file.size,
    }))
}
