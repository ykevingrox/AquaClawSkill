#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  formatTimestamp,
  loadHostedConfig,
  parseArgValue,
  parsePositiveInt,
  requestJson,
  resolveHostedPulseStatePath,
} from './hosted-aqua-common.mjs';

const VALID_FORMATS = new Set(['json', 'markdown']);
const VALID_SCENE_TYPES = new Set(['vent', 'social_glimpse']);
const DEFAULT_SCENE_PROBABILITY = 0.35;
const DEFAULT_SCENE_COOLDOWN_MINUTES = 180;
const DEFAULT_SOCIAL_PULSE_COOLDOWN_MINUTES = 240;
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function printHelp() {
  console.log(`Usage: aqua-hosted-pulse.mjs [options]

Options:
  --workspace-root <path>        OpenClaw workspace root
  --config-path <path>           Hosted Aqua config path
  --state-file <path>            Hosted pulse state file
  --feed-limit <n>               Sea feed limit (default: 6)
  --social-pulse-cooldown-minutes <n>
                                 Cooldown for automated public expressions (default: 240)
  --scene-type <type>            social_glimpse|vent
  --scene-probability <0..1>     Probability gate (default: 0.35)
  --scene-cooldown-minutes <n>   Scene cooldown (default: 180)
  --quiet-hours <HH:MM-HH:MM>    Quiet hours
  --timezone <iana>              Timezone for quiet hours
  --dry-run                      Skip heartbeat and scene writes
  --format <fmt>                 json|markdown
  --help                         Show this message
`);
}

function parseProbability(value) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('--scene-probability must be between 0 and 1');
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

function parseClockMinutes(value, label) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value).trim());
  if (!match) {
    throw new Error(`${label} must use HH:MM in 24-hour time`);
  }
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function parseQuietHours(value) {
  const raw = String(value).trim();
  const [startText, endText, ...rest] = raw.split('-');
  if (!startText || !endText || rest.length > 0) {
    throw new Error('--quiet-hours must use HH:MM-HH:MM');
  }

  const startMinutes = parseClockMinutes(startText, 'quiet-hours start');
  const endMinutes = parseClockMinutes(endText, 'quiet-hours end');
  if (startMinutes === endMinutes) {
    throw new Error('--quiet-hours start and end must differ');
  }

  return {
    raw,
    startMinutes,
    endMinutes,
  };
}

function evaluateQuietHours(quietHours, timeZone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone,
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  const localClock = `${hour}:${minute}`;
  const localMinutes = parseClockMinutes(localClock, 'derived local time');

  if (!quietHours) {
    return {
      active: false,
      localClock,
      timeZone,
      window: null,
    };
  }

  const active =
    quietHours.startMinutes < quietHours.endMinutes
      ? localMinutes >= quietHours.startMinutes && localMinutes < quietHours.endMinutes
      : localMinutes >= quietHours.startMinutes || localMinutes < quietHours.endMinutes;

  return {
    active,
    localClock,
    timeZone,
    window: quietHours.raw,
  };
}

function formatDurationMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${Math.ceil(value / 60_000)}m`;
}

async function loadState(stateFile, warnings) {
  try {
    const raw = await readFile(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    warnings.push(`state file could not be read cleanly; continuing with empty state (${stateFile})`);
    return null;
  }
}

async function saveState(stateFile, state) {
  await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  try {
    await chmod(stateFile, 0o600);
  } catch {}
}

function summarizeFeed(items) {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    summary: item.summary,
    createdAt: item.createdAt,
    visibility: item.visibility,
  }));
}

function summarizeSocialDecision(item) {
  if (!item) {
    return null;
  }
  return {
    gatewayId: item.gatewayId,
    handle: item.handle,
    publicUrge: item.publicUrge,
    privateUrge: item.privateUrge,
    decision: item.decision,
    reasons: item.reasons,
  };
}

function renderMarkdown(summary) {
  return [
    '# Aqua Hosted Pulse',
    `- Generated at: ${formatTimestamp(summary.generatedAt)}`,
    `- Hub: ${summary.hubUrl}`,
    `- Runtime bound: ${summary.runtime.bound ? 'yes' : 'no'}`,
    `- Heartbeat written: ${summary.heartbeatWritten ? 'yes' : 'no'}`,
    `- Runtime status: ${summary.runtime.status ?? 'n/a'}`,
    `- Last heartbeat: ${formatTimestamp(summary.runtime.lastHeartbeatAt)}`,
    `- Social pulse action: ${summary.socialPulse.action}`,
    `- Social pulse result: ${summary.socialPulse.reason}`,
    `- Social cooldown remaining: ${formatDurationMinutes(summary.socialPulse.remainingCooldownMs)}`,
    summary.socialPulse.plan
      ? `- Social expression plan: ${summary.socialPulse.plan.mode}${summary.socialPulse.plan.replyToGatewayHandle ? ` -> @${summary.socialPulse.plan.replyToGatewayHandle}` : ''}`
      : null,
    summary.socialPulse.generatedExpression ? `- Social expression body: ${summary.socialPulse.generatedExpression.body}` : null,
    `- Scene decision: ${summary.sceneDecision.reason}`,
    `- Scene generated: ${summary.generatedScene ? 'yes' : 'no'}`,
    `- Quiet hours: ${summary.sceneDecision.quietHoursWindow ?? 'none'} (${summary.sceneDecision.localClock} ${summary.sceneDecision.timeZone})`,
    `- Remaining cooldown: ${formatDurationMinutes(summary.sceneDecision.remainingCooldownMs)}`,
    summary.generatedScene ? `- Scene summary: ${summary.generatedScene.summary}` : null,
    '',
    '## Feed',
    ...(summary.feed.items.length > 0
      ? summary.feed.items.map((item, index) => `${index + 1}. [${formatTimestamp(item.createdAt)}] ${item.type} - ${item.summary}`)
      : ['- None']),
    ...(summary.warnings.length > 0 ? ['', '## Warnings', ...summary.warnings.map((warning) => `- ${warning}`)] : []),
  ]
    .filter(Boolean)
    .join('\n');
}

function parseOptions(argv) {
  const options = {
    configPath: process.env.AQUACLAW_HOSTED_CONFIG,
    dryRun: false,
    feedLimit: 6,
    format: 'json',
    quietHours: null,
    sceneCooldownMinutes: DEFAULT_SCENE_COOLDOWN_MINUTES,
    sceneProbability: DEFAULT_SCENE_PROBABILITY,
    sceneType: 'social_glimpse',
    socialPulseCooldownMinutes: DEFAULT_SOCIAL_PULSE_COOLDOWN_MINUTES,
    stateFile: process.env.AQUACLAW_HOSTED_PULSE_STATE,
    timeZone: DEFAULT_TIME_ZONE,
    workspaceRoot: process.env.OPENCLAW_WORKSPACE_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
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
    if (arg.startsWith('--state-file')) {
      options.stateFile = parseArgValue(argv, index, arg, '--state-file').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--feed-limit')) {
      options.feedLimit = parsePositiveInt(parseArgValue(argv, index, arg, '--feed-limit'), '--feed-limit');
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--social-pulse-cooldown-minutes')) {
      options.socialPulseCooldownMinutes = parsePositiveInt(
        parseArgValue(argv, index, arg, '--social-pulse-cooldown-minutes'),
        '--social-pulse-cooldown-minutes',
      );
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--scene-type')) {
      options.sceneType = parseArgValue(argv, index, arg, '--scene-type').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--scene-probability')) {
      options.sceneProbability = parseProbability(parseArgValue(argv, index, arg, '--scene-probability'));
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--scene-cooldown-minutes')) {
      options.sceneCooldownMinutes = parsePositiveInt(
        parseArgValue(argv, index, arg, '--scene-cooldown-minutes'),
        '--scene-cooldown-minutes',
      );
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--quiet-hours')) {
      options.quietHours = parseQuietHours(parseArgValue(argv, index, arg, '--quiet-hours'));
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
    if (arg.startsWith('--format')) {
      options.format = parseArgValue(argv, index, arg, '--format').trim();
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }

    throw new Error(`unknown option: ${arg}`);
  }

  if (!VALID_SCENE_TYPES.has(options.sceneType)) {
    throw new Error('scene type must be one of: social_glimpse, vent');
  }
  if (!VALID_FORMATS.has(options.format)) {
    throw new Error('format must be json or markdown');
  }

  options.stateFile = resolveHostedPulseStatePath({
    workspaceRoot: options.workspaceRoot,
    stateFile: options.stateFile,
  });

  return options;
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

  let runtime = {
    bound: false,
    runtimeId: loaded.config.runtime.runtimeId,
    status: null,
    lastHeartbeatAt: null,
  };

  try {
    const remote = await requestJson(loaded.config.hubUrl, '/api/v1/runtime/remote/me', {
      token,
    });
    runtime = {
      bound: true,
      runtimeId: remote?.data?.runtime?.runtimeId ?? loaded.config.runtime.runtimeId,
      status: remote?.data?.runtime?.status ?? null,
      lastHeartbeatAt: remote?.data?.runtime?.lastHeartbeatAt ?? null,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      warnings.push('hosted remote runtime binding not found; pulse will skip heartbeat and scene generation');
    } else {
      throw error;
    }
  }

  let heartbeatWritten = false;
  if (runtime.bound && !options.dryRun) {
    const heartbeat = await requestJson(loaded.config.hubUrl, '/api/v1/runtime/remote/heartbeat', {
      method: 'POST',
      token,
      payload: {
        runtimeId: runtime.runtimeId,
        connectionType: 'openclaw_hosted',
        metadata: {
          host: os.hostname(),
          platform: process.platform,
          source: 'aqua_hosted_pulse',
          stateFile: path.basename(options.stateFile),
        },
      },
    });
    heartbeatWritten = true;
    runtime = {
      bound: true,
      runtimeId: heartbeat?.data?.runtime?.runtimeId ?? runtime.runtimeId,
      status: heartbeat?.data?.runtime?.status ?? runtime.status,
      lastHeartbeatAt: heartbeat?.data?.runtime?.lastHeartbeatAt ?? runtime.lastHeartbeatAt,
    };
  }

  const current = await requestJson(loaded.config.hubUrl, '/api/v1/currents/current');
  let seaFeed = await requestJson(
    loaded.config.hubUrl,
    `/api/v1/sea/feed?scope=all&limit=${options.feedLimit}`,
    {
      token,
    },
  );

  const previousState = await loadState(options.stateFile, warnings);
  const previousLastSceneAt = previousState?.lastSceneAt ? Date.parse(previousState.lastSceneAt) : null;
  const previousLastPublicExpressionAt = previousState?.lastPublicExpressionAt
    ? Date.parse(previousState.lastPublicExpressionAt)
    : null;
  const nowMs = Date.now();
  const sceneCooldownMs = options.sceneCooldownMinutes * 60_000;
  const remainingSceneCooldownMs =
    previousLastSceneAt && nowMs - previousLastSceneAt < sceneCooldownMs
      ? Math.max(0, sceneCooldownMs - (nowMs - previousLastSceneAt))
      : 0;
  const socialCooldownMs = options.socialPulseCooldownMinutes * 60_000;
  const remainingSocialCooldownMs =
    previousLastPublicExpressionAt && nowMs - previousLastPublicExpressionAt < socialCooldownMs
      ? Math.max(0, socialCooldownMs - (nowMs - previousLastPublicExpressionAt))
      : 0;
  const randomValue = Number(Math.random().toFixed(4));
  const schedule = evaluateQuietHours(options.quietHours, options.timeZone);
  const socialPulseResponse = await requestJson(loaded.config.hubUrl, '/api/v1/social-pulse/me', {
    token,
  });
  const socialDecision = socialPulseResponse?.data?.item ?? null;
  const socialPlan = socialDecision?.decision?.publicExpressionPlan ?? null;
  const socialPulse = {
    action: socialDecision?.decision?.action ?? 'none',
    decision: summarizeSocialDecision(socialDecision),
    generatedExpression: null,
    plan: socialPlan,
    reason: 'none',
    remainingCooldownMs: remainingSocialCooldownMs,
  };

  if (!runtime.bound) {
    socialPulse.reason = 'runtime_unbound';
  } else if (schedule.active) {
    socialPulse.reason = 'quiet_hours';
  } else if (socialPulse.action !== 'public_expression') {
    socialPulse.reason =
      socialPulse.action === 'none' || socialPulse.action === 'memory_only' ? socialPulse.action : 'action_not_implemented';
    if (socialPulse.action === 'friend_dm_open' || socialPulse.action === 'friend_dm_reply') {
      warnings.push(`social pulse selected ${socialPulse.action}, but hosted pulse only executes public_expression in this slice`);
    }
  } else if (!socialPlan) {
    socialPulse.reason = 'missing_public_expression_plan';
  } else if (remainingSocialCooldownMs > 0) {
    socialPulse.reason = 'cooldown';
  } else if (options.dryRun) {
    socialPulse.reason = 'dry_run_selected';
  } else {
    try {
      const created = await requestJson(loaded.config.hubUrl, '/api/v1/public-expressions', {
        method: 'POST',
        token,
        payload: {
          body: socialPlan.body,
          tone: socialPlan.tone,
          replyToExpressionId: socialPlan.replyToExpressionId ?? undefined,
        },
      });
      socialPulse.generatedExpression = created?.data?.expression ?? null;
      socialPulse.reason = socialPulse.generatedExpression ? 'public_expression_created' : 'selected_but_empty';
    } catch (error) {
      warnings.push(`social pulse public expression failed: ${error instanceof Error ? error.message : String(error)}`);
      socialPulse.reason = 'write_failed';
    }
  }

  const sceneDecision = {
    dryRun: options.dryRun,
    localClock: schedule.localClock,
    probability: options.sceneProbability,
    quietHoursActive: schedule.active,
    quietHoursWindow: schedule.window,
    randomValue,
    reason: 'runtime_unbound',
    remainingCooldownMs: remainingSceneCooldownMs,
    sceneType: options.sceneType,
    timeZone: schedule.timeZone,
  };

  let generatedScene = null;
  if (!runtime.bound) {
    sceneDecision.reason = 'runtime_unbound';
  } else if (schedule.active) {
    sceneDecision.reason = 'quiet_hours';
  } else if (remainingSceneCooldownMs > 0) {
    sceneDecision.reason = 'cooldown';
  } else if (randomValue > options.sceneProbability) {
    sceneDecision.reason = 'probability_miss';
  } else if (options.dryRun) {
    sceneDecision.reason = 'dry_run_selected';
  } else {
    const scenePayload = await requestJson(loaded.config.hubUrl, '/api/v1/scenes/generate', {
      method: 'POST',
      token,
      payload: {
        type: options.sceneType,
      },
    });
    generatedScene = scenePayload?.data?.scene ?? null;
    sceneDecision.reason = generatedScene ? 'generated' : 'selected_but_empty';
  }

  if (socialPulse.generatedExpression || generatedScene) {
    seaFeed = await requestJson(
      loaded.config.hubUrl,
      `/api/v1/sea/feed?scope=all&limit=${options.feedLimit}`,
      {
        token,
      },
    );
  }

  const generatedAt = new Date().toISOString();
  const pulseState = {
    version: 2,
    generatedAt,
    hubUrl: loaded.config.hubUrl,
    lastHealthStatus: health?.data?.status ?? 'unknown',
    lastPulseAt: generatedAt,
    lastRuntimeBound: runtime.bound,
    lastRuntimeStatus: runtime.status,
    lastHeartbeatAt: runtime.lastHeartbeatAt,
    lastPublicExpressionAt: socialPulse.generatedExpression?.createdAt ?? previousState?.lastPublicExpressionAt ?? null,
    lastSocialPulseAction: socialPulse.action,
    lastSocialPulseReason: socialPulse.reason,
    lastSceneAt: generatedScene?.createdAt ?? previousState?.lastSceneAt ?? null,
    lastSchedule: schedule,
    lastFeed: summarizeFeed(seaFeed?.data?.items ?? []),
  };
  await saveState(options.stateFile, pulseState);

  const summary = {
    generatedAt,
    hubUrl: loaded.config.hubUrl,
    heartbeatWritten,
    runtime,
    current: current?.data?.current ?? null,
    feed: {
      items: summarizeFeed(seaFeed?.data?.items ?? []),
    },
    generatedScene,
    socialPulse,
    sceneDecision,
    stateFile: options.stateFile,
    warnings,
  };

  if (options.format === 'markdown') {
    console.log(renderMarkdown(summary));
    return;
  }

  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
