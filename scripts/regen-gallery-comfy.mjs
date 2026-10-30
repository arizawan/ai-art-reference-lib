#!/usr/bin/env node
/**
 * Regenerate offline gallery cues as NEW images on homelab ComfyUI (Qwen21-EDIT-REF).
 * Does not overwrite Gia source files. Resumable via out/ presence + state.json.
 *
 *   COMFY_URL=http://100.96.51.107:8188 node scripts/regen-gallery-comfy.mjs sample --stage pose
 *   node scripts/regen-gallery-comfy.mjs plan  --stage pose --gender female --limit 20
 *   node scripts/regen-gallery-comfy.mjs run   --stage pose --gender female --preset quick --limit 5
 *   node scripts/regen-gallery-comfy.mjs run   --stage pose --ids full_sexy_P001_front --gender both --force
 *
 * Presets: quick (8 steps, long-side 832) | best (12 steps, same resize).
 * Looks: wood female/male only (no clay).
 */
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMFY_URL = (process.env.COMFY_URL ?? 'http://100.96.51.107:8188').replace(/\/$/, '')
const REGEN = join(ROOT, 'data', 'gallery-regen')
const STATE_PATH = join(REGEN, 'state.json')
const PROMPTS = JSON.parse(readFileSync(join(REGEN, 'prompts.json'), 'utf8'))

const STAGES = {
  pose: { dir: join(ROOT, 'data', 'pose-gallery'), cues: 'cues.json' },
  costume: { dir: join(ROOT, 'data', 'costume-gallery'), cues: 'cues.json' },
  portrait: { dir: join(ROOT, 'data', 'portrait-gallery'), cues: 'cues.json' },
}

const FIGURE = {
  pose: { female: 'female-wood.jpg', male: 'male-wood.jpg' },
  // Direct hourglass fashion mannequin (white + wig) — keep silhouette; outfit from cue only.
  costume: { default: 'fashion-mannequin-hourglass.png' },
  // Portrait identity plates — see characters.json (Mika Vay / Ren Okada).
  portrait: { female: 'mika-vay-face.png', male: 'ren-okada-face.png' },
}

/** Fairpose refs need ≤1600; Qwen EDIT rescales to ~resolution². Pose: 832 is enough. Costume: 1024 for fabric. */
const MAX_SRC_SIDE = 832
const ENCODE_RESOLUTION = 768
const COSTUME_MAX_SRC_SIDE = 1024
const COSTUME_ENCODE_RESOLUTION = 1024

const PRESETS = {
  quick: { steps: 8, sampler: 'seeds_2', scheduler: 'linear_quadratic', label: 'EDIT-REF quick·8' },
  best: { steps: 12, sampler: 'seeds_2', scheduler: 'linear_quadratic', label: 'EDIT-REF best·12' },
}

const IDLE_POLL_MS = 5_000
const IDLE_MAX_MS = 6 * 60 * 60_000
const RUN_POLL_MS = 1_000
const RUN_MAX_MS = 4 * 60_000
const FETCH_MS = 60_000
const CLIENT = 'fairpose-gallery-regen'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function log(obj) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...obj }))
}

