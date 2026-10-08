export interface Dimensions {
  width: number
  height: number
}

/** The size of the file a variant URL returns. */
export function variantDimensions(
  candidate: {
    type: 'photo' | 'video'
    width: number
    height: number
    variants: Array<{ url: string; width?: number; height?: number }>
  },
  variantUrl: string
): Dimensions {
  if (candidate.type === 'video') {
    const file = candidate.variants.find((v) => v.url === variantUrl)
    return file?.width && file?.height
      ? { width: file.width, height: file.height }
      : { width: candidate.width, height: candidate.height }
  }
  return photoVariantDimensions(candidate.width, candidate.height, variantUrl)
}

/**
 * Pexels photo variants encode their size in the query: `w`, `h`, `dpr`, and `fit=crop`.
 * `original` has no size parameters. Resizes keep the aspect ratio and don't upscale.
 */
export function photoVariantDimensions(
  sourceWidth: number,
  sourceHeight: number,
  url: string
): Dimensions {
  const query = new URL(url).searchParams
  const dpr = Number(query.get('dpr')) || 1
  const boxWidth = Number(query.get('w')) * dpr || undefined
  const boxHeight = Number(query.get('h')) * dpr || undefined
  if (!boxWidth && !boxHeight) return { width: sourceWidth, height: sourceHeight }
  if (query.get('fit') === 'crop' && boxWidth && boxHeight)
    return { width: boxWidth, height: boxHeight }
  const scale = Math.min(
    boxWidth ? boxWidth / sourceWidth : Infinity,
    boxHeight ? boxHeight / sourceHeight : Infinity,
    1
  )
  return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) }
}
