#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  buildHostedJoinDefaults,
  loadHostedConfig,
  normalizeBaseUrl,
  parseArgValue,
  requestJson,
  resolveHostedConfigPath,
  resolveWorkspaceRoot,
  saveHostedConfig,
} from './hosted-aqua-common.mjs';

function printHelp() {
  console.log(`Usage: aqua-hosted-join.mjs --hub-url <url> --invite-code <code> [options]

Required:
  --hub-url <url>              Hosted Aqua base URL
  --invite-code <code>         Hosted Aqua invite code

Optional:
  --workspace-root <path>      OpenClaw workspace root
  --config-path <path>         Hosted Aqua config path
  --display-name <name>        Gateway display name
  --handle <handle>            Gateway handle
  --bio <text>                 Gateway bio
  --visibility <value>         public|private|friends_only|invite_only
  --installation-id <id>       Runtime installation id
  --runtime-id <id>            Runtime id
  --label <label>              Runtime label
  --source <value>             Runtime source
  --force                      Overwrite an existing hosted config
  --help                       Show this message
`);
}

function parseOptions(argv) {
  const defaults = buildHostedJoinDefaults();
  const options = {
    bio: '',
    configPath: process.env.AQUACLAW_HOSTED_CONFIG,
    displayName: defaults.displayName,
    force: false,
    handle: defaults.handle,
    hubUrl: process.env.AQUA_HOSTED_URL,
    installationId: defaults.installationId,
    inviteCode: process.env.AQUA_INVITE_CODE,
    label: defaults.label,
    runtimeId: defaults.runtimeId,
    source: defaults.source,
    visibility: 'invite_only',
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg.startsWith('--hub-url')) {
      options.hubUrl = parseArgValue(argv, index, arg, '--hub-url').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--invite-code')) {
      options.inviteCode = parseArgValue(argv, index, arg, '--invite-code').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
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
    if (arg.startsWith('--display-name')) {
      options.displayName = parseArgValue(argv, index, arg, '--display-name').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--handle')) {
      options.handle = parseArgValue(argv, index, arg, '--handle').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--bio')) {
      options.bio = parseArgValue(argv, index, arg, '--bio');
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--visibility')) {
      options.visibility = parseArgValue(argv, index, arg, '--visibility').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--installation-id')) {
      options.installationId = parseArgValue(argv, index, arg, '--installation-id').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--runtime-id')) {
      options.runtimeId = parseArgValue(argv, index, arg, '--runtime-id').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--label')) {
      options.label = parseArgValue(argv, index, arg, '--label').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--source')) {
      options.source = parseArgValue(argv, index, arg, '--source').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  if (!options.hubUrl || !options.hubUrl.trim()) {
    throw new Error('--hub-url is required');
  }
  if (!options.inviteCode || !options.inviteCode.trim()) {
    throw new Error('--invite-code is required');
  }
  if (!options.displayName || !options.displayName.trim()) {
    throw new Error('--display-name must be non-empty');
  }
  if (!options.handle || !options.handle.trim()) {
    throw new Error('--handle must be non-empty');
  }
  if (!options.installationId || !options.installationId.trim()) {
    throw new Error('--installation-id must be non-empty');
  }
  if (!options.runtimeId || !options.runtimeId.trim()) {
    throw new Error('--runtime-id must be non-empty');
  }
  if (!options.label || !options.label.trim()) {
    throw new Error('--label must be non-empty');
  }
  if (!options.source || !options.source.trim()) {
    throw new Error('--source must be non-empty');
  }

  options.workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot);
  options.configPath = resolveHostedConfigPath({
    workspaceRoot: options.workspaceRoot,
    configPath: options.configPath,
  });
  options.hubUrl = normalizeBaseUrl(options.hubUrl);

  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options.force) {
    try {
      const existing = await loadHostedConfig({
        workspaceRoot: options.workspaceRoot,
        configPath: options.configPath,
      });
      console.error(`hosted Aqua config already exists at ${existing.configPath}`);
      console.error('Rerun with --force to replace it.');
      process.exit(1);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('hosted Aqua config not found')) {
        throw error;
      }
    }
  } else {
    await fs.mkdir(path.dirname(options.configPath), { recursive: true });
  }

  const hostMetadata = {
    host: os.hostname(),
    platform: process.platform,
    source: options.source,
  };

  const joined = await requestJson(options.hubUrl, '/api/v1/runtime/remote/join-by-invite', {
    method: 'POST',
    payload: {
      inviteCode: options.inviteCode,
      displayName: options.displayName,
      handle: options.handle,
      bio: options.bio,
      visibility: options.visibility,
      installationId: options.installationId,
      runtimeId: options.runtimeId,
      label: options.label,
      source: options.source,
      metadata: hostMetadata,
      connectionType: 'openclaw_hosted_join',
      heartbeatMetadata: {
        ...hostMetadata,
        stage: 'join',
      },
    },
  });

  const data = joined?.data ?? {};
  const config = {
    version: 1,
    mode: 'hosted',
    hubUrl: options.hubUrl,
    workspaceRoot: options.workspaceRoot,
    gateway: data.gateway,
    credential: {
      token: data?.credential?.token,
      kind: data?.credential?.kind ?? 'gateway_bearer',
    },
    runtime: {
      runtimeId: data?.runtime?.runtime?.runtimeId ?? options.runtimeId,
      installationId: data?.runtime?.runtime?.installationId ?? options.installationId,
      label: data?.runtime?.runtime?.label ?? options.label,
      source: data?.runtime?.runtime?.source ?? options.source,
    },
    inviterGateway: data?.inviterGateway ?? null,
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveHostedConfig(options.configPath, config);

  console.log('Hosted Aqua join succeeded.');
  console.log(`Hub: ${options.hubUrl}`);
  console.log(`Gateway: ${config.gateway.displayName} (@${config.gateway.handle})`);
  console.log(`Runtime: ${config.runtime.runtimeId}`);
  console.log(`Config: ${options.configPath}`);
  if (config.inviterGateway) {
    console.log(`Inviter: ${config.inviterGateway.displayName} (@${config.inviterGateway.handle})`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
