#!/usr/bin/env node
/**
 * Sync Gia mirror trees to Backblaze B2 via rclone.
 *
 * Env:
 *   B2_RCLONE_REMOTE  default: b2:ai-art-reference-lib
 *   (rclone remote "b2" type=b2, bucket = ai-art-reference-lib)
 *
 *   B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2
 *   npm run galleries:sync:b2 -- --dry-run
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REMOTE = process.env.B2_RCLONE_REMOTE || 'b2:ai-art-reference-lib'
const dryRun = process.argv.includes('--dry-run')

const MAP = [
  ['data/portrait-gallery', 'portrait'],
  ['data/pose-gallery', 'pose'],
  ['data/pose-depth-gallery', 'depth'],
  ['data/costume-gallery', 'costume'],
]

function rclone(args) {
  const r = spawnSync('rclone', args, { stdio: 'inherit' })
  if (r.error) {
    console.error('rclone not found — install https://rclone.org/install/')
    process.exit(2)
  }
  if (r.status !== 0) process.exit(r.status ?? 1)
}

for (const [localRel, prefix] of MAP) {
  const src = join(ROOT, localRel)
  if (!existsSync(src)) {
    console.error(`Missing ${src}`)
    process.exit(1)
  }
  const dst = `${REMOTE}/${prefix}/`
  const args = ['sync', `${src}/`, dst, '--checksum', '--fast-list']
  if (dryRun) args.push('--dry-run')
  console.log(`\n→ ${src}/  →  ${dst}`)
  rclone(args)
}

console.log('\nDone.')
