document.documentElement.classList.add('js')

const reveals = document.querySelectorAll('.reveal')
if ('IntersectionObserver' in window && reveals.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  )
  reveals.forEach((el) => observer.observe(el))
} else {
  reveals.forEach((el) => el.classList.add('visible'))
}

const navToggle = document.getElementById('nav-toggle')
const navMenu = document.getElementById('site-nav-menu')

const isMobileNav = () => window.matchMedia('(max-width: 1099px)').matches

function syncNavState() {
  if (!navToggle || !navMenu) return
  if (!isMobileNav()) {
    navMenu.classList.remove('is-open')
    navMenu.removeAttribute('aria-hidden')
    navMenu.removeAttribute('inert')
    navToggle.setAttribute('aria-expanded', 'false')
    navToggle.setAttribute('aria-label', 'Open menu')
    document.body.classList.remove('nav-open')
  }
}

function setNavOpen(open) {
  if (!navToggle || !navMenu) return
  navMenu.classList.toggle('is-open', open)
  navToggle.setAttribute('aria-expanded', String(open))
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  if (isMobileNav()) {
    navMenu.setAttribute('aria-hidden', String(!open))
    if (open) {
      navMenu.removeAttribute('inert')
    } else {
      navMenu.setAttribute('inert', '')
    }
  } else {
    navMenu.removeAttribute('aria-hidden')
    navMenu.removeAttribute('inert')
  }
  document.body.classList.toggle('nav-open', open)
}

if (navToggle && navMenu) {
  syncNavState()

  navToggle.addEventListener('click', () => {
    setNavOpen(!navMenu.classList.contains('is-open'))
  })

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (isMobileNav()) {
        setNavOpen(false)
      }
    })
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
      setNavOpen(false)
      navToggle.focus()
    }
  })

  window.matchMedia('(min-width: 1100px)').addEventListener('change', (e) => {
    if (e.matches) {
      syncNavState()
    }
  })
}

// Carousels — progressive enhancement over a scroll-snap track
document.querySelectorAll('[data-carousel]').forEach((root) => {
  const viewport = root.querySelector('[data-carousel-viewport]')
  const track = viewport && viewport.querySelector('.pain-track')
  const prev = root.querySelector('[data-carousel-prev]')
  const next = root.querySelector('[data-carousel-next]')
  const dotsBox = root.querySelector('[data-carousel-dots]')
  if (!viewport || !track || !dotsBox) return

  const cards = Array.from(track.children)
  if (cards.length < 2) return

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const behavior = () => (reduceMotion.matches ? 'auto' : 'smooth')
  const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0
  const step = () => cards[0].getBoundingClientRect().width + gap()
  const perView = () => Math.max(1, Math.round(viewport.clientWidth / step()))
  const pageCount = () => Math.max(1, Math.ceil(cards.length / perView()))
  const leftOf = (card) => card.offsetLeft - cards[0].offsetLeft
  const currentPage = () =>
    Math.min(pageCount() - 1, Math.round(viewport.scrollLeft / (step() * perView())))

  let dots = []
  let frame = 0

  const goTo = (page) => {
    const clamped = Math.max(0, Math.min(pageCount() - 1, page))
    const card = cards[Math.min(clamped * perView(), cards.length - 1)]
    viewport.scrollTo({ left: leftOf(card), behavior: behavior() })
  }

  const buildDots = (count) => {
    dotsBox.textContent = ''
    dots = []
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'carousel-dot'
      dot.setAttribute('aria-label', `Show pain points ${i + 1} of ${count}`)
      dot.addEventListener('click', () => goTo(i))
      dotsBox.appendChild(dot)
      dots.push(dot)
    }
  }

  const sync = () => {
    const count = pageCount()
    if (dots.length !== count) buildDots(count)

    const active = currentPage()
    dots.forEach((dot, i) => {
      dot.setAttribute('aria-current', i === active ? 'true' : 'false')
    })

    const maxScroll = viewport.scrollWidth - viewport.clientWidth
    const atStart = viewport.scrollLeft <= 1
    const atEnd = viewport.scrollLeft >= maxScroll - 1

    if (prev) prev.disabled = atStart
    if (next) next.disabled = atEnd

    root.classList.toggle('can-prev', !atStart)
    root.classList.toggle('can-next', !atEnd)
  }

  const scheduleSync = () => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      sync()
    })
  }

  viewport.addEventListener('scroll', scheduleSync, { passive: true })
  if (prev) prev.addEventListener('click', () => goTo(currentPage() - 1))
  if (next) next.addEventListener('click', () => goTo(currentPage() + 1))

  window.addEventListener('resize', scheduleSync)
  if ('ResizeObserver' in window) {
    new ResizeObserver(scheduleSync).observe(track)
  }

  sync()
})

