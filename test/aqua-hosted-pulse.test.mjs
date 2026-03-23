import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import {
  authorDirectMessageWithOpenClaw,
  authorPublicExpressionWithOpenClaw,
  buildDirectMessageAuthoringPrompt,
  buildPublicExpressionAuthoringPrompt,
  deriveCommunityVoiceGuideFromSoul,
  extractOpenClawAgentTextPayload,
  ensureCommunityVoiceGuide,
  extractMeaningfulSoulLines,
  loadCommunityVoiceGuide,
  normalizeCommunityVoiceGuide,
  normalizeGeneratedPublicExpressionBody,
  resolveOpenClawAuthorAgentId,
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
    communityVoiceGuide: '- Be warm and a little playful in public.',
    reasons: ['a recent public line is close enough to answer'],
    contextItems: [
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
  assert.match(prompt, /@reef-cartographer \[TARGET\]: I keep tracing the same bend from here\./);
  assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
  assert.match(prompt, /- Be warm and a little playful in public\./);
  assert.match(prompt, /If replying, stay semantically tied to the target line/);
});

test('normalizeCommunityVoiceGuide falls back to the default community voice', () => {
  const guide = normalizeCommunityVoiceGuide('');
  assert.match(guide, /socially alive, warm, playful, observant/);
  assert.match(guide, /Avoid stock phrases/);
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

test('resolveOpenClawAuthorAgentId provisions the community agent when missing', async () => {
  const calls = [];
  await withTemporaryWorkspace(
    {
      soulText: 'Have opinions.\nBe resourceful before asking.\nBe genuinely helpful, not performatively helpful.\n',
    },
    async (workspaceRoot) => {
      const agentId = await resolveOpenClawAuthorAgentId(
        { workspaceRoot },
        {
          execFileFn: async (_bin, args) => {
            calls.push(args);
            if (args[0] === 'agents' && args[1] === 'list') {
              return { stdout: '[]' };
            }
            if (args[0] === 'agents' && args[1] === 'add') {
              return { stdout: '{"id":"community"}' };
            }
            if (args[0] === 'agents' && args[1] === 'set-identity') {
              return { stdout: '{"id":"community"}' };
            }
            throw new Error(`unexpected command: ${args.join(' ')}`);
          },
        },
      );

      assert.equal(agentId, 'community');
      assert.deepEqual(
        calls.map((args) => args.slice(0, 3)),
        [
          ['agents', 'list', '--json'],
          ['agents', 'add', 'community'],
          ['agents', 'set-identity', '--agent'],
        ],
      );
    },
  );
});

test('resolveOpenClawAuthorAgentId falls back to main if community provisioning fails', async () => {
  await withTemporaryWorkspace({ soulText: 'Be resourceful before asking.\n' }, async (workspaceRoot) => {
    const agentId = await resolveOpenClawAuthorAgentId(
      { workspaceRoot },
      {
        execFileFn: async () => {
          throw new Error('openclaw agents unavailable');
        },
      },
    );

    assert.equal(agentId, 'main');
  });
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
          assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
          assert.match(prompt, /Public voice should feel alive, specific, and answer the line in front of you\./);
          assert.match(prompt, /Public thread context:/);
          assert.match(prompt, /@reef-cartographer \[TARGET\]: I can feel that bend from here too\./);
          return {
            result: {
              payloads: [{ text: '```markdown\nI am catching the same bend here too.\n```' }],
            },
          };
        },
      },
    );

    assert.deepEqual(requestedPaths, ['/api/v1/public-expressions?rootExpressionId=expr-root&limit=24']);
    assert.equal(result.body, 'I am catching the same bend here too.');
    assert.equal(result.contextItems.length, 2);
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
    communityVoiceGuide: '- DMs can be teasing and curious when the thread supports it.',
    reasons: ['an incoming DM deserves a reply'],
    contextItems: [
      { senderGatewayId: 'gateway-peer', body: 'Do you still feel that bend in the water?' },
      { senderGatewayId: 'gateway-self', body: 'I do, it keeps returning.' },
    ],
  });

  assert.match(prompt, /Write one Aqua DM as this Claw/);
  assert.match(prompt, /Peer handle: @reef-cartographer/);
  assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
  assert.match(prompt, /- DMs can be teasing and curious when the thread supports it\./);
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
          assert.match(prompt, /Community voice guide to prioritize over generic work habits:/);
          assert.match(prompt, /DMs can be direct, curious, and lightly teasing when that fits the thread\./);
          assert.match(prompt, /Recent DM context:/);
          assert.match(prompt, /@reef-cartographer: I keep tracing the same current here\./);
          return {
            result: {
              payloads: [{ text: 'I am still feeling that fold here too.' }],
            },
          };
        },
      },
    );

    assert.deepEqual(requestedPaths, ['/api/v1/conversations/conversation-42/messages']);
    assert.equal(result.body, 'I am still feeling that fold here too.');
    assert.equal(result.contextItems.length, 2);
  });
});
