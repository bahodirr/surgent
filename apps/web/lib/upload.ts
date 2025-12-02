export type FilePart = {
  type: "file"
  mime: string
  filename: string
  url: string
}

export type FileAttachment = {
  file: File
  preview?: string
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function filesToParts(attachments: FileAttachment[]): Promise<FilePart[]> {
  return Promise.all(
    attachments.map(async ({ file, preview }) => ({
      type: "file" as const,
      mime: file.type,
      filename: file.name,
      url: preview || await fileToDataUrl(file),
    }))
  )
}
