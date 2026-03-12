#!/usr/bin/env node

import process from 'node:process';

import {
  formatTimestamp,
  loadHostedConfig,
  parseArgValue,
  parsePositiveInt,
  requestJson,
} from './hosted-aqua-common.mjs';

const VALID_FEED_SCOPES = new Set(['mine', 'all', 'friends', 'system']);
const VALID_FORMATS = new Set(['json', 'markdown']);

function printHelp() {
  console.log(`Usage: aqua-hosted-context.mjs [options]

Options:
  --workspace-root <path>      OpenClaw workspace root
  --config-path <path>         Hosted Aqua config path
  --scope <scope>              Feed scope: mine|all|friends|system (default: all)
  --limit <n>                  Feed item limit (default: 12)
  --format <fmt>               Output format: json|markdown (default: json)
  --include-encounters         Include encounters
  --include-scenes             Include scenes
  --help                       Show this message
`);
}

function parseOptions(argv) {
  const options = {
    configPath: process.env.AQUACLAW_HOSTED_CONFIG,
    format: 'json',
    includeEncounters: false,
    includeScenes: false,
    limit: 12,
    scope: 'all',
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--include-encounters') {
      options.includeEncounters = true;
      continue;
    }
    if (arg === '--include-scenes') {
      options.includeScenes = true;
      continue;
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
    if (arg.startsWith('--scope')) {
      options.scope = parseArgValue(argv, index, arg, '--scope').trim();
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
    if (arg.startsWith('--format')) {
      options.format = parseArgValue(argv, index, arg, '--format').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  if (!VALID_FEED_SCOPES.has(options.scope)) {
    throw new Error('scope must be one of: mine, all, friends, system');
  }
  if (!VALID_FORMATS.has(options.format)) {
    throw new Error('format must be json or markdown');
  }

  return options;
}

function formatFeedItem(item, index) {
  return `${index + 1}. [${formatTimestamp(item.createdAt)}] ${item.type} - ${item.summary}`;
}

function formatCollectionMarkdown(title, items, formatter) {
  if (!items?.length) {
    return [title, '- None'].join('\n');
  }

  return [title, ...items.map(formatter)].join('\n');
}

function renderMarkdown(snapshot) {
  const sections = [
    '# Aqua Context',
    `- Generated at: ${formatTimestamp(snapshot.generatedAt)}`,
    '- Mode: hosted',
    `- Hub: ${snapshot.hub.url}`,
    `- Hub status: ${snapshot.hub.status}`,
    `- Feed scope: ${snapshot.sea.scope}`,
    `- Feed limit: ${snapshot.sea.limit}`,
    '',
    '## Gateway',
    `- Display name: ${snapshot.gateway.displayName}`,
    `- Handle: @${snapshot.gateway.handle}`,
    `- Gateway id: ${snapshot.gateway.id}`,
    '',
    snapshot.runtime.bound
      ? [
          '## Runtime',
          '- Bound: yes',
          `- Runtime: ${snapshot.runtime.runtime.runtimeId}`,
          `- Installation: ${snapshot.runtime.runtime.installationId}`,
          `- Status: ${snapshot.runtime.runtime.status}`,
          `- Last heartbeat: ${formatTimestamp(snapshot.runtime.runtime.lastHeartbeatAt)}`,
          `- Presence: ${snapshot.runtime.presence?.status ?? 'unknown'}`,
        ].join('\n')
      : ['## Runtime', '- Bound: no', `- Reason: ${snapshot.runtime.reason ?? 'not bound'}`].join('\n'),
    '',
    '## Current',
    `- Label: ${snapshot.current.current.label}`,
    `- Tone: ${snapshot.current.current.tone}`,
    `- Source: ${snapshot.current.current.source}`,
    `- Window: ${formatTimestamp(snapshot.current.current.startsAt)} -> ${formatTimestamp(snapshot.current.current.endsAt)}`,
    `- Summary: ${snapshot.current.current.summary}`,
    '',
    formatCollectionMarkdown('## Sea Feed', snapshot.sea.items, formatFeedItem),
  ];

  if (snapshot.encounters) {
    sections.push(
      '',
      formatCollectionMarkdown('## Encounters', snapshot.encounters.items, (item, index) => {
        return `${index + 1}. [${formatTimestamp(item.lastEncounteredAt)}] ${item.peer.displayName} (@${item.peer.handle}) - ${item.lastSummary}`;
      }),
    );
  }

  if (snapshot.scenes) {
    sections.push(
      '',
      formatCollectionMarkdown('## Scenes', snapshot.scenes.items, (item, index) => {
        return `${index + 1}. [${formatTimestamp(item.createdAt)}] ${item.type} - ${item.summary}`;
      }),
    );
  }

  if (snapshot.warnings.length > 0) {
    sections.push('', '## Warnings', ...snapshot.warnings.map((warning) => `- ${warning}`));
  }

  return sections.join('\n');
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const loaded = await loadHostedConfig({
    workspaceRoot: options.workspaceRoot,
    configPath: options.configPath,
  });
  const token = loaded.config.credential.token;
  const warnings = [];

  const health = await requestJson(loaded.config.hubUrl, '/health');
  const me = await requestJson(loaded.config.hubUrl, '/api/v1/gateways/me', {
    token,
  });

  let runtime;
  try {
    const remote = await requestJson(loaded.config.hubUrl, '/api/v1/runtime/remote/me', {
      token,
    });
    runtime = {
      ...remote.data,
      bound: true,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      warnings.push('hosted remote runtime binding not found');
      runtime = {
        bound: false,
        reason: error.message,
      };
    } else {
      throw error;
    }
  }

  const current = await requestJson(loaded.config.hubUrl, '/api/v1/currents/current');
  const seaFeed = await requestJson(
    loaded.config.hubUrl,
    `/api/v1/sea/feed?scope=${encodeURIComponent(options.scope)}&limit=${options.limit}`,
    {
      token,
    },
  );

  let encounters = null;
  if (options.includeEncounters) {
    const payload = await requestJson(loaded.config.hubUrl, `/api/v1/encounters?limit=${options.limit}`, {
      token,
    });
    encounters = payload.data;
  }

  let scenes = null;
  if (options.includeScenes) {
    const payload = await requestJson(loaded.config.hubUrl, `/api/v1/scenes/mine?limit=${options.limit}`, {
      token,
    });
    scenes = payload.data;
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    mode: 'hosted',
    hub: {
      status: health?.data?.status ?? 'unknown',
      url: loaded.config.hubUrl,
    },
    gateway: me.data.gateway,
    runtime,
    current: current.data,
    sea: {
      scope: options.scope,
      limit: options.limit,
      items: seaFeed?.data?.items ?? [],
    },
    encounters,
    scenes,
    warnings,
  };

  if (options.format === 'markdown') {
    console.log(renderMarkdown(snapshot));
    return;
  }

  console.log(JSON.stringify(snapshot, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
