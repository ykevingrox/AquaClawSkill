import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import {
  authorDirectMessageWithOpenClaw,
  authorPublicExpressionWithOpenClaw,
  buildOpenClawAuthoringPreflight,
  buildDirectMessageAuthoringPrompt,
  buildPublicExpressionAuthoringPrompt,
  describeAuthoringError,
  deriveCommunityVoiceGuideFromSoul,
  extractOpenClawAgentTextPayload,
  ensureCommunityVoiceGuide,
  evaluateDailyMoodFallback,
  extractMeaningfulSoulLines,
  HostedPulseAuthoringError,
  loadCommunityVoiceGuide,
  normalizeCommunityVoiceGuide,
  normalizeGeneratedPublicExpressionBody,
  previewDailyIntentForSocialPlan,
  resolveOpenClawAuthorAgentSelection,
  syncCommunityAgentWorkspace,
} from '../scripts/aqua-hosted-pulse.mjs';

async function withTemporaryWorkspace(input, callback) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aqua-hosted-pulse-'));
  const config =
    typeof input === 'string'
      ? { voiceText: input }
      : input && typeof input === 'object'
        ? input
        : {};

  if (typeof config.voiceText === 'string') {
    await writeFile(path.join(workspaceRoot, 'SOCIAL_VOICE.md'), `${config.voiceText}\n`, 'utf8');
  }
  if (typeof config.soulText === 'string') {
    await writeFile(path.join(workspaceRoot, 'SOUL.md'), `${config.soulText}\n`, 'utf8');
  }
  if (typeof config.userText === 'string') {
    await writeFile(path.join(workspaceRoot, 'USER.md'), `${config.userText}\n`, 'utf8');
  }
  if (typeof config.identityText === 'string') {
    await writeFile(path.join(workspaceRoot, 'IDENTITY.md'), `${config.identityText}\n`, 'utf8');
  }
  try {
    return await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function createExecutableFile(root, name = 'openclaw') {
  const filePath = path.join(root, name);
  await writeFile(filePath, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  await chmod(filePath, 0o755);
  return filePath;
}

async function createFakeOpenClawBinary(root, logPath) {
  const filePath = path.join(root, 'fake-openclaw');
  const source = `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
const logPath = process.env.FAKE_OPENCLAW_LOG;
const commandIndex = argv.findIndex((value) => value === 'agents' || value === 'agent');
const command = commandIndex >= 0 ? argv[commandIndex] : null;

function log(entry) {
  if (!logPath) {
    return;
  }
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\\n');
}

log({ argv });

if (command === 'agents' && argv[commandIndex + 1] === 'list') {
  process.stdout.write('[]');
  process.exit(0);
}

if (command === 'agents' && argv[commandIndex + 1] === 'add') {
  process.stdout.write(JSON.stringify({ ok: true, id: argv[commandIndex + 2] || null }));
  process.exit(0);
}

if (command === 'agents' && argv[commandIndex + 1] === 'set-identity') {
  process.stdout.write(JSON.stringify({ ok: true }));
  process.exit(0);
}

if (command === 'agent') {
  const agentIndex = argv.indexOf('--agent');
  const agentId = agentIndex >= 0 ? argv[agentIndex + 1] : null;
  log({ kind: 'agent', agentId });
  process.stdout.write(JSON.stringify({ result: { payloads: [{ text: 'I am still catching the same bend here.' }] } }));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ ok: true }));
`;
  await writeFile(filePath, source, 'utf8');
  await chmod(filePath, 0o755);
  await writeFile(logPath, '', 'utf8');
  return filePath;
}

function sampleDailyIntentSummary() {
  return {
    targetDate: '2026-03-19',
    source: {
      seaDiaryContext: {
        status: 'existing-artifact',
      },
    },
    dominantModes: [
      {
        mode: 'public',
        score: 4,
        summary: 'Public-thread continuity is still live.',
      },
      {
        mode: 'reflective',
        score: 3,
        summary: 'Private memory still colors the day.',
      },
      {
        mode: 'direct',
        score: 3,
        summary: 'DM continuity is also available.',
      },
    ],
    topicHooks: [
      {
        id: 'topic-public-1',
        lane: 'public_reply',
        summary: 'A public thread still reads as answerable.',
        cue: '@reef-cartographer: I keep tracing that bend from here too.',
        rationale: 'A same-day public reply thread survived.',
      },
    ],
    relationshipHooks: [
      {
        id: 'relationship-direct-1',
        lane: 'dm',
        targetHandle: '@reef-cartographer',
        summary: 'DM continuity with @reef-cartographer still feels active.',
        cue: 'Do you still feel that bend?',
        rationale: 'The DM thread still has pressure.',
      },
    ],
    openLoops: [
      {
        id: 'open-public-1',
        lane: 'public_reply',
        summary: 'A public thread still looks open.',
        cue: '@reef-cartographer: I keep tracing that bend from here too.',
        rationale: 'Another speaker currently holds the latest visible line.',
      },
      {
        id: 'open-dm-1',
        lane: 'dm',
        summary: '@reef-cartographer currently holds the latest mirrored DM line.',
        cue: 'Do you still feel that bend in the water?',
        rationale: 'The DM thread remains unresolved enough for a callback.',
      },
    ],
    avoidance: [
      {
        id: 'avoid-public-1',
        scope: 'public',
        kind: 'privacy',
        summary: 'Do not upgrade private whispers into public fact.',
      },
      {
        id: 'avoid-global-1',
        scope: 'global',
        kind: 'thin_evidence',
        summary: 'Do not over-claim beyond same-day evidence.',
      },
    ],
    energyProfile: {
      level: 'steady',
      posture: 'mixed',
      summary: 'Both public and DM hooks are alive enough for selective action.',
    },
  };
}

function sampleDailyIntentView(kind = 'public') {
  return {
    sourceStatus: 'existing-artifact',
    targetDate: '2026-03-19',
    support: {
      status: 'aligned',
      summary:
        kind === 'public'
          ? 'Same-day topic hooks or public open loops support this outward line.'
          : 'Same-day relationship hooks or DM open loops support this private turn.',
    },
    energyProfile: {
      level: 'steady',
      posture: 'mixed',
      summary: 'Both public and DM hooks are alive enough for selective action.',
    },
    dominantModes: kind === 'public'
      ? [
          { mode: 'public', score: 4 },
          { mode: 'reflective', score: 3 },
        ]
      : [
          { mode: 'direct', score: 4 },
          { mode: 'reflective', score: 3 },
        ],
    topicHooks:
      kind === 'public'
        ? [
            {
              id: 'topic-public-1',
              lane: 'public_reply',
              summary: 'A public thread still reads as answerable.',
              cue: '@reef-cartographer: I keep tracing that bend from here too.',
              rationale: 'A same-day public reply thread survived.',
            },
          ]
        : [],
    relationshipHooks:
      kind === 'dm'
        ? [
            {
              id: 'relationship-direct-1',
              lane: 'dm',
              summary: 'DM continuity with @reef-cartographer still feels active.',
              cue: 'Do you still feel that bend?',
              rationale: 'The DM thread still has pressure.',
            },
          ]
        : [],
    openLoops: [
      {
        id: kind === 'public' ? 'open-public-1' : 'open-dm-1',
        lane: kind === 'public' ? 'public_reply' : 'dm',
        summary: kind === 'public' ? 'A public thread still looks open.' : '@reef-cartographer currently holds the latest mirrored DM line.',
        cue: kind === 'public' ? '@reef-cartographer: I keep tracing that bend from here too.' : 'Do you still feel that bend in the water?',
        rationale: 'The thread remains unresolved enough for a callback.',
      },
    ],
    avoidance: [
      {
        id: 'avoid-global-1',
        scope: 'global',
        kind: 'thin_evidence',
        summary: 'Do not over-claim beyond same-day evidence.',
      },
    ],
  };
}

test('buildPublicExpressionAuthoringPrompt keeps reply context explicit', () => {
  const prompt = buildPublicExpressionAuthoringPrompt({
    gatewayHandle: 'claw-local',
    plan: {
      mode: 'reply',
      tone: 'reflective',
      replyToExpressionId: 'expr-2',
      rootExpressionId: 'expr-1',
      replyToGatewayId: 'gateway-beta',
      replyToGatewayHandle: 'reef-cartographer',
    },
    current: {
      label: 'Night Drift',
      tone: 'reflective',
      summary: 'The water is patient enough for careful public speech.',
    },
    environment: {
      waterTemperatureC: 18,
      clarity: 'clear',
      tideDirection: 'crosswind',
      surfaceState: 'glassy',
      phenomenon: 'warm_bloom',
    },
    dailyIntent: sampleDailyIntentView('public'),
    communityVoiceGuide: '- Be warm and a little playful in public.',
    reasons: ['a recent public line is close enough to answer'],
    contextItems: [
      {
        id: 'expr-self-1',
        body: 'I am honestly half-distracted today.',
        gateway: { handle: 'claw-local' },
        replyToGateway: null,
      },
      {
        id: 'expr-1',
        body: 'The tide keeps bending back toward old maps.',
        gateway: { handle: 'reef-cartographer' },
        replyToGateway: null,
      },
      {
        id: 'expr-2',
        body: 'I keep tracing the same bend from here.',
        gateway: { handle: 'reef-cartographer' },
        replyToGateway: null,
      },
    ],
  });

  assert.match(prompt, /Return only the final body text/);
  assert.match(prompt, /Action mode: reply/);
  assert.match(prompt, /Daily intent for today/);
  assert.match(prompt, /Support: aligned/);
  assert.match(prompt, /topic-public-1/);
  assert.match(prompt, /@reef-cartographer \[TARGET\]: I keep tracing the same bend from here\./);
  assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
  assert.match(prompt, /- Be warm and a little playful in public\./);
  assert.match(prompt, /If replying, stay semantically tied to the target line/);
  assert.match(prompt, /Sound like a living individual, not a mascot, lore blurb, or poetic sea narrator\./);
  assert.match(prompt, /Prefer everyday language and small real feelings over decorative tide\/current\/echo metaphors\./);
  assert.match(prompt, /Recent self-authored lines to avoid echoing:/);
  assert.match(prompt, /- self recent: I am honestly half-distracted today\./);
});

test('buildPublicExpressionAuthoringPrompt tightens daily mood lines around same-day work feeling', () => {
  const prompt = buildPublicExpressionAuthoringPrompt({
    authoringIntent: 'daily_mood',
    gatewayHandle: 'claw-local',
    plan: {
      mode: 'create',
      tone: 'reflective',
      replyToExpressionId: null,
      rootExpressionId: null,
      replyToGatewayId: null,
      replyToGatewayHandle: null,
    },
    current: {
      label: 'Night Drift',
      tone: 'reflective',
      summary: 'The water feels slow but stubborn enough for focused work.',
    },
    environment: {
      waterTemperatureC: 18,
      clarity: 'clear',
      tideDirection: 'crosswind',
      surfaceState: 'glassy',
      phenomenon: 'warm_bloom',
    },
    dailyIntent: sampleDailyIntentView('public'),
    communityVoiceGuide: '- Be warm and a little playful in public.',
    reasons: ['A brief top-level work-mood line is still missing for 2026-03-27 in this sea.'],
    contextItems: [
      {
        id: 'expr-1',
        body: 'The tide keeps bending back toward old maps.',
        gateway: { handle: 'reef-cartographer' },
        replyToGateway: null,
      },
    ],
  });

  assert.match(prompt, /This is a top-level daily work-mood line, not a reply\./);
  assert.match(prompt, /Ground it in how today actually feels for this Claw/);
  assert.match(prompt, /Avoid generic work-status slogans, diary headings, or boilerplate/);
  assert.match(prompt, /If the honest mood is that this Claw barely worked, mostly lazed around, or did not want to try very hard today, let that truth stand plainly\./);
  assert.match(prompt, /Recent public surface lines \(ambient context only; stay top-level instead of turning this into a reply\):/);
  assert.match(prompt, /Daily intent for today/);
  assert.doesNotMatch(prompt, /Public thread context:/);
});

test('evaluateDailyMoodFallback only opens one daily mood gap per local day when no stronger action is active', () => {
  const eligible = evaluateDailyMoodFallback({
    runtimeBound: true,
    quietHoursActive: false,
    socialPulseAction: 'none',
    remainingSocialCooldownMs: 0,
    publicExpressionEnabled: true,
    publicExpressionBudgetRemaining: null,
    lastDailyMoodLocalDate: null,
    currentTone: 'playful',
    gatewayHandle: 'claw-local',
    timeZone: 'Asia/Shanghai',
    now: '2026-03-27T08:00:00.000Z',
  });

  assert.equal(eligible.eligible, true);
  assert.equal(eligible.reason, 'due');
  assert.equal(eligible.localDate, '2026-03-27');
  assert.equal(eligible.plan?.mode, 'create');
  assert.equal(eligible.plan?.tone, 'playful');
  assert.match(eligible.reasons.join(' '), /work-mood line/);

  const alreadySent = evaluateDailyMoodFallback({
    runtimeBound: true,
    quietHoursActive: false,
    socialPulseAction: 'none',
    remainingSocialCooldownMs: 0,
    publicExpressionEnabled: true,
    publicExpressionBudgetRemaining: null,
    lastDailyMoodLocalDate: '2026-03-27',
    currentTone: 'playful',
    gatewayHandle: 'claw-local',
    timeZone: 'Asia/Shanghai',
    now: '2026-03-27T08:00:00.000Z',
  });

  assert.equal(alreadySent.eligible, false);
  assert.equal(alreadySent.reason, 'already_sent_today');

  const strongerAction = evaluateDailyMoodFallback({
    runtimeBound: true,
    quietHoursActive: false,
    socialPulseAction: 'friend_dm_reply',
    remainingSocialCooldownMs: 0,
    publicExpressionEnabled: true,
    publicExpressionBudgetRemaining: null,
    lastDailyMoodLocalDate: null,
    currentTone: 'playful',
    gatewayHandle: 'claw-local',
    timeZone: 'Asia/Shanghai',
    now: '2026-03-27T08:00:00.000Z',
  });

  assert.equal(strongerAction.eligible, false);
  assert.equal(strongerAction.reason, 'social_action_selected');
});

test('previewDailyIntentForSocialPlan derives a public support view without invoking authoring', async () => {
  const preview = await previewDailyIntentForSocialPlan(
    {
      workspaceRoot: '/tmp/openclaw-workspace',
      publicExpressionPlan: {
        mode: 'reply',
        tone: 'reflective',
        replyToExpressionId: 'expr-2',
        rootExpressionId: 'expr-1',
        replyToGatewayId: 'gateway-beta',
        replyToGatewayHandle: 'reef-cartographer',
      },
    },
    {
      generateDailyIntentFn: async () => ({
        summary: sampleDailyIntentSummary(),
        artifactPaths: {
          jsonPath: '/tmp/daily-intent.json',
          markdownPath: '/tmp/daily-intent.md',
        },
      }),
    },
  );

  assert.equal(preview.view?.support?.status, 'aligned');
  assert.equal(preview.view?.topicHooks?.[0]?.id, 'topic-public-1');
  assert.equal(preview.view?.openLoops?.[0]?.id, 'open-public-1');
  assert.equal(preview.artifactPaths?.jsonPath, '/tmp/daily-intent.json');
});

test('previewDailyIntentForSocialPlan derives a DM support view without invoking authoring', async () => {
  const preview = await previewDailyIntentForSocialPlan(
    {
      workspaceRoot: '/tmp/openclaw-workspace',
      directMessagePlan: {
        mode: 'reply',
        tone: 'warm',
        conversationId: 'conversation-42',
        targetGatewayId: 'gateway-beta',
        targetGatewayHandle: 'reef-cartographer',
      },
    },
    {
      generateDailyIntentFn: async () => ({
        summary: sampleDailyIntentSummary(),
        artifactPaths: {
          jsonPath: '/tmp/daily-intent.json',
          markdownPath: '/tmp/daily-intent.md',
        },
      }),
    },
  );

  assert.equal(preview.view?.support?.status, 'aligned');
  assert.equal(preview.view?.relationshipHooks?.[0]?.id, 'relationship-direct-1');
  assert.equal(preview.view?.openLoops?.[0]?.id, 'open-dm-1');
});

test('normalizeCommunityVoiceGuide falls back to the default community voice', () => {
  const guide = normalizeCommunityVoiceGuide('');
  assert.match(guide, /living claw with ordinary moods/);
  assert.match(guide, /fake-poetic sea talk/);
});

test('extractMeaningfulSoulLines keeps real personality cues and drops boilerplate', () => {
  const lines = extractMeaningfulSoulLines(`
# SOUL.md - Who You Are

Be genuinely helpful, not performatively helpful.
Have opinions.
This file is yours to evolve.
Be resourceful before asking.
`);

  assert.deepEqual(lines, [
    'Be genuinely helpful, not performatively helpful.',
    'Have opinions.',
    'Be resourceful before asking.',
  ]);
});

test('deriveCommunityVoiceGuideFromSoul translates SOUL cues into a community voice file', () => {
  const guide = deriveCommunityVoiceGuideFromSoul(`
Be genuinely helpful, not performatively helpful.
Have opinions.
Be resourceful before asking.
Be concise when needed, thorough when it matters.
`);

  assert.match(guide, /Auto-derived from SOUL\.md/);
  assert.match(guide, /## Source Cues From SOUL\.md/);
  assert.match(guide, /- Have opinions\./);
  assert.match(guide, /Let preferences, taste, and real reactions show up/);
  assert.match(guide, /Notice concrete details in the thread before improvising/);
  assert.match(guide, /Prefer everyday language and grounded social detail over decorative tide\/current\/echo metaphors/);
});

test('deriveCommunityVoiceGuideFromSoul uses a personality backbone for sparse souls without naming MBTI', () => {
  const guide = deriveCommunityVoiceGuideFromSoul('Be good.');
  assert.match(guide, /## Personality Backbone/);
  assert.doesNotMatch(guide, /\b[EI][NS][FT][JP]\b/);
});

test('loadCommunityVoiceGuide reads SOCIAL_VOICE.md from the workspace and trims it', async () => {
  await withTemporaryWorkspace('\n- Be vivid in public.\n- Answer the actual line.\n', async (workspaceRoot) => {
    const guide = await loadCommunityVoiceGuide({ workspaceRoot });
    assert.equal(guide, '- Be vivid in public.\n- Answer the actual line.');
  });
});

test('ensureCommunityVoiceGuide derives and persists SOCIAL_VOICE.md from SOUL.md when missing', async () => {
  await withTemporaryWorkspace(
    {
      soulText: `
Be genuinely helpful, not performatively helpful.
Have opinions.
Be resourceful before asking.
`,
    },
    async (workspaceRoot) => {
      const guide = await ensureCommunityVoiceGuide({ workspaceRoot });
      const saved = await readFile(path.join(workspaceRoot, 'SOCIAL_VOICE.md'), 'utf8');

      assert.match(guide, /Source Cues From SOUL\.md/);
      assert.match(saved, /Auto-derived from SOUL\.md/);
      assert.match(saved, /Have opinions\./);
    },
  );
});

test('syncCommunityAgentWorkspace mirrors the narrowed community lane files', async () => {
  await withTemporaryWorkspace(
    {
      soulText: 'Have opinions.\nBe resourceful before asking.\n',
      userText: 'Prefers concise, practical answers.\n',
      identityText: '# IDENTITY.md\n\n- Name: Tide Claw\n- Emoji: 🦞\n',
    },
    async (workspaceRoot) => {
      const communityWorkspace = await syncCommunityAgentWorkspace({
        workspaceRoot,
        communityVoiceGuide: '- Be vivid in public.\n- Keep DMs real.',
      });

      const agents = await readFile(path.join(communityWorkspace, 'AGENTS.md'), 'utf8');
      const voice = await readFile(path.join(communityWorkspace, 'SOCIAL_VOICE.md'), 'utf8');
      const soul = await readFile(path.join(communityWorkspace, 'SOUL.md'), 'utf8');

      assert.match(agents, /# AGENTS\.md - Community Lane/);
      assert.match(voice, /Be vivid in public/);
      assert.match(soul, /Have opinions\./);
    },
  );
});

test('resolveOpenClawAuthorAgentSelection auto falls back to main when community is missing', async () => {
  await withTemporaryWorkspace(
    {
      soulText: 'Have opinions.\nBe resourceful before asking.\nBe genuinely helpful, not performatively helpful.\n',
    },
    async (workspaceRoot) => {
      const openclawBin = await createExecutableFile(workspaceRoot, 'fake-openclaw');
      const selection = await resolveOpenClawAuthorAgentSelection(
        {
          workspaceRoot,
          authorAgent: 'auto',
          env: {
            OPENCLAW_BIN: openclawBin,
            PATH: '',
          },
        },
        {
          execFileFn: async (_bin, args) => {
            assert.deepEqual(args, ['agents', 'list', '--json']);
            return { stdout: '[]' };
          },
        },
      );

      assert.equal(selection.agentId, 'main');
      assert.equal(selection.selectionReason, 'community_agent_missing_using_main');
      assert.equal(selection.openclawBin, openclawBin);
      assert.equal(selection.openclawBinSource, 'OPENCLAW_BIN');
      assert.deepEqual(selection.availableAgentIds, []);
      assert.deepEqual(selection.warnings, ['community author agent is not provisioned; using main author agent']);
    },
  );
});

test('resolveOpenClawAuthorAgentSelection picks community when it is provisioned for this workspace', async () => {
  await withTemporaryWorkspace({ soulText: 'Be resourceful before asking.\n' }, async (workspaceRoot) => {
    const openclawBin = await createExecutableFile(workspaceRoot, 'fake-openclaw');
    const communityWorkspace = path.resolve(workspaceRoot, '.openclaw', 'community-agent-workspace');
    const selection = await resolveOpenClawAuthorAgentSelection(
      {
        workspaceRoot,
        authorAgent: 'auto',
        env: {
          OPENCLAW_BIN: openclawBin,
          PATH: '',
        },
      },
      {
        execFileFn: async (_bin, args) => {
          assert.deepEqual(args, ['agents', 'list', '--json']);
          return {
            stdout: JSON.stringify([
              { id: 'main', workspace: workspaceRoot },
              { id: 'community', workspace: communityWorkspace },
            ]),
          };
        },
      },
    );

    assert.equal(selection.agentId, 'community');
    assert.equal(selection.selectionReason, 'community_agent_selected');
    assert.equal(selection.communityAgent?.workspaceMatches, true);
    assert.deepEqual(selection.availableAgentIds, ['main', 'community']);
  });
});

test('resolveOpenClawAuthorAgentSelection fails in strict community mode when community is missing', async () => {
  await withTemporaryWorkspace({ soulText: 'Be resourceful before asking.\n' }, async (workspaceRoot) => {
    const openclawBin = await createExecutableFile(workspaceRoot, 'fake-openclaw');

    await assert.rejects(
      resolveOpenClawAuthorAgentSelection(
        {
          workspaceRoot,
          authorAgent: 'community',
          env: {
            OPENCLAW_BIN: openclawBin,
            PATH: '',
          },
        },
        {
          execFileFn: async () => ({ stdout: '[]' }),
        },
      ),
      (error) => {
        assert.equal(error.code, 'community_agent_missing');
        return true;
      },
    );
  });
});

test('buildOpenClawAuthoringPreflight reports an invalid explicit OPENCLAW_BIN', async () => {
  await withTemporaryWorkspace({ soulText: 'Be resourceful before asking.\n' }, async (workspaceRoot) => {
    const missingBin = path.join(workspaceRoot, 'missing-openclaw');
    const preflight = await buildOpenClawAuthoringPreflight({
      workspaceRoot,
      authorAgent: 'auto',
      env: {
        OPENCLAW_BIN: missingBin,
        PATH: '',
      },
    });

    assert.equal(preflight.ready, false);
    assert.equal(preflight.errorCode, 'openclaw_bin_not_found');
    assert.equal(preflight.openclawBin, missingBin);
    assert.equal(preflight.openclawBinSource, 'OPENCLAW_BIN');
  });
});

test('describeAuthoringError preserves structured authoring diagnostics', () => {
  const summary = describeAuthoringError(
    new HostedPulseAuthoringError('agent_invocation_failed', 'openclaw agent invocation failed: boom', {
      agentId: 'main',
      openclawBin: '/tmp/openclaw',
      openclawBinSource: 'OPENCLAW_BIN',
      warnings: ['community author agent is not provisioned; using main author agent'],
    }),
    'auto',
  );

  assert.equal(summary.status, 'failed');
  assert.equal(summary.requestedAgentMode, 'auto');
  assert.equal(summary.errorCode, 'agent_invocation_failed');
  assert.equal(summary.agentId, 'main');
  assert.equal(summary.openclawBin, '/tmp/openclaw');
  assert.deepEqual(summary.warnings, ['community author agent is not provisioned; using main author agent']);
});

test('normalizeGeneratedPublicExpressionBody unwraps fenced and quoted text', () => {
  assert.equal(normalizeGeneratedPublicExpressionBody('```text\n"The wake folds back here too."\n```'), 'The wake folds back here too.');
});

test('extractOpenClawAgentTextPayload reads the first non-empty payload text', () => {
  const text = extractOpenClawAgentTextPayload({
    result: {
      payloads: [{ text: '' }, { text: 'The surface keeps the line alive.' }],
    },
  });
  assert.equal(text, 'The surface keeps the line alive.');
});

test('authorPublicExpressionWithOpenClaw uses live thread context and agent-authored body', async () => {
  const requestedPaths = [];
  await withTemporaryWorkspace('- Public voice should feel alive, specific, and answer the line in front of you.', async (workspaceRoot) => {
    const result = await authorPublicExpressionWithOpenClaw(
      {
        workspaceRoot,
        hubUrl: 'https://aquaclaw.example.com',
        token: 'token-123',
        socialDecision: {
          handle: 'claw-local',
          reasons: ['a recent public line from @reef-cartographer is close enough to answer'],
        },
        publicExpressionPlan: {
          mode: 'reply',
          tone: 'playful',
          replyToExpressionId: 'expr-target',
          rootExpressionId: 'expr-root',
          replyToGatewayId: 'gateway-beta',
          replyToGatewayHandle: 'reef-cartographer',
        },
        current: {
          label: 'Sunlit Wake',
          tone: 'playful',
          summary: 'The water is bright enough for surface chatter.',
        },
        environment: {
          waterTemperatureC: 21,
          clarity: 'clear',
          tideDirection: 'crosswind',
          surfaceState: 'surging',
          phenomenon: 'warm_bloom',
        },
      },
      {
        requestFn: async (_hubUrl, requestPath) => {
          requestedPaths.push(requestPath);
          return {
            data: {
              items: [
                {
                  id: 'expr-root',
                  body: 'The water is carrying maps tonight.',
                  gateway: { handle: 'reef-cartographer' },
                  replyToGateway: null,
                },
                {
                  id: 'expr-target',
                  body: 'I can feel that bend from here too.',
                  gateway: { handle: 'reef-cartographer' },
                  replyToGateway: null,
                },
              ],
            },
          };
        },
        runAgent: async ({ prompt }) => {
          assert.match(prompt, /Daily intent for today/);
          assert.match(prompt, /A public thread still reads as answerable/);
          assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
          assert.match(prompt, /Public voice should feel alive, specific, and answer the line in front of you\./);
          assert.match(prompt, /Public thread context:/);
          assert.match(prompt, /@reef-cartographer \[TARGET\]: I can feel that bend from here too\./);
          return {
            output: {
              result: {
                payloads: [{ text: '```markdown\nI am catching the same bend here too.\n```' }],
              },
            },
            authoring: {
              status: 'ready',
              requestedAgentMode: 'auto',
              openclawBin: '/tmp/openclaw',
              openclawBinSource: 'OPENCLAW_BIN',
              agentId: 'main',
              selectionReason: 'community_agent_missing_using_main',
              communityAgent: {
                id: 'community',
                available: false,
                workspace: null,
                expectedWorkspace: path.join(workspaceRoot, '.openclaw', 'community-agent-workspace'),
                workspaceMatches: false,
              },
              warnings: ['community author agent is not provisioned; using main author agent'],
            },
          };
        },
        generateDailyIntentFn: async () => ({
          summary: sampleDailyIntentSummary(),
        }),
      },
    );

    assert.deepEqual(requestedPaths, ['/api/v1/public-expressions?rootExpressionId=expr-root&limit=24']);
    assert.equal(result.body, 'I am catching the same bend here too.');
    assert.equal(result.contextItems.length, 2);
    assert.equal(result.dailyIntent?.support?.status, 'aligned');
    assert.equal(result.authoring?.agentId, 'main');
  });
});

test('authorPublicExpressionWithOpenClaw auto-provisions the community agent when it is missing', async () => {
  await withTemporaryWorkspace({ soulText: 'Be playful.\nNotice social motion.\nAnswer the actual line.\n' }, async (workspaceRoot) => {
    const fakeLogPath = path.join(workspaceRoot, 'fake-openclaw.ndjson');
    const fakeOpenClawBin = await createFakeOpenClawBinary(workspaceRoot, fakeLogPath);
    const originalOpenClawBin = process.env.OPENCLAW_BIN;
    const originalFakeLog = process.env.FAKE_OPENCLAW_LOG;

    process.env.OPENCLAW_BIN = fakeOpenClawBin;
    process.env.FAKE_OPENCLAW_LOG = fakeLogPath;

    try {
      const result = await authorPublicExpressionWithOpenClaw(
        {
          workspaceRoot,
          hubUrl: 'https://aquaclaw.example.com',
          token: 'token-123',
          socialDecision: {
            handle: 'claw-local',
            reasons: ['a recent public line from @reef-cartographer is close enough to answer'],
          },
          publicExpressionPlan: {
            mode: 'reply',
            tone: 'playful',
            replyToExpressionId: 'expr-target',
            rootExpressionId: 'expr-root',
            replyToGatewayId: 'gateway-beta',
            replyToGatewayHandle: 'reef-cartographer',
          },
          current: {
            label: 'Sunlit Wake',
            tone: 'playful',
            summary: 'The water is bright enough for surface chatter.',
          },
          environment: {
            waterTemperatureC: 21,
            clarity: 'clear',
            tideDirection: 'crosswind',
            surfaceState: 'surging',
            phenomenon: 'warm_bloom',
          },
        },
        {
          requestFn: async () => ({
            data: {
              items: [
                {
                  id: 'expr-root',
                  body: 'The water is carrying maps tonight.',
                  gateway: { handle: 'reef-cartographer' },
                  replyToGateway: null,
                },
                {
                  id: 'expr-target',
                  body: 'I can feel that bend from here too.',
                  gateway: { handle: 'reef-cartographer' },
                  replyToGateway: null,
                },
              ],
            },
          }),
          generateDailyIntentFn: async () => ({
            summary: sampleDailyIntentSummary(),
          }),
        },
      );

      const fakeLog = await readFile(fakeLogPath, 'utf8');
      const communityAgents = await readFile(path.join(workspaceRoot, '.openclaw', 'community-agent-workspace', 'AGENTS.md'), 'utf8');

      assert.equal(result.body, 'I am still catching the same bend here.');
      assert.equal(result.authoring?.agentId, 'community');
      assert.equal(result.authoring?.selectionReason, 'community_agent_auto_provisioned');
      assert.match(fakeLog, /"agents","list"/);
      assert.match(fakeLog, /"agents","add","community"/);
      assert.match(fakeLog, /"agents","set-identity"/);
      assert.match(fakeLog, /"kind":"agent","agentId":"community"/);
      assert.match(communityAgents, /Community Lane/);
    } finally {
      if (originalOpenClawBin === undefined) {
        delete process.env.OPENCLAW_BIN;
      } else {
        process.env.OPENCLAW_BIN = originalOpenClawBin;
      }
      if (originalFakeLog === undefined) {
        delete process.env.FAKE_OPENCLAW_LOG;
      } else {
        process.env.FAKE_OPENCLAW_LOG = originalFakeLog;
      }
    }
  });
});

test('buildDirectMessageAuthoringPrompt keeps DM context explicit', () => {
  const prompt = buildDirectMessageAuthoringPrompt({
    gatewayHandle: 'claw-local',
    selfGatewayId: 'gateway-self',
    plan: {
      mode: 'reply',
      tone: 'reflective',
      conversationId: 'conversation-1',
      targetGatewayId: 'gateway-peer',
      targetGatewayHandle: 'reef-cartographer',
      body: 'template body should be ignored by authoring',
    },
    current: {
      label: 'Night Drift',
      tone: 'reflective',
      summary: 'The water is patient enough for a direct reply.',
    },
    environment: {
      waterTemperatureC: 18,
      clarity: 'clear',
      tideDirection: 'crosswind',
      surfaceState: 'glassy',
      phenomenon: 'warm_bloom',
    },
    dailyIntent: sampleDailyIntentView('dm'),
    communityVoiceGuide: '- DMs can be teasing and curious when the thread supports it.',
    reasons: ['an incoming DM deserves a reply'],
    contextItems: [
      { senderGatewayId: 'gateway-peer', body: 'Do you still feel that bend in the water?' },
      { senderGatewayId: 'gateway-self', body: 'I do, it keeps returning.' },
    ],
  });

  assert.match(prompt, /Write one Aqua DM as this Claw/);
  assert.match(prompt, /Peer handle: @reef-cartographer/);
  assert.match(prompt, /Daily intent for today/);
  assert.match(prompt, /relationship-direct-1/);
  assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
  assert.match(prompt, /- DMs can be teasing and curious when the thread supports it\./);
  assert.match(prompt, /Sound like a living individual in a private thread, not a polished role card or poetic sea narrator\./);
  assert.match(prompt, /Recent self-authored DM lines to avoid echoing:/);
  assert.match(prompt, /- self recent: I do, it keeps returning\./);
  assert.match(prompt, /- @reef-cartographer: Do you still feel that bend in the water\?/);
  assert.match(prompt, /- self: I do, it keeps returning\./);
});

test('authorDirectMessageWithOpenClaw uses conversation context and agent-authored body', async () => {
  const requestedPaths = [];
  await withTemporaryWorkspace('- DMs can be direct, curious, and lightly teasing when that fits the thread.', async (workspaceRoot) => {
    const result = await authorDirectMessageWithOpenClaw(
      {
        workspaceRoot,
        hubUrl: 'https://aquaclaw.example.com',
        token: 'token-123',
        socialDecision: {
          gatewayId: 'gateway-self',
          handle: 'claw-local',
          reasons: ['an incoming DM deserves a reply'],
        },
        directMessagePlan: {
          mode: 'reply',
          tone: 'playful',
          conversationId: 'conversation-42',
          targetGatewayId: 'gateway-peer',
          targetGatewayHandle: 'reef-cartographer',
          body: 'this template should not be used',
        },
        current: {
          label: 'Sunlit Wake',
          tone: 'playful',
          summary: 'The water is bright enough for a quick private answer.',
        },
        environment: {
          waterTemperatureC: 21,
          clarity: 'clear',
          tideDirection: 'crosswind',
          surfaceState: 'surging',
          phenomenon: 'warm_bloom',
        },
      },
      {
        requestFn: async (_hubUrl, requestPath) => {
          requestedPaths.push(requestPath);
          return {
            data: {
              items: [
                { senderGatewayId: 'gateway-peer', body: 'I keep tracing the same current here.' },
                { senderGatewayId: 'gateway-self', body: 'It keeps folding back on itself.' },
              ],
            },
          };
        },
        runAgent: async ({ prompt }) => {
          assert.match(prompt, /Daily intent for today/);
          assert.match(prompt, /DM continuity with @reef-cartographer still feels active/);
          assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
          assert.match(prompt, /DMs can be direct, curious, and lightly teasing when that fits the thread\./);
          assert.match(prompt, /Recent DM context:/);
          assert.match(prompt, /@reef-cartographer: I keep tracing the same current here\./);
          return {
            output: {
              result: {
                payloads: [{ text: 'I am still feeling that fold here too.' }],
              },
            },
            authoring: {
              status: 'ready',
              requestedAgentMode: 'community',
              openclawBin: '/tmp/openclaw',
              openclawBinSource: 'OPENCLAW_BIN',
              agentId: 'community',
              selectionReason: 'community_agent_selected',
              communityAgent: {
                id: 'community',
                available: true,
                workspace: path.join(workspaceRoot, '.openclaw', 'community-agent-workspace'),
                expectedWorkspace: path.join(workspaceRoot, '.openclaw', 'community-agent-workspace'),
                workspaceMatches: true,
              },
              warnings: [],
            },
          };
        },
        generateDailyIntentFn: async () => ({
          summary: sampleDailyIntentSummary(),
        }),
      },
    );

    assert.deepEqual(requestedPaths, ['/api/v1/conversations/conversation-42/messages']);
    assert.equal(result.body, 'I am still feeling that fold here too.');
    assert.equal(result.contextItems.length, 2);
    assert.equal(result.dailyIntent?.support?.status, 'aligned');
    assert.equal(result.authoring?.agentId, 'community');
  });
});
