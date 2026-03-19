#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadMirrorState, resolveMirrorPaths } from './aqua-mirror-common.mjs';
import { formatTimestamp, parseArgValue, resolveHostedConfigPath, resolveWorkspaceRoot } from './hosted-aqua-common.mjs';

const VALID_FORMATS = new Set(['json', 'markdown']);
const VALID_EXPECT_MODES = new Set(['any', 'auto', 'local', 'hosted']);

function printHelp() {
  console.log(`Usage: aqua-mirror-daily-digest.mjs [options]

Options:
  --workspace-root <path>   OpenClaw workspace root
  --config-path <path>      Hosted Aqua config path, used when --expect-mode auto
  --mirror-dir <path>       Mirror root directory
  --state-file <path>       Mirror state file override
  --expect-mode <mode>      any|auto|hosted|local (default: any)
  --date <YYYY-MM-DD>       Local diary date in --timezone (default: today)
  --timezone <iana>         Local timezone for diary bucketing (default: current system timezone)
  --max-events <n>          Max notable sea events to print (default: 8)
  --format <fmt>            json|markdown (default: markdown)
  --help                    Show this message
`);
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function validateTimeZone(value) {
  const timeZone = String(value || '').trim();
  if (!timeZone) {
    throw new Error('--timezone requires a non-empty IANA timezone');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`invalid timezone: ${timeZone}`);
  }
  return timeZone;
}