// Hero loop: honour reduced motion and give people a way to stop it
const heroVideo = document.querySelector('.hero-video')
const heroToggle = document.querySelector('[data-video-toggle]')
if (heroVideo && heroToggle) {
  const label = () => {
    heroToggle.textContent = heroVideo.paused ? 'Play video' : 'Pause video'
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    heroVideo.removeAttribute('autoplay')
    heroVideo.pause()
  }

  heroToggle.addEventListener('click', () => {
    if (heroVideo.paused) {
      heroVideo.play().catch(() => {})
    } else {
      heroVideo.pause()
    }
  })
  heroVideo.addEventListener('play', label)
  heroVideo.addEventListener('pause', label)
  label()
}

// "Try the first step" — the preview window follows what people type
const trial = document.querySelector('[data-trial]')
if (trial) {
  const titleInput = trial.querySelector('[data-trial-title]')
  const lineInput = trial.querySelector('[data-trial-line]')
  const platforms = trial.querySelectorAll('input[name="platform"]')
  const win = trial.querySelector('[data-trial-window]')
  const outTitle = trial.querySelector('[data-out-title]')
  const outLine = trial.querySelector('[data-out-line]')
  const outQuery = trial.querySelector('[data-out-query]')
  const outMeta = trial.querySelector('[data-out-meta]')
  const thumbBox = trial.querySelector('[data-out-thumbs]')
  const thumbs = thumbBox ? Array.from(thumbBox.querySelectorAll('img')) : []

  const photo = (id) =>
    `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=320`

  // A few themes the sample run already found; anything else shows the searching state.
  const themes = [
    {
      test: /\b(dog|dogs|pupp\w*|leash|walk\w*|park)\b/,
      query: 'dog on a leash, sunny walk',
      ids: [12031035, 37467772, 13239212]
    },
    {
      test: /\b(coffee|cafe|café|latte|breakfast|morning|cup)\b/,
      query: 'two coffee cups, sunlit table',
      ids: [35835482, 31711944, 36891346]
    },
    {
      test: /\b(market|fruit\w*|food|lunch|dinner|eat\w*|table|cook\w*)\b/,
      query: 'fresh food, long table, candid',
      ids: [7618446, 8841463, 27173521]
    },
    {
      test: /\b(beach|sea|ocean|summer|laugh\w*|friends?|fun)\b/,
      query: 'friends laughing, candid, bright daylight',
      ids: [9974379, 3727558, 9353806]
    },
    {
      test: /\b(bike|bikes|cycl\w*|city|street|ride|commute)\b/,
      query: 'cyclists, summer street, afternoon light',
      ids: [36109030, 29210892, 33635057]
    },
    {
      test: /\b(sunset|sunrise|gold\w*|evening|light|sky|night)\b/,
      query: 'friends at sunset, warm light',
      ids: [8696275, 1066201, 17257615]
    },
    {
      test: /\b(bed|sleep\w*|wake|waking|alarm|home|quiet|slow\w*)\b/,
      query: 'morning sun through curtains, waking slowly',
      ids: [17371465, 29623051, 38453692]
    }
  ]

  const stop = new Set(
    'a an the and or but of to in on at for with from by is are was were be it its this that then than so as just my your our their his her we you i me us they them'.split(
      ' '
    )
  )

  const fallbackQuery = (line) => {
    const words = line
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w))
    return words.length ? `${words.slice(0, 4).join(' ')}, natural light` : ''
  }

  let lastTheme = null

  const render = () => {
    const title = titleInput.value.trim() || 'Untitled project'
    const line = lineInput.value.trim()
    outTitle.textContent = title

    const checked = trial.querySelector('input[name="platform"]:checked')
    if (checked) {
      win.style.setProperty('--ar', checked.value)
      outMeta.textContent = checked.dataset.label
    }

    if (!line) {
      outLine.textContent = 'Paste a line to see its beat'
      outQuery.textContent = 'query · waiting for your script'
      thumbBox.classList.add('is-ghost')
      lastTheme = null
      return
    }

    outLine.textContent = line
    const lower = line.toLowerCase()
    const theme = themes.find((t) => t.test.test(lower))
    if (theme) {
      outQuery.textContent = `query · ${theme.query}`
      if (theme !== lastTheme) {
        thumbs.forEach((img, i) => {
          img.src = photo(theme.ids[i])
        })
      }
      thumbBox.classList.remove('is-ghost')
    } else {
      outQuery.textContent = `query · ${fallbackQuery(line) || 'reading your line'} — searching Pexels…`
      thumbBox.classList.add('is-ghost')
    }
    lastTheme = theme || null
  }

  titleInput.addEventListener('input', render)
  lineInput.addEventListener('input', render)
  platforms.forEach((input) => input.addEventListener('change', render))
  render()
}
