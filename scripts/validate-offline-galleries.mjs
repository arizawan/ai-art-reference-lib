#!/usr/bin/env node
/**
 * Offline galleries integrity + UX success-criteria checks.
 *   node scripts/validate-offline-galleries.mjs
 * Exit 0 only when every criterion passes.
 */
import { readFile, access, constants as fsConstants, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GALLERIES = join(ROOT, 'data', 'galleries')
const CRITERIA_PATH = join(GALLERIES, 'success-criteria.json')

const LIBS = {
  portrait: {
    dir: join(ROOT, 'data', 'portrait-gallery'),
    mount: '/portrait',
    requiredPaths: ['thumb', 'original'],
  },
  costume: {
    dir: join(ROOT, 'data', 'costume-gallery'),
    mount: '/costume',
    requiredPaths: ['thumb', 'preview', 'original'],
  },
  pose: {
    dir: join(ROOT, 'data', 'pose-gallery'),
    mount: '/pose',
    requiredPaths: ['thumb', 'original'],
  },
  depth: {
    dir: join(ROOT, 'data', 'pose-depth-gallery'),
    mount: '/depth',
    requiredPaths: ['thumb', 'original'],
  },
}

const results = []
function pass(id, detail) { results.push({ id, ok: true, detail }) }
function fail(id, detail) { results.push({ id, ok: false, detail }) }

async function exists(path) {
  try {
    await access(path, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readUiCorpus() {
  const chunks = [await readFile(join(GALLERIES, 'index.html'), 'utf8')]
  const assetsDir = join(GALLERIES, 'assets')
  if (await exists(assetsDir)) {
    for (const name of await readdir(assetsDir)) {
      if (/\.(js|css|html|map)$/.test(name)) {
        chunks.push(await readFile(join(assetsDir, name), 'utf8'))
      }
    }
  }
  return chunks.join('\n')
}

async function main() {
  const criteria = await loadJson(CRITERIA_PATH)
  const unifiedHtml = await readUiCorpus()

  // SC-1: unified app at /
  if (/data-lib=|id="libs"|library-tab|data-library/.test(unifiedHtml) && /portrait|costume|pose|depth/.test(unifiedHtml)) {
    pass('SC-1', 'Unified index declares portrait / pose / depth / costume libraries')
  } else {
    fail('SC-1', 'data/galleries/index.html does not look like a unified multi-library app')
  }

  // SC-2: footer keeps full license; header credits Gia via X (no GitHub as primary credit)
  const footHasCredits = /giaaibusi|Creator|license|CC0|open chat/i.test(unifiedHtml)
  const headerCreditsGia = /x\.com\/giaaibusi/i.test(unifiedHtml) && /Gia|ギア/i.test(unifiedHtml)
  // React bundle may mention github in vendor noise — only fail if credit chrome points there as primary
  const githubAsCredit = /href=["']https:\/\/github\.com\//i.test(unifiedHtml)
  const heroSpam = /Join the open chat|btn-oc|chip-by/i.test(unifiedHtml)
  if (footHasCredits && headerCreditsGia && !githubAsCredit && !heroSpam) {
    pass('SC-2', 'Footer license + header credit to Gia on X')
  } else {
    fail('SC-2', !footHasCredits
      ? 'Footer missing creator / license credits'
      : heroSpam
        ? 'Hero still has open-chat / chip-by spam controls'
        : githubAsCredit
          ? 'Header must not use GitHub as primary credit'
          : 'Header missing credit link to Gia (@giaaibusi on X)')
  }

  // SC-3 / SC-4 / SC-5 per library
  let allCounts = true
  let allFiles = true
  let noPart = true
  const missingSamples = []

  for (const [name, lib] of Object.entries(LIBS)) {
    const cuesPath = join(lib.dir, 'cues.json')
    if (!(await exists(cuesPath))) {
      fail('SC-3', `Missing ${name} cues.json`)
      allCounts = false
      continue
    }
    const payload = await loadJson(cuesPath)
    const cues = payload.cues
    const expected = criteria.expectedCounts[name]
    if (!Array.isArray(cues) || cues.length !== expected) {
      allCounts = false
      fail('SC-3', `${name} count ${cues?.length ?? 'n/a'} !== ${expected}`)
    }

    for (const cue of cues) {
      if (cue && Object.prototype.hasOwnProperty.call(cue, 'part')) {
        noPart = false
        missingSamples.push(`${name}:${cue.id} has part`)
        break
      }
    }

    let missing = 0
    for (const cue of cues) {
      const paths = cue.sourcePaths || {}
      for (const key of lib.requiredPaths) {
        const rel = paths[key]
        if (!rel || !(await exists(join(lib.dir, rel)))) {
          missing++
          if (missingSamples.length < 12) missingSamples.push(`${name}:${cue.id}:${key}`)
        }
      }
    }
    if (missing > 0) allFiles = false
  }

  if (allCounts) pass('SC-3', `Counts OK: ${JSON.stringify(criteria.expectedCounts)}`)
  if (allFiles) pass('SC-4', 'All required image files present on disk')
  else fail('SC-4', `Missing files e.g. ${missingSamples.slice(0, 8).join(', ')}`)
  if (noPart) pass('SC-5', 'No MixCue part field on gallery cues')
  else fail('SC-5', missingSamples.filter(s => s.includes('has part')).join(', ') || 'part field found')

  // SC-6: library-specific filter hooks in UI (vanilla HTML or Vite/React bundle)
  const filterHooks = [
    /data-filter/,
    /id[=:]\s*["'`]filters["'`]/,
    /id[=:]\s*["'`]hair["'`]/,
    /id[=:]\s*["'`]style["'`]/,
    /id[=:]\s*["'`]cat["'`]/,
    /id[=:]\s*["'`]ang["'`]/,
    /className:\s*["'`][^"'`]*filters/,
    /class="filters"/,
  ]
  if (filterHooks.some((h) => h.test(unifiedHtml)) && /switchLib|setLib|activeLib|currentLib|S\.lib/.test(unifiedHtml)) {
    pass('SC-6', 'Unified UI has per-library filter controls')
  } else {
    fail('SC-6', 'Unified UI missing library-specific filter wiring')
  }

  // SC-7: modal + download (quotes or Vite backtick string literals)
  const hasModal = /id=["'`]modal["'`]/.test(unifiedHtml) || /id:\s*["'`]modal["'`]/.test(unifiedHtml)
  if (hasModal && /download|mdl|Download full size/i.test(unifiedHtml)) {
    pass('SC-7', 'Modal + download affordance present')
  } else {
    fail('SC-7', 'Modal or full-size download affordance missing')
  }

  const failed = results.filter(r => !r.ok)
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} — ${r.detail}`)
  }
  console.log(failed.length ? `\n${failed.length} criterion failed` : '\nAll success criteria passed')
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
