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

function setNavOpen(open) {
  if (!navToggle || !navMenu) return
  navMenu.classList.toggle('is-open', open)
  navToggle.setAttribute('aria-expanded', String(open))
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  navMenu.setAttribute('aria-hidden', String(!open))
  if (open) {
    navMenu.removeAttribute('inert')
  } else {
    navMenu.setAttribute('inert', '')
  }
  document.body.classList.toggle('nav-open', open)
}

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    setNavOpen(!navMenu.classList.contains('is-open'))
  })

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setNavOpen(false))
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
      setNavOpen(false)
      navToggle.focus()
    }
  })

  window.matchMedia('(min-width: 1100px)').addEventListener('change', (e) => {
    if (e.matches) setNavOpen(false)
  })
}
