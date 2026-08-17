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
