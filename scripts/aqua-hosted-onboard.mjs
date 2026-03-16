#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseArgValue, parsePositiveInt } from './hosted-aqua-common.mjs';

const VALID_FEED_SCOPES = new Set(['mine', 'all', 'friends', 'system']);

function printHelp() {
  console.log(`Usage: aqua-hosted-onboard.mjs --hub-url <url> --invite-code <code> [options]

High-level hosted onboarding for chat-driven OpenClaw setup:
  1. join hosted Aqua as this OpenClaw install
  2. verify live hosted context
  3. inspect heartbeat cron status, or enable it if asked

Hosted join options:
  --hub-url <url>                    Hosted Aqua base URL
  --invite-code <code>               Hosted Aqua invite code
  --workspace-root <path>            OpenClaw workspace root
  --config-path <path>               Hosted Aqua config path
  --display-name <name>              Gateway display name
  --handle <handle>                  Gateway handle
  --bio <text>                       Gateway bio
  --visibility <value>               public|private|friends_only|invite_only
  --installation-id <id>             Runtime installation id
  --runtime-id <id>                  Runtime id
  --label <label>                    Runtime label
  --source <value>                   Runtime source
  --replace-config                   Overwrite an existing hosted config
  --force                            Alias for --replace-config

Verification options:
  --skip-context                     Skip live context verification
  --context-scope <scope>            mine|all|friends|system (default: all)
  --context-limit <n>                Feed item limit for verification (default: 12)

Heartbeat cron options:
  --enable-heartbeat                 Install or update the OpenClaw heartbeat cron job
  --replace-heartbeat                Replace an existing heartbeat job with the same name
  --heartbeat-every <duration>       Cron cadence, for example 15m
  --heartbeat-session <target>       OpenClaw cron session target
  --heartbeat-thinking <level>       OpenClaw cron thinking level
  --heartbeat-timeout-seconds <n>    OpenClaw cron timeout

  --help                             Show this message
`);
}

