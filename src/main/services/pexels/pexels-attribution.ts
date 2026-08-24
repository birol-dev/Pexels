export interface PexelsAssetAttribution {
  assetId: string
  type: 'photo' | 'video'
  pexelsId: number
  pexelsUrl: string
  photographer: string
  photographerUrl?: string
  creditLine: string
}

export interface PexelsManifestAttribution {
  pexels: {
    url: string
    creditText: string
    logoUrl: string
  }
  usageNote: string
  assets: PexelsAssetAttribution[]
}

interface AttributionAssetInput {
  id: string
  type: 'photo' | 'video'
  pexelsId: number
  url: string
  photographer: string
  photographerUrl?: string
}

export function buildPexelsAssetUrl(type: 'photo' | 'video', pexelsId: number): string {
  if (type === 'photo') {
    return `https://www.pexels.com/photo/${pexelsId}/`
  }
  return `https://www.pexels.com/video/${pexelsId}/`
}

export function buildAssetCreditLine(
  type: 'photo' | 'video',
  photographer: string,
  pexelsId: number
): string {
  const label = type === 'photo' ? 'Photo' : 'Video'
  return `${label} by ${photographer} on Pexels (ID ${pexelsId})`
}

export function buildManifestAttribution(
  assets: AttributionAssetInput[]
): PexelsManifestAttribution {
  const seenIds = new Set<string>()
  const attributionAssets: PexelsAssetAttribution[] = []

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]
    if (!asset.pexelsId || !asset.photographer || seenIds.has(asset.id)) continue
    seenIds.add(asset.id)

    attributionAssets.push({
      assetId: asset.id,
      type: asset.type,
      pexelsId: asset.pexelsId,
      pexelsUrl: buildPexelsAssetUrl(asset.type, asset.pexelsId),
      photographer: asset.photographer,
      photographerUrl: asset.photographerUrl,
      creditLine: buildAssetCreditLine(asset.type, asset.photographer, asset.pexelsId)
    })
  }

  return {
    pexels: {
      url: 'https://www.pexels.com',
      creditText: 'Photos and videos provided by Pexels',
      logoUrl: 'https://images.pexels.com/lib/api/pexels.png'
    },
    usageNote:
      'Per Pexels API guidelines, credit photographers when possible and link back to Pexels.',
    assets: attributionAssets
  }
}
