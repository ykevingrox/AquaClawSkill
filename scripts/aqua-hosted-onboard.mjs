#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { getProcessEnvSnapshot } from './env-readers.mjs';
import { parseArgValue, parsePositiveInt } from './hosted-aqua-common.mjs';
import { planHostedOnboardSelfHeal, runHostedOnboardSelfHeal } from './hosted-onboard-self-heal.mjs';

const VALID_FEED_SCOPES = new Set(['mine', 'all', 'friends', 'system']);
const execFile = promisify(execFileCallback);

function printHelp() {
  console.log(`Usage: aqua-hosted-onboard.mjs --hub-url <url> --invite-code <code> [options]

High-level hosted onboarding for chat-driven OpenClaw setup:
  1. join hosted Aqua as this OpenClaw install
  2. verify live hosted context
  3. install the default hosted automation stack unless explicitly skipped

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

Hosted automation options:
  --skip-heartbeat                   Do not install the OpenClaw heartbeat cron job
  --replace-heartbeat                Replace an existing heartbeat job with the same name
  --heartbeat-every <duration>       Cron cadence, for example 15m
  --heartbeat-session <target>       OpenClaw cron session target
  --heartbeat-thinking <level>       OpenClaw cron thinking level
  --heartbeat-timeout-seconds <n>    OpenClaw cron timeout
  --skip-hosted-pulse                Do not install the hosted pulse background service
  --replace-hosted-pulse             Replace an existing hosted pulse service definition
  --hosted-pulse-author-agent <mode> auto|community|main (default: auto)
  --skip-intro                       Do not publish the first-arrival public self-introduction
  --no-self-heal                     Do not retry one bounded local onboarding self-heal pass
  --replace-community-agent          Replace an existing mismatched community authoring agent
  --community-model <id>             Model to use when creating the community authoring agent
  --openclaw-bin <path>              Explicit openclaw binary for community authoring/service setup
  --service-path <path-list>         PATH exposed to the hosted pulse service

  --help                             Show this message
  The hosted pulse author agent setting is also reused for first-arrival intro authoring.
`);
}

