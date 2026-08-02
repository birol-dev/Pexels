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
  const uniqueAssets = new Map<string, AttributionAssetInput>()
  for (const asset of assets) {
    if (!asset.pexelsId || !asset.photographer) continue
    uniqueAssets.set(asset.id, asset)
  }

  return {
    pexels: {
      url: 'https://www.pexels.com',
      creditText: 'Photos and videos provided by Pexels',
      logoUrl: 'https://images.pexels.com/lib/api/pexels.png'
    },
    usageNote:
      'Per Pexels API guidelines, credit photographers when possible and link back to Pexels.',
    assets: Array.from(uniqueAssets.values()).map((asset) => {
      // Always use the public Pexels page URL — asset.url is often a CDN
      // download variant and does not satisfy attribution linking guidelines.
      const pexelsUrl = buildPexelsAssetUrl(asset.type, asset.pexelsId)
      return {
        assetId: asset.id,
        type: asset.type,
        pexelsId: asset.pexelsId,
        pexelsUrl,
        photographer: asset.photographer,
        photographerUrl: asset.photographerUrl,
        creditLine: buildAssetCreditLine(asset.type, asset.photographer, asset.pexelsId)
      }
    })
  }
}
