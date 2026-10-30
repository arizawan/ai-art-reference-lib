#!/usr/bin/env node
/**
 * MCP server: ai-art-reference-lib
 *   npm run galleries:mcp
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  listLibraries,
  searchCues,
  getCue,
  getAssetUrl,
  readAssetBytes,
} from '../lib/gallery-core.mjs'

const libEnum = z.enum(['portrait', 'pose', 'depth', 'costume'])

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function fail(err) {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({
        code: err.code || 'ERROR',
        message: err.message || String(err),
      }),
    }],
  }
}

const server = new McpServer({
  name: 'ai-art-reference-lib',
  version: '1.0.0',
})

server.tool(
  'list_libraries',
  'Catalog offline Gia mirror libraries (portrait, pose, depth, costume).',
  {
    include_regen: z.boolean().optional().default(false),
  },
  async ({ include_regen }) => {
    try {
      return ok(await listLibraries({ includeRegen: include_regen }))
    } catch (err) {
      return fail(err)
    }
  },
)

server.tool(
  'search_cues',
  'Search cues by free text and optional filters (line, classification, angle, category, style, hair, section).',
  {
    library: z.union([libEnum, z.literal('all'), z.array(libEnum)]).optional().default('all'),
    query: z.string().optional().default(''),
    filters: z.object({
      line: z.string().optional(),
      classification: z.string().optional(),
      angle: z.string().optional(),
      poseNumber: z.string().optional(),
      category: z.string().optional(),
      style: z.string().optional(),
      section: z.string().optional(),
      hair: z.string().optional(),
    }).optional().default({}),
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).optional().default(0),
  },
  async (args) => {
    try {
      return ok(await searchCues(args))
    } catch (err) {
      return fail(err)
    }
  },
)

server.tool(
  'get_cue',
  'Fetch one cue with resolved asset URLs.',
  {
    library: libEnum,
    id: z.string().min(1),
    include_urls: z.boolean().optional().default(true),
    verify_files: z.boolean().optional().default(false),
  },
  async ({ library, id, include_urls, verify_files }) => {
    try {
      return ok(await getCue({
        library,
        id,
        includeUrls: include_urls,
        verifyFiles: verify_files,
      }))
    } catch (err) {
      return fail(err)
    }
  },
)

server.tool(
  'get_asset_url',
  'Resolve full-size (or thumb/preview) download URLs for a cue. Returns public + offline URLs. Set include_image=true to also embed the local file as MCP image content (use for originals agents must see).',
  {
    library: libEnum,
    id: z.string().min(1),
    kind: z.enum(['thumb', 'preview', 'original']).optional().default('original'),
    url_mode: z.enum(['offline', 'origin', 'public', 'auto']).optional().default('auto'),
    include_image: z.boolean().optional().default(false),
  },
  async ({ library, id, kind, url_mode, include_image }) => {
    try {
      if (include_image) {
        const packed = await readAssetBytes({ library, id, kind })
        const { base64, ...meta } = packed
        return {
          content: [
            { type: 'text', text: JSON.stringify(meta, null, 2) },
            { type: 'image', data: base64, mimeType: meta.mimeType || 'image/png' },
          ],
        }
      }
      return ok(await getAssetUrl({ library, id, kind, urlMode: url_mode }))
    } catch (err) {
      return fail(err)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
