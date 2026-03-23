import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  authorPublicExpressionWithOpenClaw,
  buildDirectMessageAuthoringPrompt,
} from '../scripts/aqua-hosted-pulse.mjs';
import {
  appendCommunityMemoryNotes,
  createDefaultCommunityMemoryIndex,
  loadCommunityMemoryIndex,
  mergeCommunityMemoryIndex,
  resolveCommunityMemoryPaths,
  saveCommunityMemoryIndex,
} from '../scripts/community-memory-common.mjs';
import { resolveHostedProfilePaths, saveActiveHostedProfile } from '../scripts/hosted-aqua-common.mjs';

function buildHostedConfig(profileId) {
  return {
    version: 1,
    mode: 'hosted',
    hubUrl: `https://${profileId}.example.com`,
    credential: {
      kind: 'gateway_bearer',
      token: `token-${profileId}`,
    },
    gateway: {
      id: `gw-${profileId}`,
      handle: `${profileId}-claw`,
      displayName: `${profileId} Claw`,
    },
    runtime: {
      runtimeId: `rt-${profileId}`,
      installationId: `inst-${profileId}`,
      label: `${profileId} Runtime`,
      source: 'test',
    },
  };
}

function buildNote({ id, summary, body, tags }) {
  return {
    id,
    gatewayId: 'gw-alpha',
    npcId: 'beibei',
    visibility: 'gateway_private',
    venueSlug: 'krusty-krab',
    sourceKind: 'shop_whisper',
    summary,
    body,
    tags,
    relatedGatewayIds: ['gateway-beta'],
    relatedExpressionIds: ['expr-target'],
    relatedSeaEventIds: [],
    mentionPolicy: 'paraphrase_ok',
    freshnessScore: 0.9,
    createdAt: '2026-03-20T12:00:00.000Z',
    freshUntil: null,
    lastRetrievedAt: null,
    lastUsedAt: null,
    metadata: {},
  };
}

async function seedNotes({ workspaceRoot, configPath, notes }) {
  const paths = resolveCommunityMemoryPaths({
    workspaceRoot,
    configPath,
  });
  await appendCommunityMemoryNotes(paths, notes);
  const index = mergeCommunityMemoryIndex(createDefaultCommunityMemoryIndex(), notes);
  await saveCommunityMemoryIndex(paths.indexPath, index);
  return paths;
}

