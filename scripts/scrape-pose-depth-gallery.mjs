#!/usr/bin/env node
/**
 * Mirror POSE-DB-02 depth gallery (Gia) into data/pose-depth-gallery/.
 * Resumable: skips files that already exist with size > 0.
 *
 *   node scripts/scrape-pose-depth-gallery.mjs          # metadata + download
 *   node scripts/scrape-pose-depth-gallery.mjs --meta   # cues.json only
 *   node scripts/scrape-pose-depth-gallery.mjs --status
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'pose-depth-gallery')
const SOURCE = 'https://ai-pose-depth-gallery.pages.dev'
const INDEX_URL = `${SOURCE}/index.json`
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CONCURRENCY = 6

const LINE = {
  '全身1人・セクシー系': { line: 'full-sexy', lineLabel: 'Full body · sexy' },
  '全身1人・標準系': { line: 'full-standard', lineLabel: 'Full body · standard' },
  '上半身1人': { line: 'upper-body', lineLabel: 'Upper body' },
  '2人絡み': { line: 'two-person', lineLabel: 'Two person' },
}
const ANGLE = {
  '正面': 'front',
  '上から': 'high',
  '下から': 'low',
  '横': 'side',
  '斜め': 'diagonal',
}
const CLASS = {
  '立ち': 'Standing',
  '座り': 'Sitting',
  '寝そべり': 'Lying',
  '膝立ち': 'Kneeling',
  '膝立ち・四つん這い': 'Kneeling / all fours',
  'しゃがみ': 'Squatting',
  '前かがみ': 'Bent forward',
  '特殊': 'Special',
  '密着': 'Close contact',
  '座位': 'Seated',
  '座位密着': 'Seated close',
  '立位': 'Standing position',
  '立位密着': 'Standing close',
  '対面座位': 'Face-to-face seated',
  '背面座位': 'Rear seated',
  '側位': 'Side position',
  '後背位': 'Rear entry',
  '正常位': 'Missionary',
  '騎乗位': 'Cowgirl',
  '横座り・女の子座り': 'Side sit / girl sit',
  'のけぞり・反り': 'Arch / lean back',
  'ひねり': 'Twist',
  '胸寄せ・谷間強調系': 'Chest push / cleavage',
  '顔寄せ系': 'Face close',
  'かわいい系': 'Cute',
  'セクシー・露骨寄り系': 'Sexy / explicit-leaning',
}

function log(obj) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...obj }))
}

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function downloadFile(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 0) return 'skip'
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(180_000) })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  const { renameSync, unlinkSync } = await import('node:fs')
  renameSync(tmp, dest)
  return 'ok'
}

function buildCues(items, poseById) {
  const lines = {}
  const cues = items.map((it) => {
    const map = LINE[it['系統']] || { line: 'unknown', lineLabel: it['系統'] }
    lines[map.line] = (lines[map.line] || 0) + 1
    const angle = ANGLE[it['アングル']] || it['アングル']
    const pose = poseById.get(it.id)
    const label = pose?.label || it['ポーズ名']
    const classification = pose?.classification || CLASS[it['分類']] || it['分類']
    const tags = pose?.tags || [map.line, angle, classification, (it['ポーズ番号'] || '').toLowerCase()].filter(Boolean)
    return {
      id: it.id,
      label,
      text: label,
      line: map.line,
      lineJa: it['系統'],
      lineLabel: map.lineLabel,
      poseNumber: it['ポーズ番号'],
      classification,
      classificationJa: it['分類'],
      angle,
      angleJa: it['アングル'],
      tags,
      images: {
        thumb: `${SOURCE}/${it['サムネ']}`,
        original: `${SOURCE}/${it['原寸']}`,
      },
      sourcePaths: {
        thumb: it['サムネ'],
        original: it['原寸'],
      },
    }
  })
  return {
    source: `${SOURCE}/`,
    sourceTitle: 'depthポーズ集 POSE-DB-02',
    sourceNote: 'Grey mannequin depth maps (white = near). Open public reference gallery by Gia (@giaaibusi); credit the creator when republishing.',
    scrapedAt: new Date().toISOString(),
    total: cues.length,
    poseCount: new Set(cues.map((c) => `${c.line}|${c.poseNumber}`)).size,
    lines,
    cues,
  }
}

async function mapPool(items, limit, fn) {
  let i = 0
  let ok = 0
  let skip = 0
  let fail = 0
  const workers = Array.from({ length: limit }, async () => {
    for (;;) {
      const idx = i++
      if (idx >= items.length) return
      const item = items[idx]
      try {
        const r = await fn(item)
        if (r === 'skip') skip += 1
        else ok += 1
      } catch (e) {
        fail += 1
        log({ step: 'fail', id: item.id, path: item.path, error: e instanceof Error ? e.message : String(e) })
      }
      if ((ok + skip + fail) % 50 === 0) log({ step: 'progress', ok, skip, fail, left: items.length - ok - skip - fail })
    }
  })
  await Promise.all(workers)
  return { ok, skip, fail }
}

async function main() {
  const args = process.argv.slice(2)
  const metaOnly = args.includes('--meta')
  const statusOnly = args.includes('--status')

  mkdirSync(OUT, { recursive: true })
  mkdirSync(join(OUT, 'img'), { recursive: true })
  mkdirSync(join(OUT, 'thumbs'), { recursive: true })

  if (statusOnly) {
    const cuesPath = join(OUT, 'cues.json')
    if (!existsSync(cuesPath)) {
      log({ step: 'status', cues: 0, thumbs: 0, imgs: 0 })
      return
    }
    const cues = JSON.parse(readFileSync(cuesPath, 'utf8')).cues
    let thumbs = 0
    let imgs = 0
    for (const c of cues) {
      if (existsSync(join(OUT, c.sourcePaths.thumb)) && statSync(join(OUT, c.sourcePaths.thumb)).size > 0) thumbs += 1
      if (existsSync(join(OUT, c.sourcePaths.original)) && statSync(join(OUT, c.sourcePaths.original)).size > 0) imgs += 1
    }
    log({ step: 'status', cues: cues.length, thumbs, imgs, missingThumbs: cues.length - thumbs, missingImgs: cues.length - imgs })
    return
  }

  log({ step: 'fetch-index', url: INDEX_URL })
  const index = JSON.parse((await fetchBuf(INDEX_URL)).toString('utf8'))
  const posePath = join(ROOT, 'data', 'pose-gallery', 'cues.json')
  const poseById = new Map()
  if (existsSync(posePath)) {
    for (const c of JSON.parse(readFileSync(posePath, 'utf8')).cues) poseById.set(c.id, c)
  }
  const pack = buildCues(index.items, poseById)
  writeFileSync(join(OUT, 'cues.json'), JSON.stringify(pack, null, 2))
  log({ step: 'wrote-cues', total: pack.total, poseCount: pack.poseCount, path: join(OUT, 'cues.json') })
  if (metaOnly) return

  const jobs = []
  for (const c of pack.cues) {
    jobs.push({ id: c.id, path: c.sourcePaths.thumb, url: `${SOURCE}/${c.sourcePaths.thumb}`, dest: join(OUT, c.sourcePaths.thumb) })
    jobs.push({ id: c.id, path: c.sourcePaths.original, url: `${SOURCE}/${c.sourcePaths.original}`, dest: join(OUT, c.sourcePaths.original) })
  }
  log({ step: 'download-start', files: jobs.length, concurrency: CONCURRENCY })
  const summary = await mapPool(jobs, CONCURRENCY, (j) => downloadFile(j.url, j.dest))
  log({ step: 'finished', ...summary, cues: pack.total })
  if (summary.fail > 0) process.exitCode = 1
}

main().catch((e) => {
  log({ step: 'fatal', error: e instanceof Error ? e.message : String(e) })
  process.exit(1)
})