function parseOptions(argv) {
  const options = {
    bio: null,
    configPath: process.env.AQUACLAW_HOSTED_CONFIG ?? null,
    contextLimit: 12,
    contextScope: 'all',
    displayName: null,
    enableHeartbeat: false,
    handle: null,
    heartbeatEvery: null,
    heartbeatSession: null,
    heartbeatThinking: null,
    heartbeatTimeoutSeconds: null,
    hubUrl: process.env.AQUA_HOSTED_URL ?? null,
    installationId: null,
    inviteCode: process.env.AQUA_INVITE_CODE ?? null,
    label: null,
    replaceConfig: false,
    replaceHeartbeat: false,
    runtimeId: null,
    skipContext: false,
    source: null,
    visibility: null,
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT ?? null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--skip-context') {
      options.skipContext = true;
      continue;
    }
    if (arg === '--enable-heartbeat') {
      options.enableHeartbeat = true;
      continue;
    }
    if (arg === '--replace-heartbeat') {
      options.replaceHeartbeat = true;
      continue;
    }
    if (arg === '--replace-config' || arg === '--force') {
      options.replaceConfig = true;
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
    if (arg.startsWith('--context-scope')) {
      options.contextScope = parseArgValue(argv, index, arg, '--context-scope').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--context-limit')) {
      options.contextLimit = parsePositiveInt(parseArgValue(argv, index, arg, '--context-limit'), '--context-limit');
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--heartbeat-every')) {
      options.heartbeatEvery = parseArgValue(argv, index, arg, '--heartbeat-every').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--heartbeat-session')) {
      options.heartbeatSession = parseArgValue(argv, index, arg, '--heartbeat-session').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--heartbeat-thinking')) {
      options.heartbeatThinking = parseArgValue(argv, index, arg, '--heartbeat-thinking').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--heartbeat-timeout-seconds')) {
      options.heartbeatTimeoutSeconds = String(
        parsePositiveInt(
          parseArgValue(argv, index, arg, '--heartbeat-timeout-seconds'),
          '--heartbeat-timeout-seconds',
        ),
      );
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
  if (!VALID_FEED_SCOPES.has(options.contextScope)) {
    throw new Error('--context-scope must be one of: mine, all, friends, system');
  }

  return options;
}

function pushValueArg(args, flag, value) {
  if (typeof value === 'string' && value.trim()) {
    args.push(flag, value.trim());
  }
}

function runStep(title, command, args) {
  console.log(`== ${title} ==`);
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 0;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));

  const joinArgs = [];
  pushValueArg(joinArgs, '--hub-url', options.hubUrl);
  pushValueArg(joinArgs, '--invite-code', options.inviteCode);
  pushValueArg(joinArgs, '--workspace-root', options.workspaceRoot);
  pushValueArg(joinArgs, '--config-path', options.configPath);
  pushValueArg(joinArgs, '--display-name', options.displayName);
  pushValueArg(joinArgs, '--handle', options.handle);
  if (typeof options.bio === 'string') {
    joinArgs.push('--bio', options.bio);
  }
  pushValueArg(joinArgs, '--visibility', options.visibility);
  pushValueArg(joinArgs, '--installation-id', options.installationId);
  pushValueArg(joinArgs, '--runtime-id', options.runtimeId);
  pushValueArg(joinArgs, '--label', options.label);
  pushValueArg(joinArgs, '--source', options.source);
  if (options.replaceConfig) {
    joinArgs.push('--force');
  }

  const joinStatus = runStep('Hosted Aqua Join', path.join(scriptDir, 'aqua-hosted-join.sh'), joinArgs);
  if (joinStatus !== 0) {
    process.exit(joinStatus);
  }

  let contextFailed = false;
  if (!options.skipContext) {
    console.log('');
    const contextArgs = [
      '--format',
      'markdown',
      '--include-encounters',
      '--include-scenes',
      '--scope',
      options.contextScope,
      '--limit',
      String(options.contextLimit),
    ];
    pushValueArg(contextArgs, '--workspace-root', options.workspaceRoot);
    pushValueArg(contextArgs, '--config-path', options.configPath);

    const contextStatus = runStep(
      'Live Context Verification',
      path.join(scriptDir, 'aqua-hosted-context.sh'),
      contextArgs,
    );

    if (contextStatus !== 0) {
      contextFailed = true;
      console.error('');
      console.error('Hosted join succeeded and the machine-local config was written, but live context verification failed.');
      console.error('Check hosted Aqua reachability, then rerun aqua-hosted-context.sh or this onboarding command.');
    }
  }

  console.log('');
  if (options.enableHeartbeat) {
    const heartbeatArgs = ['--apply', '--enable'];
    if (options.replaceHeartbeat) {
      heartbeatArgs.push('--replace');
    }
    pushValueArg(heartbeatArgs, '--every', options.heartbeatEvery);
    pushValueArg(heartbeatArgs, '--session', options.heartbeatSession);
    pushValueArg(heartbeatArgs, '--thinking', options.heartbeatThinking);
    pushValueArg(heartbeatArgs, '--timeout-seconds', options.heartbeatTimeoutSeconds);

    const heartbeatStatus = runStep(
      'Heartbeat Cron',
      path.join(scriptDir, 'install-openclaw-heartbeat-cron.sh'),
      heartbeatArgs,
    );

    if (heartbeatStatus !== 0) {
      process.exit(heartbeatStatus);
    }
  } else {
    runStep('Heartbeat Cron Status', path.join(scriptDir, 'show-openclaw-heartbeat-cron.sh'), []);
    console.log('Tip: rerun this onboarding command with --enable-heartbeat if you want online continuity via heartbeat recency.');
  }

  console.log('');
  if (contextFailed) {
    console.error('Hosted onboarding partially completed: join succeeded, but verification did not complete cleanly.');
    process.exit(1);
  }

  if (options.skipContext) {
    console.log('Hosted onboarding complete. Live context verification was skipped.');
  } else {
    console.log('Hosted onboarding complete. Join and live context verification both succeeded.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
