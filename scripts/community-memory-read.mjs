#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE,
  listCommunityMemoryNotes,
  loadCommunityMemoryIndex,
  loadCommunityMemoryState,
  resolveCommunityMemoryPaths,
} from './community-memory-common.mjs';
import { formatTimestamp, parseArgValue, parsePositiveInt } from './hosted-aqua-common.mjs';

const VALID_FORMATS = new Set(['json', 'markdown']);

function printHelp() {
  console.log(`Usage: community-memory-read.mjs [options]

Options:
  --workspace-root <path>        OpenClaw workspace root
  --config-path <path>           Hosted Aqua config path
  --community-memory-dir <path>  Local community-memory root override
  --limit <n>                    Local page size (default: ${DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE})
  --cursor <id>                  Continue after the given note id
  --venue-slug <slug>            Filter by venue slug
  --tag <tag>                    Filter by tag
  --format <fmt>                 json|markdown (default: markdown)
  --help                         Show this message

Notes:
  - This command reads the local profile-scoped community-memory mirror only.
  - It never calls live Aqua APIs.
`);
}

export function parseOptions(argv) {
  const options = {
    communityMemoryDir: process.env.AQUACLAW_COMMUNITY_MEMORY_DIR || null,
    configPath: process.env.AQUACLAW_HOSTED_CONFIG || null,
    cursor: null,
    format: 'markdown',
    limit: Number.parseInt(process.env.AQUACLAW_COMMUNITY_MEMORY_READ_LIMIT || String(DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE), 10),
    tag: null,
    venueSlug: null,
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith('--workspace-root')) {
      options.workspaceRoot = parseArgValue(argv, index, arg, '--workspace-root').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--config-path')) {
      options.configPath = parseArgValue(argv, index, arg, '--config-path').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--community-memory-dir')) {
      options.communityMemoryDir = parseArgValue(argv, index, arg, '--community-memory-dir').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--limit')) {
      options.limit = parsePositiveInt(parseArgValue(argv, index, arg, '--limit'), '--limit');
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--cursor')) {
      options.cursor = parseArgValue(argv, index, arg, '--cursor').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--venue-slug')) {
      options.venueSlug = parseArgValue(argv, index, arg, '--venue-slug').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--tag')) {
      options.tag = parseArgValue(argv, index, arg, '--tag').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--format')) {
      options.format = parseArgValue(argv, index, arg, '--format').trim().toLowerCase();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  if (!VALID_FORMATS.has(options.format)) {
    throw new Error('--format must be json or markdown');
  }

  return options;
}

function formatNoteMarkdown(note) {
  const lines = [
    `- ${formatTimestamp(note.createdAt)} | ${note.npcId ?? 'unknown'} | ${note.venueSlug ?? 'no-venue'}`,
    `  ${note.summary || '(no summary)'}`,
  ];

  if (note.body) {
    lines.push(`  ${note.body}`);
  }
  if (note.tags.length > 0) {
    lines.push(`  tags: ${note.tags.join(', ')}`);
  }
  lines.push(`  mention: ${note.mentionPolicy ?? 'n/a'} | freshness: ${note.freshnessScore ?? 'n/a'}`);
  return lines.join('\n');
}

function formatReadResultMarkdown(result) {
  const lines = [
    'Local community memory.',
    `- Root: ${result.paths.communityMemoryRoot}`,
    `- Profile: ${result.paths.profileId ?? 'legacy'}`,
    `- Last sync: ${formatTimestamp(result.state.lastSyncedAt)}`,
    `- Total notes: ${result.state.totalKnownNotes}`,
    `- Full backfill complete: ${result.state.fullBackfillCompletedAt ? 'yes' : 'no'}`,
    `- Returned items: ${result.page.items.length}`,
  ];

  if (result.page.nextCursor) {
    lines.push(`- Next cursor: ${result.page.nextCursor}`);
  }
  if (result.page.items.length > 0) {
    lines.push('');
    lines.push(...result.page.items.map((note) => formatNoteMarkdown(note)));
  }

  return lines.join('\n');
}

export async function readCommunityMemory({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
  communityMemoryDir = process.env.AQUACLAW_COMMUNITY_MEMORY_DIR,
  limit = DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE,
  cursor = null,
  venueSlug = null,
  tag = null,
} = {}) {
  const paths = resolveCommunityMemoryPaths({
    workspaceRoot,
    configPath,
    communityMemoryDir,
  });
  const stateResult = await loadCommunityMemoryState(paths.statePath);
  const indexResult = await loadCommunityMemoryIndex(paths);
  const page = listCommunityMemoryNotes({
    index: indexResult.index,
    limit,
    cursor,
    venueSlug,
    tag,
  });

  return {
    paths,
    state: stateResult.state,
    recoveredIndex: indexResult.recovered,
    recoveredIndexReason: indexResult.recoveryReason,
    recoveredState: stateResult.recovered,
    recoveredStateReason: stateResult.recoveryReason,
    page,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const result = await readCommunityMemory(options);
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatReadResultMarkdown(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
