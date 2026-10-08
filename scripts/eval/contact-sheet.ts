import {
  formatShare,
  type ReportAsset,
  type ReportBeat,
  type RunInfo,
  type ScriptReport
} from './report.ts'

/**
 * The contact sheet: one static HTML page per run, for scoring relevance by eye. Every
 * beat shows its text and the thumbnails of the assets chosen for it, with good / ok /
 * bad buttons. The page has no external script or stylesheet; the only things it loads
 * are the thumbnails, from the Pexels CDN.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Asset URLs come from the Pexels API. Anything that is not plain https is left out. */
function httpsUrl(url: string): string | null {
  return /^https:\/\/[^\s"'<>]+$/.test(url) ? url : null
}

/** A path inside the run folder, as a relative link. */
function fileHref(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** JSON for a data block: `<` is escaped so the text cannot close its script element. */
function dataBlock(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

const STYLE = `
:root { color-scheme: light dark; --line: #8884; --muted: #777; --good: #2e9d57; --ok: #c98a12; --bad: #cf4444; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, 'Segoe UI', sans-serif; }
a { color: inherit; }
.bar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 20px; background: Canvas; border-bottom: 1px solid var(--line); }
.bar h1 { margin: 0; font-size: 16px; }
.bar .grow { flex: 1; }
.bar details { flex-basis: 100%; }
.bar textarea { width: 100%; height: 180px; font: 12px/1.4 ui-monospace, Consolas, monospace; }
main { max-width: 1200px; margin: 0 auto; padding: 0 20px 80px; }
nav { margin: 16px 0; font-size: 13px; }
nav a { margin-right: 12px; white-space: nowrap; }
.muted, figcaption { color: var(--muted); font-size: 13px; }
.script { margin-top: 40px; }
.script h2 { margin: 0 0 4px; font-size: 20px; }
.script h2 span { font-weight: normal; color: var(--muted); }
.errors { color: var(--bad); font-size: 13px; }
.beat { margin-top: 16px; padding: 12px 16px; border: 1px solid var(--line); border-left-width: 6px; border-radius: 6px; }
.beat[data-rated='good'] { border-left-color: var(--good); }
.beat[data-rated='ok'] { border-left-color: var(--ok); }
.beat[data-rated='bad'] { border-left-color: var(--bad); }
.beat header { display: flex; gap: 12px; align-items: center; }
.beat header strong { flex: 1; }
.beat p { margin: 6px 0; }
.text { font-size: 17px; }
button { font: inherit; padding: 4px 14px; border: 1px solid var(--line); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
button[aria-pressed='true'] { color: #fff; }
button[aria-pressed='true'][data-score='good'] { background: var(--good); border-color: var(--good); }
button[aria-pressed='true'][data-score='ok'] { background: var(--ok); border-color: var(--ok); }
button[aria-pressed='true'][data-score='bad'] { background: var(--bad); border-color: var(--bad); }
.thumbs { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
figure { margin: 0; width: 300px; }
figure img, .no-thumb { display: block; width: 300px; height: 190px; object-fit: contain; background: #8882; border-radius: 4px; }
.no-thumb { display: flex; align-items: center; justify-content: center; }
figure.failed img { opacity: 0.4; }
`

// Plain browser JavaScript, kept free of template placeholders and backslashes.
const SCRIPT = `
(function () {
  var meta = JSON.parse(document.getElementById('run-meta').textContent)
  var storageKey = 'stockfinder-eval:' + meta.run
  var scores = {}
  try {
    scores = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}
  } catch (error) {
    scores = {}
  }
  var beats = Array.prototype.slice.call(document.querySelectorAll('[data-beat]'))
  var output = document.getElementById('scores-json')
  var progress = document.getElementById('progress')
  var copyStatus = document.getElementById('copy-status')

  function scoreOf(beat) {
    var script = scores[beat.dataset.script]
    var score = script ? script[beat.dataset.beat] : null
    return score === 'good' || score === 'ok' || score === 'bad' ? score : null
  }

  function build() {
    var totals = { good: 0, ok: 0, bad: 0, unrated: 0 }
    var byScript = {}
    beats.forEach(function (beat) {
      var score = scoreOf(beat)
      var script = byScript[beat.dataset.script] || (byScript[beat.dataset.script] = {})
      script[beat.dataset.beat] = score
      totals[score || 'unrated']++
    })
    return {
      run: meta.run,
      provider: meta.provider,
      model: meta.model,
      engine: meta.engine,
      commit: meta.commit,
      scoredAt: new Date().toISOString(),
      totals: totals,
      scores: byScript
    }
  }

  function render() {
    beats.forEach(function (beat) {
      var score = scoreOf(beat)
      beat.dataset.rated = score || ''
      Array.prototype.forEach.call(beat.querySelectorAll('button[data-score]'), function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.score === score))
      })
    })
    var result = build()
    var totals = result.totals
    progress.textContent =
      beats.length - totals.unrated + ' of ' + beats.length + ' beats scored: ' +
      totals.good + ' good, ' + totals.ok + ' ok, ' + totals.bad + ' bad'
    output.value = JSON.stringify(result, null, 2)
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('button[data-score]') : null
    if (!button) return
    var beat = button.closest('[data-beat]')
    var script = scores[beat.dataset.script] || (scores[beat.dataset.script] = {})
    if (script[beat.dataset.beat] === button.dataset.score) {
      delete script[beat.dataset.beat]
    } else {
      script[beat.dataset.beat] = button.dataset.score
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(scores))
    } catch (error) {
      // Without storage the scores live in the page until it is closed.
    }
    copyStatus.textContent = ''
    render()
  })

  document.getElementById('copy-scores').addEventListener('click', function () {
    render()
    function done(copied) {
      copyStatus.textContent = copied
        ? 'Copied. Save it as scores.json in this folder.'
        : 'The clipboard is not available. Copy the text under "Scores as JSON" by hand.'
    }
    function fallback() {
      document.getElementById('scores-details').open = true
      output.focus()
      output.select()
      var copied = false
      try {
        copied = document.execCommand('copy')
      } catch (error) {
        copied = false
      }
      done(copied)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(output.value).then(function () {
        done(true)
      }, fallback)
    } else {
      fallback()
    }
  })

  render()
})()
`

function renderAsset(asset: ReportAsset): string {
  const thumbnail = httpsUrl(asset.thumbnailUrl)
  const page = httpsUrl(asset.pageUrl)
  const label = `${asset.type} ${asset.pexelsId} by ${asset.photographer}`
  const image = thumbnail
    ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="no-thumb muted">no thumbnail</span>`
  // The picture opens the downloaded file when there is one, otherwise the Pexels page.
  const target = asset.file ? fileHref(asset.file) : page
  const linked = target
    ? `<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${image}</a>`
    : image

  const facts = [
    asset.type,
    `${asset.width}×${asset.height}`,
    ...(typeof asset.duration === 'number' ? [`${asset.duration} s`] : []),
    asset.status,
    ...(asset.error ? [asset.error] : [])
  ]
  const source = page
    ? ` · <a href="${escapeHtml(page)}" target="_blank" rel="noopener noreferrer">Pexels page</a>`
    : ''
  const query = asset.query ? `<br>found with "${escapeHtml(asset.query)}"` : ''

  return [
    `<figure class="${asset.status === 'completed' ? 'done' : 'failed'}">`,
    linked,
    `<figcaption>${escapeHtml(facts.join(' · '))}${source}${query}</figcaption>`,
    '</figure>'
  ].join('')
}

function renderBeat(scriptId: string, beat: ReportBeat, index: number): string {
  const queries = beat.searchQueries.map((query) => `"${query}"`).join(', ')
  return [
    `<article class="beat" data-script="${escapeHtml(scriptId)}" data-beat="${escapeHtml(beat.id)}" data-rated="">`,
    '<header>',
    `<strong>Beat ${index + 1}</strong>`,
    '<button type="button" data-score="good" aria-pressed="false">Good</button>',
    '<button type="button" data-score="ok" aria-pressed="false">Ok</button>',
    '<button type="button" data-score="bad" aria-pressed="false">Bad</button>',
    '</header>',
    `<p class="text">${escapeHtml(beat.text)}</p>`,
    beat.visualPrompt ? `<p class="muted">Visual prompt: ${escapeHtml(beat.visualPrompt)}</p>` : '',
    queries ? `<p class="muted">Searched: ${escapeHtml(queries)}</p>` : '',
    beat.assets.length > 0
      ? `<div class="thumbs">${beat.assets.map(renderAsset).join('')}</div>`
      : '<p class="muted">No asset was chosen for this beat.</p>',
    '</article>'
  ].join('\n')
}

function renderScript(report: ScriptReport): string {
  const { script, metrics, job } = report
  const facts = [
    script.platform,
    script.mix,
    script.inputMode === 'idea' ? 'idea mode' : null,
    script.avoidPeople ? 'avoid people' : null,
    job.timedOut ? `${job.status} (timed out)` : job.status,
    `coverage ${formatShare(metrics.coverage)}`,
    `duplicates ${metrics.duplicates.count}`,
    `orientation ${formatShare(metrics.orientationMatch)}`,
    `${Math.round(metrics.seconds)} s`
  ].filter((fact): fact is string => fact !== null)

  return [
    `<section class="script" id="${escapeHtml(script.id)}">`,
    `<h2>${escapeHtml(script.id)} <span>${escapeHtml(script.title)}</span></h2>`,
    `<p class="muted">${escapeHtml(facts.join(' · '))}</p>`,
    script.about ? `<p class="muted">${escapeHtml(script.about)}</p>` : '',
    ...job.errors.map((error) => `<p class="errors">${escapeHtml(error)}</p>`),
    report.beats.length > 0
      ? report.beats.map((beat, index) => renderBeat(script.id, beat, index)).join('\n')
      : '<p class="muted">The job produced no beats.</p>',
    '</section>'
  ].join('\n')
}

/** The whole contact sheet of a run, as one HTML document. */
export function renderContactSheet(run: RunInfo, reports: ScriptReport[]): string {
  const meta = {
    run: run.id,
    provider: run.provider,
    model: run.model,
    engine: run.engine.effective,
    commit: run.commit
  }
  const links = reports
    .map(
      (report) => `<a href="#${escapeHtml(report.script.id)}">${escapeHtml(report.script.id)}</a>`
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contact sheet ${escapeHtml(run.id)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="bar">
<h1>Contact sheet ${escapeHtml(run.id)}</h1>
<span class="muted">${escapeHtml(`${run.provider} / ${run.model} · ${run.engine.effective}`)}</span>
<span class="grow"></span>
<span id="progress" class="muted"></span>
<button type="button" id="copy-scores">Copy scores</button>
<span id="copy-status" class="muted" role="status"></span>
<details id="scores-details">
<summary class="muted">Scores as JSON</summary>
<textarea id="scores-json" readonly spellcheck="false" aria-label="Scores as JSON"></textarea>
</details>
</div>
<main>
<p class="muted">Score each beat on one question: does the footage fit what the narration says? Click a score again to clear it. Scores are kept in this browser; "Copy scores" puts them on the clipboard as JSON for scores.json.</p>
<nav>
${links}
</nav>
${reports.map(renderScript).join('\n')}
</main>
<script type="application/json" id="run-meta">${dataBlock(meta)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`
}