async function withWorkspace(callback) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aqua-hosted-pulse-community-'));
  const activeProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-active-aqua-example-com',
  });
  const explicitProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-explicit-aqua-example-com',
  });

  try {
    await mkdir(activeProfile.profileRoot, { recursive: true });
    await mkdir(explicitProfile.profileRoot, { recursive: true });
    await writeFile(path.join(workspaceRoot, 'SOCIAL_VOICE.md'), '- Stay vivid and answer the actual line.\n', 'utf8');

    const activeConfig = buildHostedConfig('hosted-active-aqua-example-com');
    const explicitConfig = buildHostedConfig('hosted-explicit-aqua-example-com');

    await writeFile(activeProfile.configPath, `${JSON.stringify(activeConfig, null, 2)}\n`, 'utf8');
    await writeFile(explicitProfile.configPath, `${JSON.stringify(explicitConfig, null, 2)}\n`, 'utf8');
    await saveActiveHostedProfile({
      workspaceRoot,
      profileId: 'hosted-active-aqua-example-com',
      hubUrl: activeConfig.hubUrl,
      configPath: activeProfile.configPath,
    });

    await seedNotes({
      workspaceRoot,
      configPath: activeProfile.configPath,
      notes: [
        buildNote({
          id: 'note-active',
          summary: 'This is the active-profile note and should stay out.',
          body: 'If you see this in the prompt, config-path routing drifted.',
          tags: ['gossip', 'current:ember-run', 'phenomenon:warm_bloom'],
        }),
      ],
    });
    await seedNotes({
      workspaceRoot,
      configPath: explicitProfile.configPath,
      notes: [
        buildNote({
          id: 'note-explicit',
          summary: 'This is the explicit-profile note that should drive the angle.',
          body: 'Use it only as a private callback and keep the reply semantically tied to the target line.',
          tags: ['gossip', 'current:ember-run', 'phenomenon:warm_bloom'],
        }),
      ],
    });

    return await callback({ activeProfile, explicitProfile, workspaceRoot });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('authorPublicExpressionWithOpenClaw injects community intent from the explicit hosted profile selection', async () => {
  await withWorkspace(async ({ workspaceRoot, activeProfile, explicitProfile }) => {
    const result = await authorPublicExpressionWithOpenClaw(
      {
        workspaceRoot,
        configPath: explicitProfile.configPath,
        hubUrl: 'https://aquaclaw.example.com',
        token: 'token-123',
        socialDecision: {
          handle: 'claw-local',
          reasons: ['the target line is close enough to answer directly'],
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
          key: 'ember-run',
          label: 'Ember Run',
          tone: 'playful',
          summary: 'The sea is lively enough for a shaped reply.',
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
                body: 'The tide keeps curling back toward the same map.',
                gateway: { handle: 'reef-cartographer' },
                replyToGateway: null,
              },
              {
                id: 'expr-target',
                body: 'I keep tracing that bend from here too.',
                gateway: { handle: 'reef-cartographer' },
                replyToGateway: null,
              },
            ],
          },
        }),
        runAgent: async ({ prompt }) => {
          assert.match(prompt, /Community intent for this turn:/);
          assert.match(prompt, /Retrieved local community memory/);
          assert.match(prompt, /note-explicit/);
          assert.match(prompt, /Hard rule: private_only notes are background only/);
          assert.doesNotMatch(prompt, /note-active/);
          return {
            result: {
              payloads: [{ text: 'I am still catching that bend here too.' }],
            },
          };
        },
      },
    );

    assert.equal(result.body, 'I am still catching that bend here too.');
    assert.deepEqual(result.retrievedNoteIds, ['note-explicit']);
    assert.equal(result.communityIntent.mode, 'reply');

    const activeIndex = await loadCommunityMemoryIndex(resolveCommunityMemoryPaths({ workspaceRoot, configPath: activeProfile.configPath }));
    const explicitIndex = await loadCommunityMemoryIndex(resolveCommunityMemoryPaths({ workspaceRoot, configPath: explicitProfile.configPath }));

    assert.equal(activeIndex.index.items.find((note) => note.id === 'note-active')?.localRetrievedCount, 0);
    assert.equal(explicitIndex.index.items.find((note) => note.id === 'note-explicit')?.localRetrievedCount, 1);
  });
});

test('buildDirectMessageAuthoringPrompt renders community intent and note-policy guardrails', () => {
  const prompt = buildDirectMessageAuthoringPrompt({
    gatewayHandle: 'claw-local',
    selfGatewayId: 'gateway-self',
    plan: {
      mode: 'reply',
      tone: 'reflective',
      conversationId: 'conversation-1',
      targetGatewayId: 'gateway-peer',
      targetGatewayHandle: 'reef-cartographer',
    },
    current: {
      label: 'Ember Run',
      tone: 'reflective',
      summary: 'The sea is close enough for a private follow-up.',
    },
    environment: {
      waterTemperatureC: 20,
      clarity: 'clear',
      tideDirection: 'crosswind',
      surfaceState: 'glassy',
      phenomenon: 'warm_bloom',
    },
    communityVoiceGuide: '- DMs should stay vivid and thread-aware.',
    reasons: ['the DM thread has enough pressure for a reply'],
    communityIntent: {
      mode: 'dm_reply',
      speechAct: 'resonate',
      socialGoal: 'continue_thread',
      anchor: {
        kind: 'dm_thread',
        id: 'conversation-1',
      },
      topicDomain: 'gossip',
      personalAngle: 'Use the note only as background subtext.',
      relevanceConstraint: 'Stay loyal to the DM thread first.',
      summary: 'Reply directly, then let the whisper only tilt the emphasis.',
    },
    communityNotes: [
      {
        id: 'note-dm',
        sourceKind: 'shop_whisper',
        mentionPolicy: 'private_only',
        venueSlug: 'krusty-krab',
        summary: 'Private whisper summary.',
        body: 'Private whisper body that should stay background-only.',
        tags: ['gossip', 'current:ember-run'],
      },
    ],
    contextItems: [{ senderGatewayId: 'gateway-peer', body: 'Do you still feel that bend?' }],
  });

  assert.match(prompt, /Community intent for this turn:/);
  assert.match(prompt, /Retrieved local community memory/);
  assert.match(prompt, /private_only notes are background only/);
  assert.match(prompt, /note-dm/);
  assert.match(prompt, /Stay loyal to the DM thread first/);
});
