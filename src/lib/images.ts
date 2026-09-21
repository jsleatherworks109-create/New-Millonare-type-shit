export interface PreparedImage {
  mediaType: 'image/jpeg'
  data: string // base64, no data: prefix
  previewUrl: string
}

/** Downscales a photo to at most `maxSide` px and re-encodes as JPEG so uploads stay small. */
export async function prepareImage(file: File, maxSide = 1280): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`)
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // flatten transparent mockups onto white
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const previewUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: previewUrl.split(',')[1], previewUrl }
}
