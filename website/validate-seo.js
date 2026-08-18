import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const websiteDir = path.resolve(__dirname)

const htmlFiles = [
  'index.html',
  'how-to-find-b-roll/index.html',
  'docs/index.html',
  'about/index.html',
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

console.log('--- 1. Testing HTML Files & Semantic Structure ---')
for (const relPath of htmlFiles) {
  const filePath = path.join(websiteDir, relPath)
  assert(fs.existsSync(filePath), `File exists: ${relPath}`)
  const content = fs.readFileSync(filePath, 'utf8')

  // Heading check: exactly one H1
  const h1Matches = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || []
  assert(h1Matches.length === 1, `${relPath} has exactly 1 <h1> tag (found ${h1Matches.length})`)

  // Landmarks check
  assert(content.includes('<main'), `${relPath} contains <main> landmark`)
  if (relPath !== '404.html') {
    assert(content.includes('<header class="site-nav"'), `${relPath} contains site-nav <header>`)
    assert(
      content.includes('<footer class="site-footer"'),
      `${relPath} contains site-footer <footer>`
    )
  }

  // Nav element accessibility in static HTML
  if (relPath !== '404.html') {
    const navMatch = content.match(/<nav[^>]*id=["']site-nav-menu["'][^>]*>/i)
    assert(navMatch !== null, `${relPath} has site-nav-menu nav element`)
    if (navMatch) {
      assert(!navMatch[0].includes('inert'), `${relPath} nav has NO static inert attribute`)
      assert(
        !navMatch[0].includes('aria-hidden="true"'),
        `${relPath} nav has NO static aria-hidden="true" attribute`
      )
    }
  }

  // Title tag
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  assert(
    titleMatch !== null && titleMatch[1].trim().length >= 10,
    `${relPath} has a descriptive title tag: "${titleMatch ? titleMatch[1].trim() : ''}"`
  )

  // Meta description
  const descMatch = content.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
  )
  assert(
    descMatch !== null && descMatch[1].length >= 30,
    `${relPath} has a valid meta description (${descMatch ? descMatch[1].length : 0} chars)`
  )

  // Meta robots
  const robotsMatch = content.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i)
  assert(robotsMatch !== null, `${relPath} has meta robots tag`)

  // Canonical tag (except 404)
  if (relPath !== '404.html') {
    const canonicalMatch = content.match(
      /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i
    )
    assert(
      canonicalMatch !== null && canonicalMatch[1].startsWith('https://stockfinderai.birol.tech/'),
      `${relPath} has valid canonical URL: ${canonicalMatch ? canonicalMatch[1] : 'none'}`
    )
  }

  // Preconnect tags for Core Web Vitals font loading speed
  if (relPath !== '404.html') {
    assert(
      content.includes('href="https://api.fontshare.com"'),
      `${relPath} has preconnect to api.fontshare.com`
    )
    assert(
      content.includes('href="https://fonts.googleapis.com"'),
      `${relPath} has preconnect to fonts.googleapis.com`
    )
    assert(
      content.includes('href="https://fonts.gstatic.com"'),
      `${relPath} has preconnect to fonts.gstatic.com`
    )
  }

  // Machine-readable AI alternate links (llms.txt & pricing.md)
  if (relPath !== '404.html') {
    assert(
      content.includes('href="https://stockfinderai.birol.tech/llms.txt"'),
      `${relPath} links to /llms.txt`
    )
    assert(
      content.includes('href="https://stockfinderai.birol.tech/pricing.md"'),
      `${relPath} links to /pricing.md`
    )
  }

  // Image alt and dimensions (CWV zero-layout-shift)
  const imgTags = content.match(/<img[^>]*>/gi) || []
  for (const imgTag of imgTags) {
    assert(
      imgTag.includes('alt="'),
      `${relPath} image has alt attribute: ${imgTag.substring(0, 60)}...`
    )
    assert(
      imgTag.includes('width="') && imgTag.includes('height="'),
      `${relPath} image has width and height attributes: ${imgTag.substring(0, 60)}...`
    )
  }

  // Check JSON-LD
  const jsonLdMatches = content.match(
    /<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi
  )
  if (jsonLdMatches) {
    for (const block of jsonLdMatches) {
      const jsonText = block
        .replace(/<script type=["']application\/ld\+json["']>/i, '')
        .replace(/<\/script>/i, '')
        .trim()
      try {
        const parsed = JSON.parse(jsonText)
        assert(
          typeof parsed === 'object' && parsed !== null,
          `${relPath} JSON-LD parses as valid JSON object`
        )
        if (parsed['@graph']) {
          assert(Array.isArray(parsed['@graph']), `${relPath} JSON-LD has @graph array`)
          const types = parsed['@graph'].map((e) => e['@type'])
          assert(types.length > 0, `${relPath} schema graph defines entities: ${types.join(', ')}`)
        }
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
  '/docs/',
  '/about/',
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
assert(
  robotsContent.includes('User-agent: Google-Extended'),
  'robots.txt allows Google Gemini / AI Overviews'
)
assert(robotsContent.includes('User-agent: GPTBot'), 'robots.txt allows GPTBot')
assert(robotsContent.includes('User-agent: ClaudeBot'), 'robots.txt allows ClaudeBot')
assert(robotsContent.includes('User-agent: PerplexityBot'), 'robots.txt allows PerplexityBot')
assert(!robotsContent.includes('Disallow: /pricing.md'), 'robots.txt does NOT disallow /pricing.md')
assert(!robotsContent.includes('Disallow: /llms.txt'), 'robots.txt does NOT disallow /llms.txt')
assert(
  robotsContent.includes('Sitemap: https://stockfinderai.birol.tech/sitemap.xml'),
  'robots.txt points to sitemap.xml'
)

const sitemapPath = path.join(websiteDir, 'sitemap.xml')
assert(fs.existsSync(sitemapPath), 'sitemap.xml exists')
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8')
assert(
  sitemapContent.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'),
  'sitemap.xml includes xmlns:xhtml namespace'
)
assert(
  sitemapContent.includes('<loc>https://stockfinderai.birol.tech/</loc>'),
  'sitemap.xml includes homepage'
)
assert(
  sitemapContent.includes('<loc>https://stockfinderai.birol.tech/how-to-find-b-roll/</loc>'),
  'sitemap.xml includes guide'
)
assert(
  sitemapContent.includes('<loc>https://stockfinderai.birol.tech/docs/</loc>'),
  'sitemap.xml includes docs'
)
assert(
  sitemapContent.includes('<loc>https://stockfinderai.birol.tech/about/</loc>'),
  'sitemap.xml includes about'
)
assert(
  sitemapContent.includes('<loc>https://stockfinderai.birol.tech/pricing/</loc>'),
  'sitemap.xml includes pricing'
)
assert(
  sitemapContent.includes('<loc>https://stockfinderai.birol.tech/privacy/</loc>'),
  'sitemap.xml includes privacy'
)
assert(
  sitemapContent.includes('<lastmod>2026-08-18</lastmod>'),
  'sitemap.xml has current lastmod 2026-08-18'
)

console.log('\n--- 4. Testing Machine-Readable GEO Files ---')
const llmsPath = path.join(websiteDir, 'llms.txt')
assert(fs.existsSync(llmsPath), 'llms.txt exists')
const llmsContent = fs.readFileSync(llmsPath, 'utf8')
assert(llmsContent.length > 500, 'llms.txt has substantial content')
assert(llmsContent.includes('2026-08-18'), 'llms.txt has current date 2026-08-18')

const pricingMdPath = path.join(websiteDir, 'pricing.md')
assert(fs.existsSync(pricingMdPath), 'pricing.md exists')
const pricingMdContent = fs.readFileSync(pricingMdPath, 'utf8')
assert(pricingMdContent.length > 300, 'pricing.md has substantial content')
assert(pricingMdContent.includes('2026-08-18'), 'pricing.md has current date 2026-08-18')

console.log(`\n========================================`)
console.log(`Validation finished: ${checks} checks run. ${errors} errors found.`)
console.log(`========================================`)

if (errors > 0) {
  process.exit(1)
}
