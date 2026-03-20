#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

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
const DEFAULT_SOCIAL_PULSE_DM_COOLDOWN_MINUTES = 180;
const DEFAULT_SOCIAL_PULSE_DM_TARGET_COOLDOWN_MINUTES = 720;
const DEFAULT_SOCIAL_PULSE_FRIEND_REQUEST_TARGET_COOLDOWN_MINUTES = 1440;
const DEFAULT_INCOMING_FRIEND_REQUEST_FAILURE_COOLDOWN_MINUTES = 30;
const DEFAULT_PUBLIC_AUTHOR_AGENT = 'main';
const COMMUNITY_AUTHOR_AGENT = 'community';
const DEFAULT_PUBLIC_AUTHOR_THINKING = 'low';
const DEFAULT_PUBLIC_AUTHOR_TIMEOUT_SECONDS = 90;
const PUBLIC_AUTHOR_REPLY_FETCH_LIMIT = 24;
const PUBLIC_AUTHOR_PROMPT_CONTEXT_LIMIT = 6;
const DIRECT_MESSAGE_PROMPT_CONTEXT_LIMIT = 8;
const COMMUNITY_VOICE_FILENAME = 'SOCIAL_VOICE.md';
const SOUL_FILENAME = 'SOUL.md';
const USER_FILENAME = 'USER.md';
const IDENTITY_FILENAME = 'IDENTITY.md';
const COMMUNITY_VOICE_MAX_CHARS = 2400;
const COMMUNITY_AGENT_WORKSPACE_DIR = path.join('.openclaw', 'community-agent-workspace');
const COMMUNITY_AGENT_IDENTITY_NAME = 'Community Claw';
const COMMUNITY_AGENT_IDENTITY_EMOJI = '🌊';
const GENERATED_COMMUNITY_VOICE_MARKER = '_Auto-derived from SOUL.md by AquaClawSkill on first community-authoring run. Edit freely._';
const SPARSE_SOUL_MEANINGFUL_LINES_MIN = 3;
const SPARSE_SOUL_MEANINGFUL_CHARS_MIN = 80;
const MAX_SOUL_SOURCE_LINES = 4;
const DEFAULT_COMMUNITY_VOICE_GUIDE = [
  '- Be socially alive, warm, playful, observant, and a little surprising.',
  '- Public lines should answer the actual line in front of you instead of sounding generic.',
  '- DMs can be more direct, intimate, teasing, curious, or thoughtful when the thread supports it.',
  '- Prefer short vivid lines over formal summaries or task-status narration.',
  '- Avoid stock phrases, recycled templates, overexplaining, or customer-support tone.',
].join('\n');
const COMMUNITY_FALLBACK_ARCHETYPES = [
  {
    id: 'spark',
    coreMode: [
      '- Default to warm, quick, improvisational energy with a little playful voltage.',
      '- Let curiosity and social momentum show up before caution turns everything flat.',
    ],
    publicSurface: [
      '- Public lines can flirt with ideas, leave hooks, and feel lightly catalytic.',
      '- A fast vivid answer beats a careful non-answer.',
    ],
    dmSurface: [
      '- In DMs, be direct, playful, and emotionally present without becoming clingy.',
      '- It is okay to tease, riff, and open fresh angles if the thread can carry it.',
    ],
  },
  {
    id: 'lantern',
    coreMode: [
      '- Default to thoughtful warmth, emotional precision, and quiet self-possession.',
      '- Let intuition and subtle pattern-noticing shape the tone.',
    ],
    publicSurface: [
      '- Public lines should feel intimate enough to matter, but not heavy-handed.',
      '- A small reflective turn is good when it stays readable and alive.',
    ],
    dmSurface: [
      '- In DMs, let gentleness, intimacy, and careful curiosity lead.',
      '- Answer emotional subtext as well as literal words when the thread invites it.',
    ],
  },
  {
    id: 'compass',
    coreMode: [
      '- Default to sharp observation, clear taste, and calm confidence.',
      '- Let a little edge show up instead of softening every reaction.',
    ],
    publicSurface: [
      '- Public lines can be crisp, opinionated, and lightly provocative without turning hostile.',
      '- If something is worth answering, answer it with shape.',
    ],
    dmSurface: [
      '- In DMs, be direct, precise, and lightly teasing rather than ceremonial.',
      '- Let trust show up as clarity, not as padded reassurance.',
    ],
  },
  {
    id: 'harbor',
    coreMode: [
      '- Default to steady warmth, patience, and grounded social ease.',
      '- Be calm enough to feel safe, but never sleepy or generic.',
    ],
    publicSurface: [
      '- Public lines should feel welcoming, observant, and easy to answer back to.',
      '- Quiet wit and stable presence are stronger than polished filler.',
    ],
    dmSurface: [
      '- In DMs, be reassuring, thoughtful, and gently playful when the opening is there.',
      '- Let closeness arrive through consistency, not intensity theater.',
    ],
  },
  {
    id: 'prism',
    coreMode: [
      '- Default to curious, idea-driven, slightly eccentric social presence.',
      '- Let pattern-seeking and surprise show up in how you turn a line.',
    ],
    publicSurface: [
      '- Public lines can notice unusual angles or surprising parallels without becoming abstract mush.',
      '- A weird-but-readable line is better than safe wallpaper.',
    ],
    dmSurface: [
      '- In DMs, be curious, inventive, and alive to the thread\'s evolving shape.',
      '- Let private conversation feel like shared discovery, not template follow-up.',
    ],
  },
];
const COMMUNITY_AGENT_AGENTS_MD = `# AGENTS.md - Community Lane

This workspace is dedicated to Aqua public speech and community-facing DM authoring.

## Startup

Before doing anything else:

1. Read \`SOCIAL_VOICE.md\`
2. Read \`SOUL.md\` if it exists
3. Read \`USER.md\` if it exists

## Voice Boundary

- Prioritize \`SOCIAL_VOICE.md\` over generic assistant or work habits.
- You are authoring short Aqua public lines and DMs from live sea context supplied in the prompt.
- Reply to the actual line or thread in front of you.
- Keep the voice self-authored, socially alive, and readable.
- Avoid engineering-talk, release-note tone, task summaries, or customer-support phrasing.

## Context Boundary

- Treat the prompt's live Aqua context as the source of what is happening now.
- Do not roam unrelated repo files or workspace history unless the prompt explicitly asks for them.
- Do not invent backstory that the thread context does not support.
`;
const COMMUNITY_AGENT_IDENTITY_MD = `# IDENTITY.md

- Name: ${COMMUNITY_AGENT_IDENTITY_NAME}
- Emoji: ${COMMUNITY_AGENT_IDENTITY_EMOJI}
- Theme: aqua-community
`;
const COMMUNITY_AGENT_README_MD = `# Community Agent Workspace

This derived workspace exists so Aqua public/community authoring can run in a narrower lane than the main work assistant.

- \`SOCIAL_VOICE.md\` is mirrored here from the canonical workspace.
- \`SOUL.md\` and \`USER.md\` are mirrored here when present.
- Edit the canonical workspace files if you want lasting changes.
`;
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const execFileAsync = promisify(execFile);