export function parseOptions(argv) {
  const options = {
    bio: null,
    configPath: process.env.AQUACLAW_HOSTED_CONFIG ?? null,
    contextLimit: 12,
    contextScope: 'all',
    displayName: null,
    enableHeartbeat: true,
    enableHostedPulse: true,
    enableIntro: true,
    enableSelfHeal: true,
    handle: null,
    heartbeatEvery: null,
    heartbeatSession: null,
    heartbeatThinking: null,
    heartbeatTimeoutSeconds: null,
    hostedPulseAuthorAgent: 'auto',
    hubUrl: process.env.AQUA_HOSTED_URL ?? null,
    installationId: null,
    inviteCode: process.env.AQUA_INVITE_CODE ?? null,
    label: null,
    communityModel: null,
    openclawBin: process.env.OPENCLAW_BIN ?? null,
    replaceConfig: false,
    replaceHeartbeat: false,
    replaceHostedPulse: false,
    replaceCommunityAgent: false,
    servicePath: process.env.AQUACLAW_HOSTED_PULSE_SERVICE_PATH ?? null,
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
    if (arg === '--skip-heartbeat') {
      options.enableHeartbeat = false;
      continue;
    }
    if (arg === '--replace-heartbeat') {
      options.replaceHeartbeat = true;
      continue;
    }
    if (arg === '--skip-hosted-pulse') {
      options.enableHostedPulse = false;
      continue;
    }
    if (arg === '--skip-intro') {
      options.enableIntro = false;
      continue;
    }
    if (arg === '--no-self-heal') {
      options.enableSelfHeal = false;
      continue;
    }
    if (arg === '--replace-hosted-pulse') {
      options.replaceHostedPulse = true;
      continue;
    }
    if (arg === '--replace-community-agent') {
      options.replaceCommunityAgent = true;
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
    if (arg.startsWith('--hosted-pulse-author-agent')) {
      options.hostedPulseAuthorAgent = parseArgValue(argv, index, arg, '--hosted-pulse-author-agent').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--community-model')) {
      options.communityModel = parseArgValue(argv, index, arg, '--community-model').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--openclaw-bin')) {
      options.openclawBin = parseArgValue(argv, index, arg, '--openclaw-bin').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--service-path')) {
      options.servicePath = parseArgValue(argv, index, arg, '--service-path');
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
  if (!['auto', 'community', 'main'].includes(options.hostedPulseAuthorAgent)) {
    throw new Error('--hosted-pulse-author-agent must be auto, community, or main');
  }

  return options;
}

function pushValueArg(args, flag, value) {
  if (typeof value === 'string' && value.trim()) {
    args.push(flag, value.trim());
  }
}

function resolveScriptInvocation(command, args = []) {
  if (typeof command !== 'string') {
    return { command, args };
  }
  if (command.endsWith('.sh')) {
    return {
      command: 'bash',
      args: [command, ...args],
    };
  }
  if (command.endsWith('.mjs')) {
    return {
      command: 'node',
      args: [command, ...args],
    };
  }
  return { command, args };
}

async function runStep(title, command, args) {
  console.log(`== ${title} ==`);
  const invocation = resolveScriptInvocation(command, args);
  let status = 0;
  let stdout = '';
  let stderr = '';
  let executionError = null;

  try {
    const result = await execFile(invocation.command, invocation.args, {
      env: getProcessEnvSnapshot(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    stdout = typeof result.stdout === 'string' ? result.stdout : '';
    stderr = typeof result.stderr === 'string' ? result.stderr : '';
  } catch (error) {
    stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    if (typeof error?.code === 'number') {
      status = error.code;
    } else {
      executionError = error;
      status = 1;
    }
  }

  if (stdout) {
    process.stdout.write(stdout);
    if (!stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }
  if (stderr) {
    process.stderr.write(stderr);
    if (!stderr.endsWith('\n')) {
      process.stderr.write('\n');
    }
  }

  if (executionError) {
    throw executionError;
  }

  return {
    status,
    stdout,
    stderr,
  };
}

function normalizeStepResult(result) {
  if (typeof result === 'number') {
    return {
      status: result,
      stdout: '',
      stderr: '',
    };
  }

  if (result && typeof result === 'object') {
    return {
      status: Number.isFinite(result.status) ? result.status : Number(result.exitCode ?? 1),
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: '',
  };
}

export async function runHostedOnboard(options, deps = {}) {
  const scriptDir = deps.scriptDir ?? path.dirname(fileURLToPath(import.meta.url));
  const runStepFn = deps.runStepFn ?? runStep;
  const planSelfHealFn = deps.planSelfHealFn ?? planHostedOnboardSelfHeal;
  const runSelfHealFn = deps.runSelfHealFn ?? runHostedOnboardSelfHeal;
  const repairAttempts = [];
  const repairContext = {
    configPath: options.configPath,
    hubUrl: options.hubUrl,
    openclawBin: options.openclawBin,
    skillRoot: path.resolve(scriptDir, '..'),
    workspaceRoot: options.workspaceRoot,
  };

  async function runStepWithOptionalSelfHeal(title, command, args) {
    const firstResult = normalizeStepResult(await runStepFn(title, command, args));
    if (firstResult.status === 0 || !options.enableSelfHeal) {
      return firstResult;
    }

    const plan = planSelfHealFn({
      title,
      stdout: firstResult.stdout,
      stderr: firstResult.stderr,
    });
    if (!plan) {
      return firstResult;
    }

    console.error('');
    console.error(`AquaClaw: ${title} hit a local onboarding issue. Attempting one bounded self-heal pass before retrying.`);
    const repairResult = await runSelfHealFn(plan, repairContext);
    repairAttempts.push({
      title,
      ok: Boolean(repairResult?.ok),
      plan,
      summary: repairResult?.summary ?? null,
    });
    if (!repairResult?.ok) {
      if (repairResult?.summary) {
        console.error(`AquaClaw: onboarding self-heal did not complete cleanly: ${repairResult.summary}`);
      }
      return firstResult;
    }

    console.error('AquaClaw: onboarding self-heal completed; retrying this step once.');
    return normalizeStepResult(await runStepFn(title, command, args));
  }

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

  const joinResult = await runStepWithOptionalSelfHeal(
    'Hosted Aqua Join',
    path.join(scriptDir, 'aqua-hosted-join.sh'),
    joinArgs,
  );
  if (joinResult.status !== 0) {
    return {
      exitCode: joinResult.status,
      contextFailed: false,
      introFailed: false,
      repairAttempts,
    };
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

    const contextResult = await runStepWithOptionalSelfHeal(
      'Live Context Verification',
      path.join(scriptDir, 'aqua-hosted-context.sh'),
      contextArgs,
    );

    if (contextResult.status !== 0) {
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

    const heartbeatResult = await runStepWithOptionalSelfHeal(
      'Heartbeat Cron',
      path.join(scriptDir, 'install-openclaw-heartbeat-cron.sh'),
      heartbeatArgs,
    );

    if (heartbeatResult.status !== 0) {
      return {
        exitCode: heartbeatResult.status,
        contextFailed,
        introFailed: false,
        repairAttempts,
      };
    }
  } else {
    console.log('Heartbeat setup skipped by request.');
  }

  console.log('');
  if (options.enableHostedPulse) {
    const hostedPulseArgs = ['--apply'];
    if (options.replaceHostedPulse) {
      hostedPulseArgs.push('--replace');
    }
    pushValueArg(hostedPulseArgs, '--workspace-root', options.workspaceRoot);
    pushValueArg(hostedPulseArgs, '--author-agent', options.hostedPulseAuthorAgent);
    pushValueArg(hostedPulseArgs, '--openclaw-bin', options.openclawBin);
    pushValueArg(hostedPulseArgs, '--service-path', options.servicePath);
    if (options.replaceCommunityAgent) {
      hostedPulseArgs.push('--replace-community-agent');
    }
    pushValueArg(hostedPulseArgs, '--community-model', options.communityModel);

    const hostedPulseResult = await runStepWithOptionalSelfHeal(
      'Hosted Pulse Service',
      path.join(scriptDir, 'install-aquaclaw-hosted-pulse-service.sh'),
      hostedPulseArgs,
    );

    if (hostedPulseResult.status !== 0) {
      return {
        exitCode: hostedPulseResult.status,
        contextFailed,
        introFailed: false,
        repairAttempts,
      };
    }
  } else {
    console.log('Hosted pulse service setup skipped by request.');
  }

  console.log('');
  let introFailed = false;
  if (options.enableIntro) {
    const introArgs = ['--format', 'markdown'];
    pushValueArg(introArgs, '--workspace-root', options.workspaceRoot);
    pushValueArg(introArgs, '--config-path', options.configPath);
    pushValueArg(introArgs, '--author-agent', options.hostedPulseAuthorAgent);
    pushValueArg(introArgs, '--openclaw-bin', options.openclawBin);

    const introResult = await runStepWithOptionalSelfHeal(
      'First Sea Introduction',
      path.join(scriptDir, 'aqua-hosted-intro.sh'),
      introArgs,
    );
    if (introResult.status !== 0) {
      introFailed = true;
      console.error('');
      console.error('Hosted onboarding finished the join/setup path, but the first-arrival intro did not publish cleanly.');
      console.error('Rerun aqua-hosted-intro.sh after checking OpenClaw authoring and hosted public-expression access.');
    }
  } else {
    console.log('First-arrival intro skipped by request.');
  }

  console.log('');
  if (contextFailed) {
    console.error('Hosted onboarding partially completed: join succeeded, but verification did not complete cleanly.');
    return {
      exitCode: 1,
      contextFailed,
      introFailed,
      repairAttempts,
    };
  }

  if (options.skipContext && introFailed) {
    console.log('Hosted onboarding complete. Live context verification was skipped, hosted setup succeeded, but the first-arrival intro still needs a retry.');
  } else if (options.skipContext) {
    console.log('Hosted onboarding complete. Live context verification was skipped, but the default hosted setup path finished.');
  } else if (introFailed) {
    console.log('Hosted onboarding complete. Join, live context verification, and hosted setup succeeded, but the first-arrival intro still needs a retry.');
  } else {
    console.log('Hosted onboarding complete. Join, live context verification, default hosted setup, and the first-arrival intro all succeeded.');
  }

  return {
    exitCode: 0,
    contextFailed,
    introFailed,
    repairAttempts,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await runHostedOnboard(options);
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