async function comfy(path, init) {
  const res = await fetch(COMFY_URL + path, { ...init, signal: AbortSignal.timeout(FETCH_MS) })
  if (!res.ok) throw new Error(`ComfyUI ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return Buffer.from(await res.arrayBuffer())
}

async function waitIdle() {
  const deadline = Date.now() + IDLE_MAX_MS
  for (;;) {
    const q = await comfy('/queue')
    if (q.queue_running.length + q.queue_pending.length === 0) return
    if (Date.now() > deadline) throw new Error('ComfyUI stayed busy too long')
    await sleep(IDLE_POLL_MS)
  }
}

async function upload(localPath, asName) {
  const form = new FormData()
  const blob = new Blob([readFileSync(localPath)])
  form.append('image', blob, asName)
  const res = await fetch(COMFY_URL + '/upload/image', { method: 'POST', body: form, signal: AbortSignal.timeout(FETCH_MS) })
  if (!res.ok) throw new Error(`upload ${asName} → ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  return json.name || asName
}

/** Fit longest side to maxSide (keep aspect). Writes JPEG for smaller uploads. */
async function fitLongSide(srcPath, maxSide = MAX_SRC_SIDE) {
  const dest = join(tmpdir(), `fairpose-regen-${randomBytes(6).toString('hex')}.jpg`)
  const vf = `scale='if(gt(iw,ih),min(iw\\,${maxSide}),-2)':'if(gt(ih,iw),min(ih\\,${maxSide}),-2)'`
  await run('ffmpeg', ['-v', 'error', '-y', '-i', srcPath, '-vf', vf, '-q:v', '3', dest], { timeout: 30_000 })
  return dest
}

function seedFor(jobKey) {
  const n = createHash('sha256').update(jobKey).digest().readUInt32BE(0)
  return n >>> 0
}

function editGraph({ prompt, image1, image2, seed, preset, encodeResolution }) {
  const p = PRESETS[preset]
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'rayQwen21_turboV13Int8convrot.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_8b_abliterated_int8.safetensors', type: 'qwen_image', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' } },
    4: { class_type: 'QwenImage21Cache', inputs: { model: ['1', 0], device: 'auto', dtype: 'default' } },
    5: {
      class_type: 'TextEncodeQwenImage21',
      inputs: {
        clip: ['2', 0],
        prompt,
        negative_prompt: 'blurry, soft focus, mushy fabric, lowres, jpeg artifacts, text, watermark',
        resolution: encodeResolution ?? ENCODE_RESOLUTION,
        vae: ['3', 0],
        'images.image_1': ['10', 0],
        'images.image_2': ['11', 0],
      },
    },
    6: { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } },
    7: {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['5', 1],
        latent_image: ['12', 0],
        seed,
        steps: p.steps,
        cfg: 1,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        denoise: 1,
      },
    },
    8: { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    9: { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'fairpose-gallery-regen/edit' } },
    10: { class_type: 'LoadImage', inputs: { image: image1 } },
    11: { class_type: 'LoadImage', inputs: { image: image2 } },
    12: { class_type: 'ComfySwitchNode', inputs: { switch: false, on_false: ['5', 2], on_true: ['6', 0] } },
  }
}

async function render(graph) {
  await waitIdle()
  const { prompt_id: id } = await comfy('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: CLIENT }),
  })
  const deadline = Date.now() + RUN_MAX_MS
  for (;;) {
    await sleep(RUN_POLL_MS)
    const item = (await comfy(`/history/${id}`))[id]
    if (item?.status?.status_str === 'error') {
      const err = item.status.messages?.find((m) => m[0] === 'execution_error')?.[1]
      throw new Error(`Comfy failed: ${String(err?.exception_message ?? 'unknown').slice(0, 400)}`)
    }
    const image = item?.status?.completed ? Object.values(item.outputs ?? {}).flatMap((o) => o.images ?? [])[0] : undefined
    if (image) {
      const qs = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type })
      const buf = await comfy(`/view?${qs}`)
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    }
    if (Date.now() > deadline) throw new Error(`Comfy timed out after ${RUN_MAX_MS / 1000}s`)
  }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { version: 1, jobs: {} }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
}

