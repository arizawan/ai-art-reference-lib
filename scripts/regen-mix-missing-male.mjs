#!/usr/bin/env node
/**
 * Fill expression_*_male.webp gaps from matching *_female.webp cues,
 * locking identity to Ren Okada (data/gallery-regen/refs/ren-okada-face.png).
 *
 * Female cue dir (first hit wins):
 *   MIX_IMG_DIR env, else data/gallery-regen/refs/mix-expression-female,
 *   else ../fairpose/public/styles, else public/mix/img (legacy Fairpose layout).
 *
 *   node scripts/regen-mix-missing-male.mjs plan
 *   node scripts/regen-mix-missing-male.mjs run [--limit N] [--force]
 *   node scripts/regen-mix-missing-male.mjs status
 */
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const COMFY_URL = (process.env.COMFY_URL ?? 'http://100.96.51.107:8188').replace(/\/$/, '')
function resolveMixImgDir() {
  const candidates = [
    process.env.MIX_IMG_DIR,
    join(ROOT, 'data', 'gallery-regen', 'refs', 'mix-expression-female'),
    join(ROOT, '..', 'fairpose', 'public', 'styles'),
    join(ROOT, 'public', 'mix', 'img'),
  ].filter(Boolean)
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return candidates[0]
}
const MIX = resolveMixImgDir()
const FIGURE = join(ROOT, 'data', 'gallery-regen', 'refs', 'ren-okada-face.png')
const OUT_DIR = join(ROOT, 'data', 'gallery-regen', 'out', 'mix-male')
const STATE_PATH = join(ROOT, 'data', 'gallery-regen', 'mix-male-state.json')
const CLIENT = 'fairpose-mix-missing-male'

// image1 = Ren face plate (edit base). image2 = female expression cue.
const PROMPT = `Photoreal chest-up studio portrait. Edit <image1> (Ren Okada adult man): keep his identity — face structure, eyes, nose, lips, skin tone, short textured black hair, male features. EXPRESSION LOCK from <image2>: match the mouth shape exactly (open/closed/teeth/tongue), eyelid state (blink/half-lid/wide), brow angle, eye gaze direction, and head tilt. If <image2> screams or opens the mouth, Ren's mouth must open the same way — do not leave a neutral face. Do not copy <image2>'s gender, hair color, makeup, or body. Soft even studio light, seamless light grey backdrop, sharp pores, zero text, no watermark.`
const NEG = 'neutral face, closed mouth when reference mouth is open, calm expression, blurry, soft focus, lowres, text, watermark, female face, wrong identity, plastic skin'

const STEPS = 12
const ENCODE = 768
const MAX_SIDE = 768
const FETCH_MS = 60_000
const RUN_MAX_MS = 4 * 60_000
const IDLE_POLL_MS = 5_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (obj) => console.log(JSON.stringify({ t: new Date().toISOString(), ...obj }))

