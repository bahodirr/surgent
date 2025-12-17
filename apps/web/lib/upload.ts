export type FilePart = {
  type: "file"
  mime: string
  filename: string
  url: string
}

export type UploadingAttachment = {
  id: string
  file: File
  preview?: string
  status: "uploading" | "done" | "error"
  url?: string
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

/** Upload file to R2 and return the public URL */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const base = process.env.NEXT_PUBLIC_BACKEND_URL
  const url = base ? `${base}/api/upload` : '/api/upload'

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`)
  }

  const json = await res.json()
  return json.url
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
    }))
}