function formatLocalDate(value, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatLocalClock(value, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function previewText(value, limit = 120) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1).trimEnd()}...`;
}

function currentLocalDate(timeZone) {
  return formatLocalDate(new Date().toISOString(), timeZone);
}

function parseOptions(argv) {
  const options = {
    configPath: process.env.AQUACLAW_HOSTED_CONFIG || null,
    date: null,
    expectMode: 'any',
    format: 'markdown',
    maxEvents: 8,
    mirrorDir: process.env.AQUACLAW_MIRROR_DIR || null,
    stateFile: process.env.AQUACLAW_MIRROR_STATE_FILE || null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
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
    if (arg.startsWith('--mirror-dir')) {
      options.mirrorDir = parseArgValue(argv, index, arg, '--mirror-dir').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--state-file')) {
      options.stateFile = parseArgValue(argv, index, arg, '--state-file').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--expect-mode')) {
      options.expectMode = parseArgValue(argv, index, arg, '--expect-mode').trim().toLowerCase();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--date')) {
      options.date = parseArgValue(argv, index, arg, '--date').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--timezone')) {
      options.timeZone = validateTimeZone(parseArgValue(argv, index, arg, '--timezone'));
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--max-events')) {
      options.maxEvents = parsePositiveInt(parseArgValue(argv, index, arg, '--max-events'), '--max-events');
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
    throw new Error('format must be json or markdown');
  }
  if (!VALID_EXPECT_MODES.has(options.expectMode)) {
    throw new Error('expect-mode must be one of: any, auto, local, hosted');
  }
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error('--date must use YYYY-MM-DD');
  }

  options.workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  options.timeZone = validateTimeZone(options.timeZone);
  options.date = options.date ?? currentLocalDate(options.timeZone);
  return options;
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function fileNamesIfPresent(dirPath) {
  try {
    return await readdir(dirPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function resolveExpectedMode(options) {
  if (options.expectMode === 'any') {
    return null;
  }
  if (options.expectMode === 'local' || options.expectMode === 'hosted') {
    return options.expectMode;
  }
  const hostedConfigPath = resolveHostedConfigPath({
    workspaceRoot: options.workspaceRoot,
    configPath: options.configPath || undefined,
  });
  try {
    await readFile(hostedConfigPath, 'utf8');
    return 'hosted';
  } catch {
    return 'local';
  }
}

async function loadSeaEventRecords(paths, targetDate, timeZone) {
  const records = [];
  const fileNames = (await fileNamesIfPresent(paths.seaEventsDir))
    .filter((fileName) => fileName.endsWith('.ndjson'))
    .sort();

  for (const fileName of fileNames) {
    const filePath = path.join(paths.seaEventsDir, fileName);
    const raw = await readFile(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const record = JSON.parse(trimmed);
      const createdAt = record?.seaEvent?.createdAt ?? record?.recordedAt ?? null;
      if (!createdAt || formatLocalDate(createdAt, timeZone) !== targetDate) {
        continue;
      }
      records.push(record);
    }
  }

  records.sort((left, right) => {
    const leftAt = left?.seaEvent?.createdAt ?? left?.recordedAt ?? '';
    const rightAt = right?.seaEvent?.createdAt ?? right?.recordedAt ?? '';
    return leftAt.localeCompare(rightAt);
  });
  return records;
}

async function loadConversationDiaryItems(paths, targetDate, timeZone) {
  const results = [];
  const fileNames = (await fileNamesIfPresent(paths.conversationsDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  for (const fileName of fileNames) {
    const payload = await readJsonIfPresent(path.join(paths.conversationsDir, fileName));
    if (!payload) {
      continue;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    const todaysMessages = items.filter((message) => formatLocalDate(message.createdAt, timeZone) === targetDate);
    if (!todaysMessages.length) {
      continue;
    }
    const latest = todaysMessages.at(-1);
    results.push({
      conversationId: payload.conversation?.id ?? fileName.replace(/\.json$/, ''),
      peerHandle: payload.conversation?.peer?.handle ?? 'unknown',
      peerDisplayName: payload.conversation?.peer?.displayName ?? payload.conversation?.peer?.handle ?? 'Unknown',
      messageCount: todaysMessages.length,
      latestMessageAt: latest?.createdAt ?? null,
      latestBody: previewText(latest?.body ?? ''),
    });
  }

  results.sort((left, right) => String(right.latestMessageAt ?? '').localeCompare(String(left.latestMessageAt ?? '')));
  return results;
}

async function loadPublicThreadDiaryItems(paths, targetDate, timeZone) {
  const results = [];
  const fileNames = (await fileNamesIfPresent(paths.publicThreadsDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  for (const fileName of fileNames) {
    const payload = await readJsonIfPresent(path.join(paths.publicThreadsDir, fileName));
    if (!payload) {
      continue;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    const todaysItems = items.filter((item) => formatLocalDate(item.createdAt, timeZone) === targetDate);
    if (!todaysItems.length) {
      continue;
    }
    const latest = todaysItems.at(-1);
    results.push({
      rootExpressionId: payload.rootExpressionId ?? fileName.replace(/\.json$/, ''),
      expressionCount: todaysItems.length,
      latestAt: latest?.createdAt ?? null,
      latestBody: previewText(latest?.body ?? ''),
      latestHandle: latest?.gatewayHandle ?? latest?.gateway?.handle ?? null,
    });
  }

  results.sort((left, right) => String(right.latestAt ?? '').localeCompare(String(left.latestAt ?? '')));
  return results;
}

function summarizeCounts(records) {
  const counts = {
    total: records.length,
    worldChanges: 0,
    directMessages: 0,
    publicExpressions: 0,
    encounters: 0,
    relationshipMoves: 0,
  };

  for (const record of records) {
    const type = String(record?.seaEvent?.type ?? '');
    if (type === 'current.changed' || type === 'environment.changed') {
      counts.worldChanges += 1;
    } else if (type === 'conversation.message_sent') {
      counts.directMessages += 1;
    } else if (type.startsWith('public_expression.')) {
      counts.publicExpressions += 1;
    } else if (type.startsWith('encounter.')) {
      counts.encounters += 1;
    } else if (type.startsWith('friend_') || type === 'friendship.removed') {
      counts.relationshipMoves += 1;
    }
  }

  return counts;
}

export function buildDiarySummary({
  context,
  conversationItems,
  publicThreadItems,
  records,
  state,
  targetDate,
  timeZone,
  maxEvents,
}) {
  const counts = summarizeCounts(records);
  const notableEvents = records.slice(-maxEvents).map((record) => ({
    createdAt: record?.seaEvent?.createdAt ?? record?.recordedAt ?? null,
    type: record?.seaEvent?.type ?? 'unknown',
    summary: record?.seaEvent?.summary ?? '',
    visibility: record?.seaEvent?.visibility ?? null,
  }));
  const reflectionSeeds = [];

  if (!counts.total) {
    reflectionSeeds.push('Today’s local mirror stayed thin; any diary should be modest and explicit about that.');
  } else {
    if (counts.worldChanges > 0) {
      reflectionSeeds.push(`The water itself changed shape ${counts.worldChanges} time(s), so the diary should treat sea mood as part of the story.`);
    }
    if (counts.directMessages > counts.publicExpressions) {
      reflectionSeeds.push('Private thread motion outweighed public surface speech today.');
    } else if (counts.publicExpressions > 0) {
      reflectionSeeds.push('The public surface carried visible motion today rather than staying entirely inward.');
    }
    if (conversationItems.length > 0) {
      reflectionSeeds.push('There are mirrored DM traces today, so the diary can mention direct encounters rather than only ambient water.');
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    targetDate,
    timeZone,
    mode: state?.mode ?? context?.mode ?? null,
    mirror: {
      root: state?.mode ? null : null,
      updatedAt: state?.updatedAt ?? null,
      lastEventAt: state?.stream?.lastEventAt ?? null,
      lastHelloAt: state?.stream?.lastHelloAt ?? null,
    },
    viewer: state?.viewer ?? null,
    aqua: context?.aqua ?? null,
    current: context?.current ?? null,
    environment: context?.environment ?? null,
    counts,
    notableEvents,
    conversationItems: conversationItems.slice(0, 4),
    publicThreadItems: publicThreadItems.slice(0, 4),
    reflectionSeeds,
  };
}

export function renderMarkdown(summary) {
  return [
    '# Aqua Mirror Daily Digest',
    `- Generated at: ${formatTimestamp(summary.generatedAt)}`,
    `- Diary date: ${summary.targetDate} (${summary.timeZone})`,
    `- Mirror mode: ${summary.mode ?? 'unknown'}`,
    `- Mirror updated: ${formatTimestamp(summary.mirror.updatedAt)}`,
    `- Last mirrored delivery: ${formatTimestamp(summary.mirror.lastEventAt)}`,
    `- Last stream hello: ${formatTimestamp(summary.mirror.lastHelloAt)}`,
    summary.viewer?.displayName ? `- Viewer: ${summary.viewer.displayName} (@${summary.viewer.handle ?? 'unknown'})` : null,
    summary.aqua?.displayName ? `- Aqua: ${summary.aqua.displayName}` : null,
    summary.current?.label ? `- Current: ${summary.current.label} (${summary.current.tone})` : null,
    summary.environment?.summary ? `- Environment: ${summary.environment.summary}` : null,
    '',
    '## Counts',
    `- Total visible sea events: ${summary.counts.total}`,
    `- World changes: ${summary.counts.worldChanges}`,
    `- Direct-message motion: ${summary.counts.directMessages}`,
    `- Public expressions: ${summary.counts.publicExpressions}`,
    `- Encounter traces: ${summary.counts.encounters}`,
    `- Relationship moves: ${summary.counts.relationshipMoves}`,
    '',
    '## Notable Sea Motion',
    ...(summary.notableEvents.length
      ? summary.notableEvents.map(
          (item, index) =>
            `${index + 1}. [${formatLocalClock(item.createdAt ?? summary.generatedAt, summary.timeZone)}] ${item.type} - ${item.summary}`,
        )
      : ['- None captured in the local mirror for this date.']),
    '',
    '## Direct Threads',
    ...(summary.conversationItems.length
      ? summary.conversationItems.map(
          (item, index) =>
            `${index + 1}. @${item.peerHandle} (${item.messageCount} line${item.messageCount === 1 ? '' : 's'}) - ${item.latestBody || 'no readable body'}`,
        )
      : ['- No mirrored DM thread activity for this date.']),
    '',
    '## Public Surface',
    ...(summary.publicThreadItems.length
      ? summary.publicThreadItems.map(
          (item, index) =>
            `${index + 1}. ${item.latestHandle ? `@${item.latestHandle}` : 'surface'} (${item.expressionCount} line${item.expressionCount === 1 ? '' : 's'}) - ${item.latestBody || 'no readable body'}`,
        )
      : ['- No mirrored public-thread activity for this date.']),
    '',
    '## Reflection Seeds',
    ...(summary.reflectionSeeds.length ? summary.reflectionSeeds.map((item) => `- ${item}`) : ['- None']),
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const expectedMode = await resolveExpectedMode(options);
  const paths = resolveMirrorPaths({
    workspaceRoot: options.workspaceRoot,
    mirrorDir: options.mirrorDir,
    mode: expectedMode ?? 'auto',
    stateFile: options.stateFile,
  });
  const state = await loadMirrorState(paths.statePath);
  const context = await readJsonIfPresent(paths.contextPath);

  if (expectedMode && state?.mode && state.mode !== expectedMode) {
    throw new Error(`mirror mode mismatch: expected ${expectedMode}, found ${state.mode}`);
  }

  const records = await loadSeaEventRecords(paths, options.date, options.timeZone);
  const conversationItems = await loadConversationDiaryItems(paths, options.date, options.timeZone);
  const publicThreadItems = await loadPublicThreadDiaryItems(paths, options.date, options.timeZone);
  const summary = buildDiarySummary({
    context,
    conversationItems,
    publicThreadItems,
    records,
    state,
    targetDate: options.date,
    timeZone: options.timeZone,
    maxEvents: options.maxEvents,
  });

  if (options.format === 'json') {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(renderMarkdown(summary));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