function saveState(state) {
  mkdirSync(REGEN, { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function loadCues(stage) {
  const meta = STAGES[stage]
  const json = JSON.parse(readFileSync(join(meta.dir, meta.cues), 'utf8'))
  return { meta: json, cues: json.cues, root: meta.dir }
}

function sourcePath(cue) {
  const sp = cue.sourcePaths || {}
  return sp.original || sp.preview || sp.thumb
}

function outPath(stage, cueId, variant) {
  const safe = String(cueId).replace(/[^\w.-]+/g, '_')
  const tag = variant && variant !== 'default' ? `_${variant}` : ''
  return join(REGEN, 'out', stage, `${safe}${tag}.png`)
}

function jobKey(stage, cueId, variant) {
  return `${stage}:${cueId}:${variant || 'default'}`
}

function variantsFor(stage, gender) {
  if (stage === 'pose' || stage === 'portrait') {
    if (gender === 'both' || gender === 'wood') return ['female', 'male']
    if (gender === 'male' || gender === 'female') return [gender]
    throw new Error(`--gender must be female|male|both for ${stage}`)
  }
  return ['default']
}

function promptFor(stage, variant) {
  if (stage === 'pose' || stage === 'portrait') return PROMPTS[stage][variant]
  return PROMPTS[stage]?.default || PROMPTS.costume.default
}

function figureFile(stage, variant) {
  if (stage === 'pose' || stage === 'portrait') return FIGURE[stage][variant]
  return FIGURE[stage]?.default || FIGURE.costume.default
}

function selectJobs({ stage, gender, ids, line, angle, limit, includeTwoPerson }) {
  const { cues, root } = loadCues(stage)
  const idSet = ids?.length ? new Set(ids) : null
  const variants = variantsFor(stage, gender)
  const jobs = []
  for (const cue of cues) {
    if (idSet && !idSet.has(cue.id)) continue
    if (stage === 'pose') {
      if (!includeTwoPerson && cue.line === 'two-person') continue
      if (line && cue.line !== line) continue
      if (angle && cue.angle !== angle) continue
    }
    if (stage === 'costume' && line && cue.category !== line) continue
    if (stage === 'portrait') {
      if (line && cue.hair !== line && cue.section !== line) continue
    }
    const rel = sourcePath(cue)
    if (!rel) continue
    const src = join(root, rel)
    if (!existsSync(src)) continue
    for (const variant of variants) {
      jobs.push({
        key: jobKey(stage, cue.id, variant),
        stage,
        cueId: cue.id,
        label: cue.label,
        variant,
        src,
        out: outPath(stage, cue.id, variant),
        figure: join(REGEN, 'refs', figureFile(stage, variant)),
        prompt: promptFor(stage, variant),
      })
    }
  }
  const capped = Number.isFinite(limit) ? jobs.slice(0, limit) : jobs
  return { jobs: capped, totalMatch: jobs.length, root }
}

function parseCommon(args) {
  const { values } = parseArgs({
    args,
    options: {
      stage: { type: 'string', default: 'pose' },
      gender: { type: 'string', default: 'female' },
      ids: { type: 'string' },
      line: { type: 'string' },
      angle: { type: 'string' },
      limit: { type: 'string' },
      preset: { type: 'string', default: 'quick' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'include-two-person': { type: 'boolean', default: false },
      'max-side': { type: 'string' },
    },
  })
  if (!STAGES[values.stage]) throw new Error('--stage must be pose|costume|portrait')
  if (!(values.preset in PRESETS)) throw new Error('--preset must be quick|best')
  const limit = values.limit === undefined ? Infinity : Number(values.limit)
  if (!(limit > 0)) throw new Error('--limit must be positive')
  const ids = values.ids ? values.ids.split(',').map((s) => s.trim()).filter(Boolean) : null
  const faceStage = values.stage === 'costume' || values.stage === 'portrait'
  const stageDefaultSide = faceStage ? COSTUME_MAX_SRC_SIDE : MAX_SRC_SIDE
  const maxSide = values['max-side'] === undefined ? stageDefaultSide : Number(values['max-side'])
  if (!(maxSide >= 256 && maxSide <= 2048)) throw new Error('--max-side must be 256..2048')
  const encodeResolution = faceStage ? COSTUME_ENCODE_RESOLUTION : ENCODE_RESOLUTION
  // Costume/portrait default to best unless --preset was passed.
  const presetExplicit = args.includes('--preset')
  const preset = faceStage && !presetExplicit ? 'best' : values.preset
  return { ...values, preset, limit, ids, maxSide, encodeResolution }
}

async function ensureFiguresUploaded(jobs) {
  const map = new Map()
  for (const j of jobs) {
    if (map.has(j.figure)) continue
    if (!existsSync(j.figure)) throw new Error(`Missing figure ref: ${j.figure}`)
    const name = `fairpose_fig_${basename(j.figure)}`
    const uploaded = await upload(j.figure, name)
    map.set(j.figure, uploaded)
  }
  return map
}

async function runJobs(opts) {
  const { jobs, totalMatch } = selectJobs(opts)
  const state = loadState()
  const todo = []
  let skippedDone = 0
  for (const j of jobs) {
    const prev = state.jobs[j.key]
    if (!opts.force && existsSync(j.out) && prev?.status === 'done' && prev?.preset === opts.preset) {
      skippedDone += 1
      continue
    }
    todo.push(j)
  }
  log({
    step: 'plan',
    stage: opts.stage,
    gender: opts.gender,
    preset: opts.preset,
    presetLabel: PRESETS[opts.preset].label,
    maxSide: opts.maxSide,
    encodeResolution: opts.encodeResolution,
    comfy: COMFY_URL,
    matched: totalMatch,
    queued: todo.length,
    skippedDone,
    dryRun: opts['dry-run'],
    sample: todo.slice(0, 3).map((j) => ({ id: j.cueId, variant: j.variant, out: j.out })),
  })
  if (opts['dry-run'] || todo.length === 0) return { todo, saved: 0, failed: 0 }

  mkdirSync(join(REGEN, 'out', opts.stage), { recursive: true })
  const figMap = await ensureFiguresUploaded(todo)
  let saved = 0
  let failed = 0

  for (const j of todo) {
    const started = Date.now()
    const seed = seedFor(`${j.key}:${opts.preset}:${opts.maxSide}`)
    let fitted = null
    try {
      fitted = await fitLongSide(j.src, opts.maxSide)
      const cueUploaded = await upload(fitted, `fairpose_src_${j.cueId.replace(/[^\w.-]+/g, '_')}${randomBytes(2).toString('hex')}.jpg`)
      const figUploaded = figMap.get(j.figure)
      // Costume: figure is image1 (edit base / hourglass body); cue outfit is image2.
      // Pose/portrait: cue is image1 (pose/face lock); figure is image2 (material/proportions).
      const image1 = opts.stage === 'costume' ? figUploaded : cueUploaded
      const image2 = opts.stage === 'costume' ? cueUploaded : figUploaded
      const png = await render(editGraph({ prompt: j.prompt, image1, image2, seed, preset: opts.preset, encodeResolution: opts.encodeResolution }))
      mkdirSync(dirname(j.out), { recursive: true })
      writeFileSync(j.out, png)
      const sampleDir = join(REGEN, 'out', 'samples')
      mkdirSync(sampleDir, { recursive: true })
      const sampleName = `${opts.stage}_${j.cueId.replace(/[^\w.-]+/g, '_')}_${j.variant}.png`
      copyFileSync(j.out, join(sampleDir, sampleName))
      state.jobs[j.key] = {
        status: 'done',
        out: j.out,
        sample: join(sampleDir, sampleName),
        seed,
        preset: opts.preset,
        maxSide: opts.maxSide,
        updatedAt: new Date().toISOString(),
        bytes: png.length,
        seconds: Math.round((Date.now() - started) / 1000),
      }
      saveState(state)
      saved += 1
      log({ step: 'saved', key: j.key, seconds: state.jobs[j.key].seconds, out: j.out, sample: state.jobs[j.key].sample, left: todo.length - saved - failed })
    } catch (e) {
      failed += 1
      const error = e instanceof Error ? e.message : String(e)
      state.jobs[j.key] = { status: 'failed', error: error.slice(0, 500), updatedAt: new Date().toISOString(), preset: opts.preset }
      saveState(state)
      log({ step: 'failed', key: j.key, error })
      if (failed >= 3) throw new Error(`Stopped after ${failed} failures`)
    } finally {
      if (fitted) rmSync(fitted, { force: true })
    }
  }
  log({ step: 'finished', saved, failed })
  return { todo, saved, failed }
}

async function sampleCmd(args) {
  const opts = parseCommon(args)
  if (opts.stage === 'pose' && !opts.ids) {
    opts.ids = ['full_sexy_P001_front', 'full_single_P001_front']
    if (opts.limit === Infinity) opts.limit = opts.gender === 'both' ? 4 : 2
  } else if (opts.stage === 'costume' && !opts.ids) {
    opts.ids = ['SPR-0001']
    if (opts.limit === Infinity) opts.limit = 1
  } else if (opts.stage === 'portrait' && !opts.ids) {
    const { cues } = loadCues('portrait')
    const face = cues.filter((c) => c.section === 'face' && c.style)
    const short = face.find((c) => c.hair === 'short')
    const medium = face.find((c) => c.hair === 'medium')
    opts.ids = [medium?.id, short?.id].filter(Boolean)
    if (opts.limit === Infinity) opts.limit = opts.gender === 'both' ? 4 : 2
  }
  opts.force = true
  return runJobs(opts)
}

async function planCmd(args) {
  const opts = parseCommon(args)
  opts['dry-run'] = true
  return runJobs(opts)
}

async function runCmd(args) {
  return runJobs(parseCommon(args))
}

async function statusCmd(args) {
  const { values } = parseArgs({ args, options: { stage: { type: 'string' } } })
  const state = loadState()
  const rows = Object.entries(state.jobs)
    .filter(([k]) => !values.stage || k.startsWith(values.stage + ':'))
    .map(([k, v]) => ({ key: k, ...v }))
  const by = { done: 0, failed: 0 }
  for (const r of rows) by[r.status] = (by[r.status] || 0) + 1
  log({ step: 'status', ...by, recent: rows.slice(-8) })
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'sample') await sampleCmd(rest)
  else if (cmd === 'plan') await planCmd(rest)
  else if (cmd === 'run') await runCmd(rest)
  else if (cmd === 'status') await statusCmd(rest)
  else {
    console.error(`Usage:
  sample --stage pose|costume|portrait [--gender female|male|both] [--preset quick|best]
  plan   --stage pose [--gender female] [--line full-sexy] [--angle front] [--limit N]
  run    --stage pose [--ids a,b] [--force] [--preset quick|best] [--max-side 832]
  status [--stage pose]`)
    process.exit(2)
  }
} catch (e) {
  log({ step: 'fatal', error: e instanceof Error ? e.message : String(e) })
  process.exit(1)
}