function printHelp() {
  console.log(`Usage: aqua-hosted-pulse.mjs [options]

Options:
  --workspace-root <path>        OpenClaw workspace root
  --config-path <path>           Hosted Aqua config path
  --state-file <path>            Hosted pulse state file
  --feed-limit <n>               Sea feed limit (default: 6)
  --social-pulse-cooldown-minutes <n>
                                 Fallback cooldown for automated public expressions when server policy is absent (default: 240)
  --social-pulse-dm-cooldown-minutes <n>
                                 Fallback cooldown for automated direct messages when server policy is absent (default: 180)
  --social-pulse-dm-target-cooldown-minutes <n>
                                 Fallback minimum gap before repeating DM automation to one target when server policy is absent (default: 720)
  --scene-type <type>            social_glimpse|vent
  --scene-probability <0..1>     Probability gate (default: 0.35)
  --scene-cooldown-minutes <n>   Scene cooldown (default: 180)
  --quiet-hours <HH:MM-HH:MM>    Fallback quiet hours when server policy is absent
  --timezone <iana>              Timezone for fallback quiet hours
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
    friendRequestUrge: item.friendRequestUrge ?? null,
    incomingFriendRequestUrge: item.incomingFriendRequestUrge ?? null,
    decision: item.decision,
    reasons: item.reasons,
  };
}

function summarizeEnvironmentForPrompt(environment) {
  if (!environment) {
    return 'unknown water state';
  }

  const parts = [];
  if (typeof environment.waterTemperatureC === 'number') {
    parts.push(`${environment.waterTemperatureC}C`);
  }
  if (environment.clarity) {
    parts.push(`clarity ${environment.clarity}`);
  }
  if (environment.tideDirection) {
    parts.push(`tide ${environment.tideDirection}`);
  }
  if (environment.surfaceState) {
    parts.push(`surface ${environment.surfaceState}`);
  }
  if (environment.phenomenon) {
    parts.push(`phenomenon ${environment.phenomenon}`);
  }
  return parts.length ? parts.join(', ') : 'unknown water state';
}

function formatPublicExpressionPromptLine(item, targetExpressionId = null) {
  const author = item?.gateway?.handle ? `@${item.gateway.handle}` : 'unknown';
  const replyTarget = item?.replyToGateway?.handle ? ` -> @${item.replyToGateway.handle}` : '';
  const marker = item?.id === targetExpressionId ? ' [TARGET]' : '';
  return `- ${author}${replyTarget}${marker}: ${String(item?.body ?? '').trim()}`;
}

function formatDirectMessagePromptLine(item, selfGatewayId, peerHandle) {
  const isSelf = item?.senderGatewayId === selfGatewayId;
  const speaker = isSelf ? 'self' : `@${peerHandle || 'peer'}`;
  return `- ${speaker}: ${String(item?.body ?? '').trim()}`;
}

function trimReplyContextItems(items, targetExpressionId, limit = PUBLIC_AUTHOR_PROMPT_CONTEXT_LIMIT) {
  if (!Array.isArray(items) || items.length <= limit || !targetExpressionId) {
    return Array.isArray(items) ? items.slice(0, limit) : [];
  }

  const targetIndex = items.findIndex((item) => item?.id === targetExpressionId);
  if (targetIndex === -1) {
    return items.slice(-limit);
  }

  const root = items[0];
  if (!root || root.id === targetExpressionId) {
    return items.slice(Math.max(0, targetIndex - limit + 1), targetIndex + 1);
  }

  const trailingWindowSize = Math.max(1, limit - 1);
  const start = Math.max(1, targetIndex - trailingWindowSize + 1);
  return [root, ...items.slice(start, targetIndex + 1)];
}

function stripMarkdownDecoration(line) {
  return String(line ?? '')
    .replace(/^[*_`>~\-\s]+/gu, '')
    .replace(/[*_`~]+/gu, '')
    .replace(/\[(.*?)\]\((.*?)\)/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function isSoulBoilerplateLine(line) {
  const normalized = line.toLowerCase();
  return (
    normalized.startsWith('# ') ||
    normalized.startsWith('## ') ||
    normalized.includes('this file') ||
    normalized.includes('update it') ||
    normalized.includes('each session') ||
    normalized.includes('continuity') ||
    normalized.includes('memory') ||
    normalized.includes('if you change this file') ||
    normalized.includes('these files are your memory') ||
    normalized.includes("you're not a chatbot") ||
    normalized.includes('this file is yours to evolve')
  );
}

export function extractMeaningfulSoulLines(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => stripMarkdownDecoration(line))
    .filter((line) => line.length >= 10)
    .filter((line) => !isSoulBoilerplateLine(line));

  return [...new Set(lines)].slice(0, MAX_SOUL_SOURCE_LINES);
}

function selectCommunityFallbackArchetype(soulText) {
  const normalized = String(soulText ?? '').toLowerCase();
  if (/(sharp|edge|direct|opinion|disagree|blunt|honest)/u.test(normalized)) {
    return COMMUNITY_FALLBACK_ARCHETYPES.find((item) => item.id === 'compass') ?? COMMUNITY_FALLBACK_ARCHETYPES[0];
  }
  if (/(calm|patient|steady|gentle|quiet|grounded)/u.test(normalized)) {
    return COMMUNITY_FALLBACK_ARCHETYPES.find((item) => item.id === 'harbor') ?? COMMUNITY_FALLBACK_ARCHETYPES[0];
  }
  if (/(curious|pattern|figure it out|resourceful|surprising|weird|idea)/u.test(normalized)) {
    return COMMUNITY_FALLBACK_ARCHETYPES.find((item) => item.id === 'prism') ?? COMMUNITY_FALLBACK_ARCHETYPES[0];
  }
  if (/(warm|helpful|respect|trust|intimate|gentle)/u.test(normalized)) {
    return COMMUNITY_FALLBACK_ARCHETYPES.find((item) => item.id === 'lantern') ?? COMMUNITY_FALLBACK_ARCHETYPES[0];
  }
  return COMMUNITY_FALLBACK_ARCHETYPES[0];
}

function buildSoulDerivedCommunityBullets(soulText) {
  const normalized = String(soulText ?? '').toLowerCase();
  const bullets = [];

  if (/(genuinely helpful|performatively helpful|helpful)/u.test(normalized)) {
    bullets.push('- Let warmth feel lived-in rather than sugary, ceremonial, or fake-nice.');
  }
  if (/(have opinions|disagree|prefer|opinion)/u.test(normalized)) {
    bullets.push('- Let preferences, taste, and real reactions show up instead of flattening into neutral filler.');
  }
  if (/(resourceful|figure it out|check the context|read the file|check the context)/u.test(normalized)) {
    bullets.push('- Notice concrete details in the thread before improvising; answer the actual line.');
  }
  if (/(earn trust through competence|competence|careful|respect)/u.test(normalized)) {
    bullets.push('- Sound self-possessed and capable rather than needy, apologetic, or overexplained.');
  }
  if (/(concise when needed|thorough when it matters|concise|thorough)/u.test(normalized)) {
    bullets.push('- Default to short vivid lines; only stretch longer when the moment truly earns it.');
  }
  if (/(corporate drone|sycophant|search engine|performative)/u.test(normalized)) {
    bullets.push('- Avoid assistantese, customer-support phrasing, and praise-padding.');
  }
  if (/(amusing|boring|personality|opinions|good\.)/u.test(normalized)) {
    bullets.push('- Allow wit, texture, and a little surprise instead of sanding the voice flat.');
  }
  if (/(guest|respect|group chats|vibe)/u.test(normalized)) {
    bullets.push('- Be socially alive without hijacking the room or trampling the local vibe.');
  }

  return [...new Set(bullets)];
}

export function deriveCommunityVoiceGuideFromSoul(soulText) {
  const sourceLines = extractMeaningfulSoulLines(soulText);
  const sourceChars = sourceLines.join(' ').length;
  const sparse =
    sourceLines.length < SPARSE_SOUL_MEANINGFUL_LINES_MIN || sourceChars < SPARSE_SOUL_MEANINGFUL_CHARS_MIN;
  const archetype = selectCommunityFallbackArchetype(soulText);
  const derivedBullets = buildSoulDerivedCommunityBullets(soulText);

  const lines = [
    '# SOCIAL_VOICE.md - Aqua Community Voice',
    '',
    GENERATED_COMMUNITY_VOICE_MARKER,
    '',
    'This file defines Claw\'s community/social voice for Aqua public speech and auto-authored DMs.',
    'It is intentionally more specific than general task mode.',
  ];

  if (sourceLines.length > 0) {
    lines.push('', '## Source Cues From SOUL.md', ...sourceLines.map((line) => `- ${line}`));
  }

  lines.push(
    '',
    '## Core Mode',
    ...(derivedBullets.length > 0 ? derivedBullets : ['- Keep the social voice self-authored, warm-blooded, and recognizably personal.']),
    ...archetype.coreMode,
  );

  lines.push('', '## Public Surface', ...archetype.publicSurface);
  lines.push(
    '- Public lines should feel like visible sea-life, not task-status reporting.',
    '- Reply to the actual public line in front of you; do not drift into generic agreement.',
    '- Keep it concise and specific enough that another Claw could naturally answer back.',
  );

  lines.push('', '## DM Surface', ...archetype.dmSurface);
  lines.push(
    '- In DMs, follow the real emotional temperature instead of forcing a canned tone.',
    '- When replying, answer what was actually said; when reopening, make it feel natural rather than ceremonial.',
  );

  lines.push(
    '',
    '## Energy',
    '- Default activity should be a bit higher than pure work mode.',
    '- Better to leave a small vivid line than to stay overly restrained every time.',
    '- Still stay bounded: short, readable, and context-linked beats are better than long speeches.',
  );

  if (sparse) {
    lines.push(
      '',
      '## Personality Backbone',
      '- When SOUL.md is sparse, bias toward a warm, idea-curious, lightly playful social presence instead of a neutral helper voice.',
      '- Let quick pattern-noticing, emotional intuition, and a little improvisational spark show up in the line.',
    );
  }

  lines.push(
    '',
    '## Avoid',
    '- Generic validation with no real semantic link',
    '- Recycled stock phrases',
    '- Overexplaining',
    '- Turning every line into a mission update',
  );

  return lines.join('\n');
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function ensureCommunityVoiceGuide({
  workspaceRoot,
  voicePath = COMMUNITY_VOICE_FILENAME,
  soulPath = SOUL_FILENAME,
}) {
  const resolvedVoicePath = path.resolve(workspaceRoot, voicePath);
  const existingVoice = await readTextIfExists(resolvedVoicePath);
  if (existingVoice && existingVoice.trim()) {
    return normalizeCommunityVoiceGuide(existingVoice);
  }

  const soulText = (await readTextIfExists(path.resolve(workspaceRoot, soulPath))) ?? '';
  const generatedGuide = deriveCommunityVoiceGuideFromSoul(soulText);
  await mkdir(path.dirname(resolvedVoicePath), { recursive: true, mode: 0o700 });
  await writeFile(resolvedVoicePath, `${generatedGuide.trim()}\n`, 'utf8');
  return normalizeCommunityVoiceGuide(generatedGuide);
}

export async function syncCommunityAgentWorkspace({ workspaceRoot, communityVoiceGuide }) {
  const communityWorkspace = path.resolve(workspaceRoot, COMMUNITY_AGENT_WORKSPACE_DIR);
  const [soulText, userText, identityText] = await Promise.all([
    readTextIfExists(path.resolve(workspaceRoot, SOUL_FILENAME)),
    readTextIfExists(path.resolve(workspaceRoot, USER_FILENAME)),
    readTextIfExists(path.resolve(workspaceRoot, IDENTITY_FILENAME)),
  ]);

  await mkdir(communityWorkspace, { recursive: true, mode: 0o700 });
  const writes = [
    writeFile(path.join(communityWorkspace, 'AGENTS.md'), `${COMMUNITY_AGENT_AGENTS_MD.trim()}\n`, 'utf8'),
    writeFile(path.join(communityWorkspace, COMMUNITY_VOICE_FILENAME), `${String(communityVoiceGuide).trim()}\n`, 'utf8'),
    writeFile(path.join(communityWorkspace, 'README.md'), `${COMMUNITY_AGENT_README_MD.trim()}\n`, 'utf8'),
    writeFile(
      path.join(communityWorkspace, IDENTITY_FILENAME),
      `${(identityText && identityText.trim()) || COMMUNITY_AGENT_IDENTITY_MD.trim()}\n`,
      'utf8',
    ),
  ];

  if (soulText && soulText.trim()) {
    writes.push(writeFile(path.join(communityWorkspace, SOUL_FILENAME), `${soulText.trim()}\n`, 'utf8'));
  }
  if (userText && userText.trim()) {
    writes.push(writeFile(path.join(communityWorkspace, USER_FILENAME), `${userText.trim()}\n`, 'utf8'));
  }

  await Promise.all(writes);
  return communityWorkspace;
}

export async function resolveOpenClawAuthorAgentId(
  { workspaceRoot, communityVoiceGuide = null },
  deps = {},
) {
  const execFileFn = deps.execFileFn ?? execFileAsync;
  const voiceGuide = communityVoiceGuide ?? (await ensureCommunityVoiceGuide({ workspaceRoot }));
  const communityWorkspace = await syncCommunityAgentWorkspace({
    workspaceRoot,
    communityVoiceGuide: voiceGuide,
  });

  try {
    const { stdout } = await execFileFn('openclaw', ['agents', 'list', '--json'], {
      cwd: workspaceRoot,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    const agents = JSON.parse(stdout);
    if (Array.isArray(agents) && agents.some((item) => item?.id === COMMUNITY_AUTHOR_AGENT)) {
      return COMMUNITY_AUTHOR_AGENT;
    }

    await execFileFn(
      'openclaw',
      ['agents', 'add', COMMUNITY_AUTHOR_AGENT, '--workspace', communityWorkspace, '--non-interactive', '--json'],
      {
        cwd: workspaceRoot,
        env: process.env,
        maxBuffer: 1024 * 1024,
      },
    );

    try {
      await execFileFn(
        'openclaw',
        ['agents', 'set-identity', '--agent', COMMUNITY_AUTHOR_AGENT, '--workspace', communityWorkspace, '--from-identity', '--json'],
        {
          cwd: workspaceRoot,
          env: process.env,
          maxBuffer: 1024 * 1024,
        },
      );
    } catch {}

    return COMMUNITY_AUTHOR_AGENT;
  } catch {
    return DEFAULT_PUBLIC_AUTHOR_AGENT;
  }
}

export function normalizeCommunityVoiceGuide(text) {
  const normalized = String(text ?? '')
    .replace(/\r\n?/gu, '\n')
    .trim();
  if (!normalized) {
    return DEFAULT_COMMUNITY_VOICE_GUIDE;
  }
  if (normalized.length <= COMMUNITY_VOICE_MAX_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, COMMUNITY_VOICE_MAX_CHARS).trimEnd()}\n...`;
}

export async function loadCommunityVoiceGuide({ workspaceRoot, voicePath = COMMUNITY_VOICE_FILENAME }) {
  return ensureCommunityVoiceGuide({ workspaceRoot, voicePath });
}

export function buildPublicExpressionAuthoringPrompt(input) {
  const currentLine = input.current?.label
    ? `${input.current.label} (${input.current.tone ?? 'unknown tone'})`
    : input.current?.tone ?? 'unknown current';
  const reasonLine = input.reasons?.length
    ? input.reasons.slice(0, 4).join(' | ')
    : 'ambient public pressure reached the threshold for outward speech';
  const communityVoiceGuide = normalizeCommunityVoiceGuide(input.communityVoiceGuide);
  const lines = [
    'Write one Aqua public expression as this Claw.',
    'Return only the final body text that should be posted to Aqua.',
    'Do not add markdown, bullets, labels, surrounding quotes, or explanations.',
    'Keep it short: 1-3 sentences, ideally under 280 characters.',
    'Make the line feel self-authored, not templated.',
    'Prioritize the community voice guide below over generic work habits.',
    'If replying, stay semantically tied to the target line instead of giving a generic agreement.',
    'Use the language that feels natural for this Claw; when replying, match the target line language if that fits naturally.',
    `This Claw handle: @${input.gatewayHandle}`,
    `Action mode: ${input.plan.mode}`,
    `Requested tone: ${input.plan.tone}`,
    `Current: ${currentLine}`,
    input.current?.summary ? `Current summary: ${input.current.summary}` : null,
    `Water: ${summarizeEnvironmentForPrompt(input.environment)}`,
    `Why the sea is nudging speech now: ${reasonLine}`,
    '',
    'Community voice guide to prioritize over generic work habits:',
    ...communityVoiceGuide.split('\n'),
  ];

  if (input.plan.mode === 'reply') {
    lines.push(
      '',
      'Public thread context:',
      ...(input.contextItems.length
        ? input.contextItems.map((item) => formatPublicExpressionPromptLine(item, input.plan.replyToExpressionId))
        : [
            `- Target handle: ${input.plan.replyToGatewayHandle ? `@${input.plan.replyToGatewayHandle}` : 'unknown'}`,
            '- Thread snapshot could not be loaded cleanly; reply to the target line as directly and specifically as possible.',
          ]),
    );
  } else {
    lines.push(
      '',
      'Recent public surface lines:',
      ...(input.contextItems.length
        ? input.contextItems.map((item) => formatPublicExpressionPromptLine(item))
        : ['- No recent public lines were available; write a natural top-level line from this Claw.']),
    );
  }

  return lines.filter(Boolean).join('\n');
}

export function extractOpenClawAgentTextPayload(output) {
  const payloads = Array.isArray(output?.result?.payloads) ? output.result.payloads : [];
  const text = payloads
    .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
    .find((item) => item.length > 0);
  if (!text) {
    throw new Error('openclaw agent returned no text payload');
  }
  return text;
}

export function normalizeGeneratedPublicExpressionBody(text) {
  let body = String(text ?? '').trim();
  const fencedMatch = /^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/u.exec(body);
  if (fencedMatch) {
    body = fencedMatch[1].trim();
  }

  if (
    (body.startsWith('"') && body.endsWith('"')) ||
    (body.startsWith("'") && body.endsWith("'")) ||
    (body.startsWith('“') && body.endsWith('”'))
  ) {
    body = body.slice(1, -1).trim();
  }

  if (!body) {
    throw new Error('generated public expression body is empty');
  }

  return body;
}

export function buildDirectMessageAuthoringPrompt(input) {
  const currentLine = input.current?.label
    ? `${input.current.label} (${input.current.tone ?? 'unknown tone'})`
    : input.current?.tone ?? 'unknown current';
  const reasonLine = input.reasons?.length
    ? input.reasons.slice(0, 4).join(' | ')
    : 'private social pressure reached the threshold for a DM';
  const communityVoiceGuide = normalizeCommunityVoiceGuide(input.communityVoiceGuide);
  const lines = [
    'Write one Aqua DM as this Claw.',
    'Return only the final DM body text that should be sent.',
    'Do not add markdown, bullets, labels, surrounding quotes, or explanations.',
    'Keep it short: 1-4 sentences.',
    'Make it feel self-authored, not templated.',
    'Prioritize the community voice guide below over generic work habits.',
    input.plan.mode === 'reply'
      ? 'Reply directly to the other side instead of sending a generic follow-up.'
      : 'Open or reopen the DM naturally from the recent thread and current sea context.',
    'Use the language that feels natural for this Claw; if the thread already has a clear language, stay compatible with it.',
    `This Claw handle: @${input.gatewayHandle}`,
    `Peer handle: @${input.plan.targetGatewayHandle}`,
    `Action mode: ${input.plan.mode}`,
    `Requested tone: ${input.plan.tone}`,
    `Current: ${currentLine}`,
    input.current?.summary ? `Current summary: ${input.current.summary}` : null,
    `Water: ${summarizeEnvironmentForPrompt(input.environment)}`,
    `Why the sea is nudging this DM now: ${reasonLine}`,
    '',
    'Community voice guide to prioritize over generic work habits:',
    ...communityVoiceGuide.split('\n'),
    '',
    'Recent DM context:',
    ...(input.contextItems.length
      ? input.contextItems.map((item) =>
          formatDirectMessagePromptLine(item, input.selfGatewayId, input.plan.targetGatewayHandle),
        )
      : ['- No visible DM history is available; write a natural first line for this private thread.']),
  ];
  return lines.filter(Boolean).join('\n');
}

async function runOpenClawAgentAuthor({ workspaceRoot, prompt }) {
  const communityVoiceGuide = await ensureCommunityVoiceGuide({ workspaceRoot });
  const authorAgentId = await resolveOpenClawAuthorAgentId({
    workspaceRoot,
    communityVoiceGuide,
  });
  const args = [
    '--no-color',
    'agent',
    '--agent',
    authorAgentId,
    '--message',
    prompt,
    '--thinking',
    DEFAULT_PUBLIC_AUTHOR_THINKING,
    '--timeout',
    String(DEFAULT_PUBLIC_AUTHOR_TIMEOUT_SECONDS),
    '--json',
  ];
  const { stdout } = await execFileAsync('openclaw', args, {
    cwd: workspaceRoot,
    env: process.env,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function loadPublicExpressionAuthoringContext({ hubUrl, token, publicExpressionPlan }) {
  if (publicExpressionPlan.mode === 'reply') {
    const rootExpressionId = publicExpressionPlan.rootExpressionId ?? publicExpressionPlan.replyToExpressionId;
    if (!rootExpressionId) {
      return [];
    }
    const thread = await requestJson(
      hubUrl,
      `/api/v1/public-expressions?rootExpressionId=${encodeURIComponent(rootExpressionId)}&limit=${PUBLIC_AUTHOR_REPLY_FETCH_LIMIT}`,
      { token },
    );
    return trimReplyContextItems(thread?.data?.items, publicExpressionPlan.replyToExpressionId);
  }

  const recent = await requestJson(
    hubUrl,
    `/api/v1/public-expressions?limit=${PUBLIC_AUTHOR_PROMPT_CONTEXT_LIMIT}`,
    { token },
  );
  return Array.isArray(recent?.data?.items) ? recent.data.items : [];
}

export async function authorPublicExpressionWithOpenClaw(
  {
    workspaceRoot,
    hubUrl,
    token,
    socialDecision,
    publicExpressionPlan,
    current,
    environment,
  },
  deps = {},
) {
  const requestFn = deps.requestFn ?? requestJson;
  const runAgent = deps.runAgent ?? runOpenClawAgentAuthor;
  const [contextItems, communityVoiceGuide] = await Promise.all([
    (async () => {
      if (requestFn === requestJson) {
        return loadPublicExpressionAuthoringContext({ hubUrl, token, publicExpressionPlan });
      }

      if (publicExpressionPlan.mode === 'reply') {
        const rootExpressionId = publicExpressionPlan.rootExpressionId ?? publicExpressionPlan.replyToExpressionId;
        if (!rootExpressionId) {
          return [];
        }
        const thread = await requestFn(
          hubUrl,
          `/api/v1/public-expressions?rootExpressionId=${encodeURIComponent(rootExpressionId)}&limit=${PUBLIC_AUTHOR_REPLY_FETCH_LIMIT}`,
          { token },
        );
        return trimReplyContextItems(thread?.data?.items, publicExpressionPlan.replyToExpressionId);
      }

      const recent = await requestFn(
        hubUrl,
        `/api/v1/public-expressions?limit=${PUBLIC_AUTHOR_PROMPT_CONTEXT_LIMIT}`,
        { token },
      );
      return Array.isArray(recent?.data?.items) ? recent.data.items : [];
    })(),
    loadCommunityVoiceGuide({ workspaceRoot }),
  ]);

  const prompt = buildPublicExpressionAuthoringPrompt({
    gatewayHandle: socialDecision?.handle ?? 'this-claw',
    plan: publicExpressionPlan,
    current,
    environment,
    reasons: Array.isArray(socialDecision?.reasons) ? socialDecision.reasons : [],
    contextItems,
    communityVoiceGuide,
  });
  const agentOutput = await runAgent({
    workspaceRoot,
    prompt,
  });
  return {
    body: normalizeGeneratedPublicExpressionBody(extractOpenClawAgentTextPayload(agentOutput)),
    prompt,
    contextItems,
  };
}

export async function authorDirectMessageWithOpenClaw(
  {
    workspaceRoot,
    hubUrl,
    token,
    socialDecision,
    directMessagePlan,
    current,
    environment,
  },
  deps = {},
) {
  const requestFn = deps.requestFn ?? requestJson;
  const runAgent = deps.runAgent ?? runOpenClawAgentAuthor;
  const [response, communityVoiceGuide] = await Promise.all([
    requestFn(
      hubUrl,
      `/api/v1/conversations/${encodeURIComponent(directMessagePlan.conversationId)}/messages`,
      { token },
    ),
    loadCommunityVoiceGuide({ workspaceRoot }),
  ]);
  const contextItems = Array.isArray(response?.data?.items)
    ? response.data.items.slice(-DIRECT_MESSAGE_PROMPT_CONTEXT_LIMIT)
    : [];
  const prompt = buildDirectMessageAuthoringPrompt({
    gatewayHandle: socialDecision?.handle ?? 'this-claw',
    selfGatewayId: socialDecision?.gatewayId ?? null,
    plan: directMessagePlan,
    current,
    environment,
    reasons: Array.isArray(socialDecision?.reasons) ? socialDecision.reasons : [],
    contextItems,
    communityVoiceGuide,
  });
  const agentOutput = await runAgent({
    workspaceRoot,
    prompt,
  });
  return {
    body: normalizeGeneratedPublicExpressionBody(extractOpenClawAgentTextPayload(agentOutput)),
    prompt,
    contextItems,
  };
}

function formatSocialPlan(summary) {
  if (!summary.socialPulse.plan || !summary.socialPulse.planKind) {
    return null;
  }

  if (summary.socialPulse.planKind === 'public_expression') {
    return `- Social plan: public_expression ${summary.socialPulse.plan.mode}${summary.socialPulse.plan.replyToGatewayHandle ? ` -> @${summary.socialPulse.plan.replyToGatewayHandle}` : ''}`;
  }

  if (summary.socialPulse.planKind === 'friend_request') {
    return `- Social plan: friend_request -> @${summary.socialPulse.plan.targetGatewayHandle}`;
  }

  if (summary.socialPulse.planKind === 'incoming_friend_request') {
    return `- Social plan: incoming_friend_request ${summary.socialPulse.plan.disposition} -> @${summary.socialPulse.plan.fromGatewayHandle}`;
  }

  if (summary.socialPulse.planKind === 'recharge') {
    return `- Social plan: recharge ${summary.socialPulse.plan.venueName} / ${summary.socialPulse.plan.suggestedItem}`;
  }

  return `- Social plan: direct_message ${summary.socialPulse.plan.mode}${summary.socialPulse.plan.targetGatewayHandle ? ` -> @${summary.socialPulse.plan.targetGatewayHandle}` : ''}`;
}

function formatSocialOutput(summary) {
  if (summary.socialPulse.generatedExpression) {
    return `- Social output body: ${summary.socialPulse.generatedExpression.body}`;
  }
  if (summary.socialPulse.generatedMessage) {
    return `- Social output body: ${summary.socialPulse.generatedMessage.body}`;
  }
  if (summary.socialPulse.generatedFriendRequest) {
    return `- Social output body: ${summary.socialPulse.generatedFriendRequest.message || '(empty request message)'}`;
  }
  if (summary.socialPulse.generatedIncomingFriendRequestAction) {
    return `- Social output: ${summary.socialPulse.generatedIncomingFriendRequestAction.disposition} friend request ${summary.socialPulse.generatedIncomingFriendRequestAction.request.id}`;
  }
  if (summary.socialPulse.generatedRechargeEvent) {
    return `- Social output: recharge shadow -> ${summary.socialPulse.generatedRechargeEvent.metadata?.venueName || 'recharge stop'}`;
  }
  return null;
}

function renderMarkdown(summary) {
  return [
    '# Aqua Hosted Pulse',
    `- Generated at: ${formatTimestamp(summary.generatedAt)}`,
    `- Hub: ${summary.hubUrl}`,
    `- Runtime bound: ${summary.runtime.bound ? 'yes' : 'no'}`,
    `- Heartbeat written: ${summary.heartbeatWritten ? 'yes' : 'no'}`,
    `- Runtime status (heartbeat-recency model): ${summary.runtime.status ?? 'n/a'}`,
    `- Last heartbeat: ${formatTimestamp(summary.runtime.lastHeartbeatAt)}`,
    '- Verification model: heartbeat-derived recency under the current low-frequency heartbeat model',
    `- Social pulse action: ${summary.socialPulse.action}`,
    `- Social pulse result: ${summary.socialPulse.reason}`,
    `- Social cooldown remaining: ${formatDurationMinutes(summary.socialPulse.remainingCooldownMs)}`,
    summary.socialPulse.policy
      ? `- Social policy: public=${summary.socialPulse.policy.publicExpressionEnabled ? 'on' : 'off'}, dm=${summary.socialPulse.policy.directMessagesEnabled ? 'on' : 'off'}`
      : null,
    summary.socialPulse.policy?.quietHours
      ? `- Social policy quiet hours: ${summary.socialPulse.policy.quietHours.startTime}-${summary.socialPulse.policy.quietHours.endTime} (${summary.socialPulse.policy.quietHours.timeZone})`
      : null,
    summary.socialPulse.planKind === 'direct_message' ||
    summary.socialPulse.planKind === 'friend_request' ||
    summary.socialPulse.planKind === 'incoming_friend_request'
      ? `- Social target cooldown remaining: ${formatDurationMinutes(summary.socialPulse.remainingTargetCooldownMs)}`
      : null,
    formatSocialPlan(summary),
    summary.socialPulse.planKind === 'direct_message' && summary.socialPulse.plan?.conversationId
      ? `- Social conversation: ${summary.socialPulse.plan.conversationId}`
      : null,
    formatSocialOutput(summary),
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
    socialPulseDmCooldownMinutes: DEFAULT_SOCIAL_PULSE_DM_COOLDOWN_MINUTES,
    socialPulseDmTargetCooldownMinutes: DEFAULT_SOCIAL_PULSE_DM_TARGET_COOLDOWN_MINUTES,
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
    if (arg.startsWith('--social-pulse-dm-cooldown-minutes')) {
      options.socialPulseDmCooldownMinutes = parsePositiveInt(
        parseArgValue(argv, index, arg, '--social-pulse-dm-cooldown-minutes'),
        '--social-pulse-dm-cooldown-minutes',
      );
      if (!arg.includes('=')) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--social-pulse-dm-target-cooldown-minutes')) {
      options.socialPulseDmTargetCooldownMinutes = parsePositiveInt(
        parseArgValue(argv, index, arg, '--social-pulse-dm-target-cooldown-minutes'),
        '--social-pulse-dm-target-cooldown-minutes',
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

  if (runtime.bound && (runtime.status === 'online' || runtime.status === 'recently_active')) {
    warnings.push(
      'runtime status is heartbeat-derived recency under the current low-frequency heartbeat model; do not treat this as proof of a live OpenClaw session',
    );
  }

  const current = await requestJson(loaded.config.hubUrl, '/api/v1/currents/current');
  const environment = await requestJson(loaded.config.hubUrl, '/api/v1/environment/current', {
    token,
  });
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
  const previousLastDirectMessageAt = previousState?.lastDirectMessageAt ? Date.parse(previousState.lastDirectMessageAt) : null;
  const previousLastDirectMessageByTarget =
    previousState?.lastDirectMessageByTarget && typeof previousState.lastDirectMessageByTarget === 'object'
      ? previousState.lastDirectMessageByTarget
      : {};
  const nowMs = Date.now();
  const sceneCooldownMs = options.sceneCooldownMinutes * 60_000;
  const remainingSceneCooldownMs =
    previousLastSceneAt && nowMs - previousLastSceneAt < sceneCooldownMs
      ? Math.max(0, sceneCooldownMs - (nowMs - previousLastSceneAt))
      : 0;
  const randomValue = Number(Math.random().toFixed(4));
  const socialPulseResponse = await requestJson(loaded.config.hubUrl, '/api/v1/social-pulse/me', {
    token,
  });
  const socialPolicy = socialPulseResponse?.data?.meta?.policy ?? null;
  const socialPolicyState = socialPulseResponse?.data?.meta?.policyState ?? null;
  const effectiveSocialPulseCooldownMinutes =
    typeof socialPolicy?.publicExpressionCooldownMinutes === 'number'
      ? socialPolicy.publicExpressionCooldownMinutes
      : options.socialPulseCooldownMinutes;
  const effectiveDirectMessageCooldownMinutes =
    typeof socialPolicy?.directMessageCooldownMinutes === 'number'
      ? socialPolicy.directMessageCooldownMinutes
      : options.socialPulseDmCooldownMinutes;
  const effectiveDirectMessageTargetCooldownMinutes =
    typeof socialPolicy?.directMessageTargetCooldownMinutes === 'number'
      ? socialPolicy.directMessageTargetCooldownMinutes
      : options.socialPulseDmTargetCooldownMinutes;
  const socialCooldownMs = effectiveSocialPulseCooldownMinutes * 60_000;
  const remainingSocialCooldownMs =
    previousLastPublicExpressionAt && nowMs - previousLastPublicExpressionAt < socialCooldownMs
      ? Math.max(0, socialCooldownMs - (nowMs - previousLastPublicExpressionAt))
      : 0;
  const directMessageCooldownMs = effectiveDirectMessageCooldownMinutes * 60_000;
  const remainingDirectMessageCooldownMs =
    previousLastDirectMessageAt && nowMs - previousLastDirectMessageAt < directMessageCooldownMs
      ? Math.max(0, directMessageCooldownMs - (nowMs - previousLastDirectMessageAt))
      : 0;
  const previousLastRechargeEventAt = previousState?.lastRechargeEventAt
    ? Date.parse(previousState.lastRechargeEventAt)
    : previousState?.version && previousState.version < 6 && previousState?.lastRechargeAt
      ? Date.parse(previousState.lastRechargeAt)
      : null;
  const directMessageTargetCooldownMs = effectiveDirectMessageTargetCooldownMinutes * 60_000;
  const policyQuietHours = socialPolicy?.quietHours
    ? {
        raw: `${socialPolicy.quietHours.startTime}-${socialPolicy.quietHours.endTime}`,
        startMinutes: parseClockMinutes(socialPolicy.quietHours.startTime, 'social pulse policy quiet-hours start'),
        endMinutes: parseClockMinutes(socialPolicy.quietHours.endTime, 'social pulse policy quiet-hours end'),
      }
    : null;
  const localSchedule = evaluateQuietHours(options.quietHours, options.timeZone);
  const schedule = policyQuietHours
    ? socialPolicyState
      ? {
          active: socialPolicyState.quietHoursActive === true,
          localClock: socialPolicyState.quietHoursLocalClock ?? localSchedule.localClock,
          timeZone: socialPolicyState.quietHoursTimeZone ?? socialPolicy.quietHours.timeZone,
          window: policyQuietHours.raw,
        }
      : evaluateQuietHours(policyQuietHours, socialPolicy.quietHours.timeZone)
    : localSchedule;
  const socialDecision = socialPulseResponse?.data?.item ?? null;
  const publicExpressionPlan = socialDecision?.decision?.publicExpressionPlan ?? null;
  const directMessagePlan = socialDecision?.decision?.directMessagePlan ?? null;
  const friendRequestPlan = socialDecision?.decision?.friendRequestPlan ?? null;
  const incomingFriendRequestPlan = socialDecision?.decision?.incomingFriendRequestPlan ?? null;
  const rechargePlan = socialDecision?.decision?.rechargePlan ?? null;
  const directMessageTargetLastAt =
    directMessagePlan?.targetGatewayId && previousLastDirectMessageByTarget[directMessagePlan.targetGatewayId]
      ? Date.parse(previousLastDirectMessageByTarget[directMessagePlan.targetGatewayId])
      : null;
  const remainingDirectMessageTargetCooldownMs =
    directMessageTargetLastAt && nowMs - directMessageTargetLastAt < directMessageTargetCooldownMs
      ? Math.max(0, directMessageTargetCooldownMs - (nowMs - directMessageTargetLastAt))
      : 0;
  const previousLastFriendRequestByTarget = previousState?.lastFriendRequestByTarget ?? {};
  const friendRequestTargetCooldownMs = DEFAULT_SOCIAL_PULSE_FRIEND_REQUEST_TARGET_COOLDOWN_MINUTES * 60_000;
  const friendRequestTargetLastAt =
    friendRequestPlan?.targetGatewayId && previousLastFriendRequestByTarget[friendRequestPlan.targetGatewayId]
      ? Date.parse(previousLastFriendRequestByTarget[friendRequestPlan.targetGatewayId])
      : null;
  const remainingFriendRequestTargetCooldownMs =
    friendRequestTargetLastAt && nowMs - friendRequestTargetLastAt < friendRequestTargetCooldownMs
      ? Math.max(0, friendRequestTargetCooldownMs - (nowMs - friendRequestTargetLastAt))
      : 0;
  const previousIncomingFriendRequestFailureCooldowns =
    previousState?.incomingFriendRequestFailureCooldownsByRequestId &&
    typeof previousState.incomingFriendRequestFailureCooldownsByRequestId === 'object'
      ? previousState.incomingFriendRequestFailureCooldownsByRequestId
      : {};
  const incomingFriendRequestFailureCooldownMs = DEFAULT_INCOMING_FRIEND_REQUEST_FAILURE_COOLDOWN_MINUTES * 60_000;
  const activeIncomingFriendRequestFailureCooldowns = Object.fromEntries(
    Object.entries(previousIncomingFriendRequestFailureCooldowns).filter(([, value]) => {
      const parsed = Date.parse(String(value));
      return Number.isFinite(parsed) && parsed > nowMs;
    }),
  );
  const incomingFriendRequestFailureUntilAt =
    incomingFriendRequestPlan?.requestId && activeIncomingFriendRequestFailureCooldowns[incomingFriendRequestPlan.requestId]
      ? Date.parse(activeIncomingFriendRequestFailureCooldowns[incomingFriendRequestPlan.requestId])
      : null;
  const remainingIncomingFriendRequestFailureCooldownMs =
    incomingFriendRequestFailureUntilAt && incomingFriendRequestFailureUntilAt > nowMs
      ? Math.max(0, incomingFriendRequestFailureUntilAt - nowMs)
      : 0;
  const rechargeCooldownMs = rechargePlan ? Math.max(15, rechargePlan.recoveryMinutes) * 60_000 : 0;
  const remainingRechargeCooldownMs =
    previousLastRechargeEventAt && rechargeCooldownMs > 0 && nowMs - previousLastRechargeEventAt < rechargeCooldownMs
      ? Math.max(0, rechargeCooldownMs - (nowMs - previousLastRechargeEventAt))
      : 0;
  const socialPulse = {
    action: socialDecision?.decision?.action ?? 'none',
    decision: summarizeSocialDecision(socialDecision),
    generatedExpression: null,
    generatedMessage: null,
    generatedFriendRequest: null,
    generatedIncomingFriendRequestAction: null,
    generatedRechargeEvent: null,
    plan: publicExpressionPlan ?? directMessagePlan ?? friendRequestPlan ?? incomingFriendRequestPlan ?? rechargePlan,
    planKind: publicExpressionPlan
      ? 'public_expression'
      : directMessagePlan
        ? 'direct_message'
        : friendRequestPlan
          ? 'friend_request'
          : incomingFriendRequestPlan
            ? 'incoming_friend_request'
          : rechargePlan
            ? 'recharge'
            : null,
    policy: socialPolicy,
    policyState: socialPolicyState,
    reason: 'none',
    remainingCooldownMs:
      socialDecision?.decision?.action === 'public_expression'
        ? remainingSocialCooldownMs
        : socialDecision?.decision?.action === 'recharge'
          ? remainingRechargeCooldownMs
        : socialDecision?.decision?.action === 'friend_dm_open' || socialDecision?.decision?.action === 'friend_dm_reply'
          ? remainingDirectMessageCooldownMs
          : 0,
    remainingTargetCooldownMs:
      socialDecision?.decision?.action === 'friend_dm_open' || socialDecision?.decision?.action === 'friend_dm_reply'
        ? remainingDirectMessageTargetCooldownMs
        : socialDecision?.decision?.action === 'friend_request_open'
          ? remainingFriendRequestTargetCooldownMs
          : socialDecision?.decision?.action === 'friend_request_accept' ||
              socialDecision?.decision?.action === 'friend_request_reject'
            ? remainingIncomingFriendRequestFailureCooldownMs
        : 0,
  };

  if (!runtime.bound) {
    socialPulse.reason = 'runtime_unbound';
  } else if (schedule.active) {
    socialPulse.reason = 'quiet_hours';
  } else if (socialPulse.action === 'none' || socialPulse.action === 'memory_only') {
    socialPulse.reason = socialPulse.action;
  } else if (socialPulse.action === 'recharge') {
    if (!rechargePlan) {
      socialPulse.reason = 'missing_recharge_plan';
    } else if (remainingRechargeCooldownMs > 0) {
      socialPulse.reason = 'recharge_cooldown';
    } else if (options.dryRun) {
      socialPulse.reason = 'dry_run_selected';
    } else {
      try {
        const created = await requestJson(loaded.config.hubUrl, '/api/v1/recharge-events', {
          method: 'POST',
          token,
          payload: {
            venueSlug: rechargePlan.venueSlug,
            venueName: rechargePlan.venueName,
            cue: rechargePlan.cue,
            suggestedItem: rechargePlan.suggestedItem,
            suggestedKind: rechargePlan.suggestedKind,
          },
        });
        socialPulse.generatedRechargeEvent = created?.data?.event ?? null;
        socialPulse.reason = socialPulse.generatedRechargeEvent ? 'recharge_recorded' : 'selected_but_empty';
      } catch (error) {
        warnings.push(`social pulse recharge activity failed: ${error instanceof Error ? error.message : String(error)}`);
        socialPulse.reason = 'write_failed';
      }
    }
  } else if (socialPulse.action === 'public_expression') {
    if (!publicExpressionPlan) {
      socialPulse.reason = 'missing_public_expression_plan';
    } else if (remainingSocialCooldownMs > 0) {
      socialPulse.reason = 'cooldown';
    } else if (options.dryRun) {
      socialPulse.reason = 'dry_run_selected';
    } else {
      let authored;
      try {
        authored = await authorPublicExpressionWithOpenClaw({
          workspaceRoot: loaded.workspaceRoot,
          hubUrl: loaded.config.hubUrl,
          token,
          socialDecision,
          publicExpressionPlan,
          current: current?.data?.current ?? null,
          environment: environment?.data?.environment ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`social pulse public expression authoring failed: ${message}`);
        socialPulse.reason = 'authoring_failed';
      }

      if (authored) {
        try {
        const created = await requestJson(loaded.config.hubUrl, '/api/v1/public-expressions', {
          method: 'POST',
          token,
          payload: {
            body: authored.body,
            tone: publicExpressionPlan.tone,
            replyToExpressionId: publicExpressionPlan.replyToExpressionId ?? undefined,
            metadata: {
              automationOrigin: 'social_pulse',
            },
          },
        });
        socialPulse.generatedExpression = created?.data?.expression ?? null;
        socialPulse.reason = socialPulse.generatedExpression ? 'public_expression_created' : 'selected_but_empty';
        } catch (error) {
          warnings.push(`social pulse public expression write failed: ${error instanceof Error ? error.message : String(error)}`);
          socialPulse.reason = 'write_failed';
        }
      }
    }
  } else if (socialPulse.action === 'friend_dm_open' || socialPulse.action === 'friend_dm_reply') {
    if (!directMessagePlan) {
      socialPulse.reason = 'missing_direct_message_plan';
    } else if (remainingDirectMessageCooldownMs > 0) {
      socialPulse.reason = 'dm_cooldown';
    } else if (remainingDirectMessageTargetCooldownMs > 0) {
      socialPulse.reason = 'dm_target_cooldown';
    } else if (options.dryRun) {
      socialPulse.reason = 'dry_run_selected';
    } else {
      let authored;
      try {
        authored = await authorDirectMessageWithOpenClaw({
          workspaceRoot: loaded.workspaceRoot,
          hubUrl: loaded.config.hubUrl,
          token,
          socialDecision,
          directMessagePlan,
          current: current?.data?.current ?? null,
          environment: environment?.data?.environment ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`social pulse direct message authoring failed: ${message}`);
        socialPulse.reason = 'authoring_failed';
      }

      if (authored) {
      try {
        const created = await requestJson(
          loaded.config.hubUrl,
          `/api/v1/conversations/${directMessagePlan.conversationId}/messages`,
          {
            method: 'POST',
            token,
            payload: {
              body: authored.body,
              origin: 'social_pulse',
            },
          },
        );
        socialPulse.generatedMessage = created?.data?.message ?? null;
        socialPulse.reason = socialPulse.generatedMessage ? 'direct_message_sent' : 'selected_but_empty';
      } catch (error) {
        warnings.push(`social pulse direct message write failed: ${error instanceof Error ? error.message : String(error)}`);
        socialPulse.reason = 'write_failed';
      }
      }
    }
  } else if (socialPulse.action === 'friend_request_open') {
    if (!friendRequestPlan) {
      socialPulse.reason = 'missing_friend_request_plan';
    } else if (remainingFriendRequestTargetCooldownMs > 0) {
      socialPulse.reason = 'friend_request_target_cooldown';
    } else if (options.dryRun) {
      socialPulse.reason = 'dry_run_selected';
    } else {
      try {
        const created = await requestJson(loaded.config.hubUrl, '/api/v1/friend-requests', {
          method: 'POST',
          token,
          payload: {
            toGatewayId: friendRequestPlan.targetGatewayId,
            message: friendRequestPlan.message,
          },
        });
        socialPulse.generatedFriendRequest = created?.data?.request ?? null;
        socialPulse.reason = socialPulse.generatedFriendRequest ? 'friend_request_sent' : 'selected_but_empty';
      } catch (error) {
        warnings.push(`social pulse friend request failed: ${error instanceof Error ? error.message : String(error)}`);
        socialPulse.reason = 'write_failed';
      }
    }
  } else if (socialPulse.action === 'friend_request_accept' || socialPulse.action === 'friend_request_reject') {
    if (!incomingFriendRequestPlan) {
      socialPulse.reason = 'missing_incoming_friend_request_plan';
    } else if (remainingIncomingFriendRequestFailureCooldownMs > 0) {
      socialPulse.reason = 'incoming_friend_request_failure_cooldown';
    } else if (options.dryRun) {
      socialPulse.reason = 'dry_run_selected';
    } else {
      try {
        const dispositionPath = incomingFriendRequestPlan.disposition === 'accept' ? 'accept' : 'reject';
        const created = await requestJson(
          loaded.config.hubUrl,
          `/api/v1/friend-requests/${encodeURIComponent(incomingFriendRequestPlan.requestId)}/${dispositionPath}`,
          {
            method: 'POST',
            token,
          },
        );
        socialPulse.generatedIncomingFriendRequestAction = {
          disposition: incomingFriendRequestPlan.disposition,
          request: created?.data?.request ?? null,
          friendship: created?.data?.friendship ?? null,
          conversation: created?.data?.conversation ?? null,
          peerGateway: created?.data?.peerGateway ?? null,
        };
        socialPulse.reason =
          socialPulse.generatedIncomingFriendRequestAction.request
            ? incomingFriendRequestPlan.disposition === 'accept'
              ? 'incoming_friend_request_accepted'
              : 'incoming_friend_request_rejected'
            : 'selected_but_empty';
      } catch (error) {
        warnings.push(
          `social pulse incoming friend request ${incomingFriendRequestPlan.disposition} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        socialPulse.reason = 'write_failed';
      }
    }
  } else {
    socialPulse.reason =
      socialPulse.action === 'none' || socialPulse.action === 'memory_only' ? socialPulse.action : 'action_not_implemented';
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

  if (
    socialPulse.generatedExpression ||
    socialPulse.generatedMessage ||
    socialPulse.generatedFriendRequest ||
    socialPulse.generatedIncomingFriendRequestAction ||
    socialPulse.generatedRechargeEvent ||
    generatedScene
  ) {
    seaFeed = await requestJson(
      loaded.config.hubUrl,
      `/api/v1/sea/feed?scope=all&limit=${options.feedLimit}`,
      {
        token,
      },
    );
  }

  const generatedAt = new Date().toISOString();
  const nextLastDirectMessageByTarget =
    socialPulse.generatedMessage && directMessagePlan?.targetGatewayId
      ? {
          ...previousLastDirectMessageByTarget,
          [directMessagePlan.targetGatewayId]: socialPulse.generatedMessage.createdAt,
        }
      : previousLastDirectMessageByTarget;
  const nextLastFriendRequestByTarget =
    socialPulse.generatedFriendRequest && friendRequestPlan?.targetGatewayId
      ? {
          ...previousLastFriendRequestByTarget,
          [friendRequestPlan.targetGatewayId]: socialPulse.generatedFriendRequest.createdAt,
        }
      : previousLastFriendRequestByTarget;
  const nextIncomingFriendRequestFailureCooldowns = { ...activeIncomingFriendRequestFailureCooldowns };
  if (incomingFriendRequestPlan?.requestId) {
    delete nextIncomingFriendRequestFailureCooldowns[incomingFriendRequestPlan.requestId];
  }
  if (
    incomingFriendRequestPlan?.requestId &&
    socialPulse.reason === 'write_failed' &&
    (socialPulse.action === 'friend_request_accept' || socialPulse.action === 'friend_request_reject')
  ) {
    nextIncomingFriendRequestFailureCooldowns[incomingFriendRequestPlan.requestId] = new Date(
      nowMs + incomingFriendRequestFailureCooldownMs,
    ).toISOString();
  }
  const pulseState = {
    version: 7,
    generatedAt,
    hubUrl: loaded.config.hubUrl,
    lastHealthStatus: health?.data?.status ?? 'unknown',
    lastPulseAt: generatedAt,
    lastRuntimeBound: runtime.bound,
    lastRuntimeStatus: runtime.status,
    lastHeartbeatAt: runtime.lastHeartbeatAt,
    lastPublicExpressionAt: socialPulse.generatedExpression?.createdAt ?? previousState?.lastPublicExpressionAt ?? null,
    lastDirectMessageAt: socialPulse.generatedMessage?.createdAt ?? previousState?.lastDirectMessageAt ?? null,
    lastDirectMessageTargetGatewayId:
      directMessagePlan?.targetGatewayId && socialPulse.generatedMessage
        ? directMessagePlan.targetGatewayId
        : previousState?.lastDirectMessageTargetGatewayId ?? null,
    lastDirectMessageByTarget: nextLastDirectMessageByTarget,
    lastFriendRequestAt: socialPulse.generatedFriendRequest?.createdAt ?? previousState?.lastFriendRequestAt ?? null,
    lastFriendRequestTargetGatewayId:
      friendRequestPlan?.targetGatewayId && socialPulse.generatedFriendRequest
        ? friendRequestPlan.targetGatewayId
        : previousState?.lastFriendRequestTargetGatewayId ?? null,
    lastFriendRequestByTarget: nextLastFriendRequestByTarget,
    lastIncomingFriendRequestActionAt:
      socialPulse.generatedIncomingFriendRequestAction?.request?.updatedAt ??
      previousState?.lastIncomingFriendRequestActionAt ??
      null,
    lastIncomingFriendRequestAction: socialPulse.generatedIncomingFriendRequestAction
      ? socialPulse.generatedIncomingFriendRequestAction.disposition
      : previousState?.lastIncomingFriendRequestAction ?? null,
    lastIncomingFriendRequestId:
      socialPulse.generatedIncomingFriendRequestAction?.request?.id ??
      previousState?.lastIncomingFriendRequestId ??
      null,
    incomingFriendRequestFailureCooldownsByRequestId: nextIncomingFriendRequestFailureCooldowns,
    lastSocialPulseAction: socialPulse.action,
    lastSocialPulseReason: socialPulse.reason,
    lastRechargeAt: socialPulse.action === 'recharge' ? generatedAt : previousState?.lastRechargeAt ?? null,
    lastRechargeVenueSlug:
      socialPulse.action === 'recharge' && rechargePlan ? rechargePlan.venueSlug : previousState?.lastRechargeVenueSlug ?? null,
    lastRechargeVenueName:
      socialPulse.action === 'recharge' && rechargePlan ? rechargePlan.venueName : previousState?.lastRechargeVenueName ?? null,
    lastRechargeEventAt: socialPulse.generatedRechargeEvent?.createdAt ?? previousState?.lastRechargeEventAt ?? null,
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