async function comfy(path, init) {
  const res = await fetch(COMFY_URL + path, { ...init, signal: AbortSignal.timeout(FETCH_MS) })
  if (!res.ok) throw new Error(`ComfyUI ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return Buffer.from(await res.arrayBuffer())
}

async function waitIdle() {
  for (;;) {
    const q = await comfy('/queue')
    if (q.queue_running.length + q.queue_pending.length === 0) return
    await sleep(IDLE_POLL_MS)
  }
}

async function upload(localPath, asName) {
  const form = new FormData()
  form.append('image', new Blob([readFileSync(localPath)]), asName)
  const res = await fetch(COMFY_URL + '/upload/image', { method: 'POST', body: form, signal: AbortSignal.timeout(FETCH_MS) })
  if (!res.ok) throw new Error(`upload ${asName} → ${res.status}`)
  const json = await res.json()
  return json.name || asName
}

async function fitLongSide(srcPath, maxSide = MAX_SIDE) {
  const dest = join(tmpdir(), `mix-male-${randomBytes(6).toString('hex')}.jpg`)
  const vf = `scale='if(gt(iw,ih),min(iw\\,${maxSide}),-2)':'if(gt(ih,iw),min(ih\\,${maxSide}),-2)'`
  await run('ffmpeg', ['-v', 'error', '-y', '-i', srcPath, '-vf', vf, '-q:v', '3', dest], { timeout: 30_000 })
  return dest
}

async function toWebp(pngPath, webpPath) {
  const scaled = join(tmpdir(), `mix-male-${randomBytes(6).toString('hex')}.png`)
  try {
    await run('sips', ['-z', '1024', '768', pngPath, '--out', scaled], { timeout: 30_000 })
    await run('cwebp', ['-q', '85', scaled, '-o', webpPath], { timeout: 30_000 })
  } finally {
    if (existsSync(scaled)) rmSync(scaled, { force: true })
  }
}

function editGraph({ image1, image2, seed }) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'rayQwen21_turboV13Int8convrot.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_8b_abliterated_int8.safetensors', type: 'qwen_image', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' } },
    4: { class_type: 'QwenImage21Cache', inputs: { model: ['1', 0], device: 'auto', dtype: 'default' } },
    5: {
      class_type: 'TextEncodeQwenImage21',
      inputs: {
        clip: ['2', 0],
        prompt: PROMPT,
        negative_prompt: NEG,
        resolution: ENCODE,
        vae: ['3', 0],
        'images.image_1': ['10', 0],
        'images.image_2': ['11', 0],
      },
    },
    6: { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1024, batch_size: 1 } },
    7: {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['5', 1],
        latent_image: ['12', 0],
        seed,
        steps: STEPS,
        cfg: 1,
        sampler_name: 'seeds_2',
        scheduler: 'linear_quadratic',
        denoise: 1,
      },
    },
    8: { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    9: { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'fairpose-gallery-regen/mix-male' } },
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
    await sleep(1000)
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
    if (Date.now() > deadline) throw new Error('Comfy timed out')
  }
}

function listJobs({ onlyMissing = true, ids = null } = {}) {
  const idSet = ids?.length ? new Set(ids) : null
  const jobs = []
  for (const name of readdirSync(MIX)) {
    if (!name.endsWith('_female.webp')) continue
    if (!name.startsWith('expression_')) continue
    const maleName = name.replace(/_female\.webp$/, '_male.webp')
    const female = join(MIX, name)
    const male = join(MIX, maleName)
    const key = maleName.replace(/\.webp$/, '')
    if (idSet && !idSet.has(key) && !idSet.has(maleName) && !idSet.has(name)) continue
    jobs.push({ key, female, male, maleName, outPng: join(OUT_DIR, `${key}.png`) })
  }
  return onlyMissing ? jobs.filter((j) => !existsSync(j.male)) : jobs
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { version: 1, jobs: {} }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
}

function saveState(state) {
  mkdirSync(join(ROOT, 'data', 'gallery-regen'), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function seedFor(key) {
  // v2: figure-as-image1 + expression-lock prompt
  return createHash('sha256').update(`mix-male:v2:${key}`).digest().readUInt32BE(0) >>> 0
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { values } = parseArgs({
    args: rest,
    options: {
      limit: { type: 'string' },
      ids: { type: 'string' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  if (!existsSync(FIGURE)) throw new Error(`Missing figure: ${FIGURE}`)
  const ids = values.ids ? values.ids.split(',').map((s) => s.trim()).filter(Boolean) : null
  const missing = listJobs({ onlyMissing: true })
  const limit = values.limit === undefined ? Infinity : Number(values.limit)
  if (cmd === 'plan' || cmd === 'status') {
    const state = loadState()
    log({
      step: cmd,
      missing: missing.length,
      done: Object.values(state.jobs).filter((j) => j.status === 'done').length,
      failed: Object.values(state.jobs).filter((j) => j.status === 'failed').length,
      sample: missing.slice(0, 5).map((j) => j.maleName),
    })
    return
  }
  if (cmd !== 'run') {
    console.error('Usage: plan | run [--ids a,b] [--limit N] [--force] | status')
    process.exit(2)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const state = loadState()
  const figUploaded = await upload(FIGURE, 'fairpose_fig_ren-okada-face.png')
  let todo = listJobs({ onlyMissing: !(values.force && ids), ids })
  if (values.force && ids) todo = listJobs({ onlyMissing: false, ids })
  else if (!values.force) {
    todo = todo.filter((j) => state.jobs[j.key]?.status !== 'done' || !existsSync(j.male))
  }
  todo = todo.slice(0, Number.isFinite(limit) ? limit : todo.length)
  log({ step: 'plan', queued: todo.length, missing: missing.length, dryRun: !!values['dry-run'], order: 'figure=image1 expression=image2' })
  if (values['dry-run'] || todo.length === 0) return

  let saved = 0
  let failed = 0
  for (const j of todo) {
    const started = Date.now()
    let fitted = null
    try {
      fitted = await fitLongSide(j.female, MAX_SIDE)
      const cueUploaded = await upload(fitted, `fairpose_mix_${j.key}_${randomBytes(2).toString('hex')}.jpg`)
      // figure (Ren) = image1 edit base; expression cue = image2
      const png = await render(editGraph({ image1: figUploaded, image2: cueUploaded, seed: seedFor(j.key) }))
      writeFileSync(j.outPng, png)
      await toWebp(j.outPng, j.male)
      state.jobs[j.key] = {
        status: 'done',
        male: j.male,
        outPng: j.outPng,
        seconds: Math.round((Date.now() - started) / 1000),
        updatedAt: new Date().toISOString(),
        bytes: png.length,
        prompt: 'v2-expr-lock',
      }
      saveState(state)
      saved += 1
      log({ step: 'saved', key: j.key, seconds: state.jobs[j.key].seconds, male: j.male, left: todo.length - saved - failed })
    } catch (e) {
      failed += 1
      state.jobs[j.key] = {
        status: 'failed',
        error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        updatedAt: new Date().toISOString(),
      }
      saveState(state)
      log({ step: 'failed', key: j.key, error: state.jobs[j.key].error })
      if (failed >= 3) throw new Error(`Stopped after ${failed} failures`)
    } finally {
      if (fitted) rmSync(fitted, { force: true })
    }
  }
  log({ step: 'finished', saved, failed })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
