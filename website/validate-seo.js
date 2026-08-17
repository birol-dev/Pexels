const fs = require('fs')
const path = require('path')

const websiteDir = path.resolve(__dirname)

const htmlFiles = [
  'index.html',
  'how-to-find-b-roll/index.html',
  'pricing/index.html',
  'privacy/index.html',
  '404.html'
]

let errors = 0
let checks = 0

function assert(condition, message) {
  checks++
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    errors++
  } else {
    console.log(`✅ PASS: ${message}`)
  }
}

console.log('--- 1. Testing HTML Files & Nav Accessibility ---')
for (const relPath of htmlFiles) {
  const filePath = path.join(websiteDir, relPath)
  assert(fs.existsSync(filePath), `File exists: ${relPath}`)
  const content = fs.readFileSync(filePath, 'utf8')

  // Check nav element does not have inert or aria-hidden in static HTML (except 404 which has no nav)
  if (relPath !== '404.html') {
    const navMatch = content.match(/<nav[^>]*id=["']site-nav-menu["'][^>]*>/i)
    assert(navMatch !== null, `${relPath} has site-nav-menu nav element`)
    if (navMatch) {
      assert(!navMatch[0].includes('inert'), `${relPath} nav has NO static inert attribute`)
      assert(!navMatch[0].includes('aria-hidden="true"'), `${relPath} nav has NO static aria-hidden="true" attribute`)
    }
  }

  // Check JSON-LD
  const jsonLdMatches = content.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatches) {
    for (const block of jsonLdMatches) {
      const jsonText = block.replace(/<script type=["']application\/ld\+json["']>/i, '').replace(/<\/script>/i, '').trim()
      try {
        const parsed = JSON.parse(jsonText)
        assert(typeof parsed === 'object' && parsed !== null, `${relPath} JSON-LD parses as valid JSON object`)
      } catch (e) {
        assert(false, `${relPath} JSON-LD parsing error: ${e.message}`)
      }
    }
  }
}

console.log('\n--- 2. Testing Internal Link & Asset Targets ---')
const knownValidRoutes = new Set([
  '/',
  '/how-to-find-b-roll/',
  '/pricing/',
  '/privacy/',
  '/llms.txt',
  '/pricing.md',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/styles.css',
  '/site.js'
])

for (const relPath of htmlFiles) {
  const filePath = path.join(websiteDir, relPath)
  const content = fs.readFileSync(filePath, 'utf8')

  // Extract all href="/..."
  const hrefMatches = content.match(/href=["'](\/[^"'#\s]*)/g) || []
  for (const m of hrefMatches) {
    const rawUrl = m.replace(/^href=["']/, '')
    const cleanUrl = rawUrl.split('#')[0].split('?')[0]
    if (cleanUrl.startsWith('/logos/')) {
      const assetPath = path.join(websiteDir, cleanUrl)
      assert(fs.existsSync(assetPath), `${relPath} references existing asset: ${cleanUrl}`)
    } else if (cleanUrl) {
      assert(knownValidRoutes.has(cleanUrl), `${relPath} references valid route: ${cleanUrl}`)
    }
  }

  // Extract all src="/..."
  const srcMatches = content.match(/src=["'](\/[^"'#\s]*)/g) || []
  for (const m of srcMatches) {
    const rawUrl = m.replace(/^src=["']/, '')
    const cleanUrl = rawUrl.split('?')[0]
    const assetPath = path.join(websiteDir, cleanUrl)
    assert(fs.existsSync(assetPath), `${relPath} src references existing asset: ${cleanUrl}`)
  }
}

console.log('\n--- 3. Testing robots.txt and sitemap.xml ---')
const robotsPath = path.join(websiteDir, 'robots.txt')
assert(fs.existsSync(robotsPath), 'robots.txt exists')
const robotsContent = fs.readFileSync(robotsPath, 'utf8')
assert(robotsContent.includes('User-agent: Googlebot'), 'robots.txt explicitly allows Googlebot')
assert(robotsContent.includes('Sitemap: https://stockfinderai.birol.tech/sitemap.xml'), 'robots.txt points to sitemap.xml')

const sitemapPath = path.join(websiteDir, 'sitemap.xml')
assert(fs.existsSync(sitemapPath), 'sitemap.xml exists')
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8')
assert(sitemapContent.includes('<loc>https://stockfinderai.birol.tech/</loc>'), 'sitemap.xml includes homepage')
assert(sitemapContent.includes('<loc>https://stockfinderai.birol.tech/how-to-find-b-roll/</loc>'), 'sitemap.xml includes guide')
assert(sitemapContent.includes('<loc>https://stockfinderai.birol.tech/pricing/</loc>'), 'sitemap.xml includes pricing')
assert(sitemapContent.includes('<loc>https://stockfinderai.birol.tech/privacy/</loc>'), 'sitemap.xml includes privacy')
assert(sitemapContent.includes('<lastmod>2026-08-17</lastmod>'), 'sitemap.xml has current lastmod 2026-08-17')

console.log(`\n========================================`)
console.log(`Validation finished: ${checks} checks run. ${errors} errors found.`)
console.log(`========================================`)

if (errors > 0) {
  process.exit(1)
}
