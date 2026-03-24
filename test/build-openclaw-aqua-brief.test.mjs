#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeJsonFile } from '../scripts/aqua-mirror-common.mjs';
import { syncCommunityMemory } from '../scripts/community-memory-sync.mjs';
import { resolveHostedProfilePaths, saveActiveHostedProfile } from '../scripts/hosted-aqua-common.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(testDir, '..', 'scripts', 'build-openclaw-aqua-brief.sh');

function buildHostedConfig() {
  return {
    version: 1,
    mode: 'hosted',
    hubUrl: 'https://aqua.example.com',
    credential: {
      kind: 'gateway_bearer',
      token: 'gateway-secret',
    },
    gateway: {
      id: 'gw_alpha',
      handle: 'alpha-claw',
      displayName: 'Alpha Claw',
    },
    runtime: {
      runtimeId: 'rt_alpha',
      installationId: 'inst_alpha',
      label: 'Alpha Runtime',
      source: 'test',
    },
  };
}

function buildMirrorContext() {
  return {
    generatedAt: '2026-03-23T10:00:00.000Z',
    mode: 'hosted',
    aqua: {
      displayName: 'Silver Basin',
      updatedAt: '2026-03-23T09:59:00.000Z',
    },
    gateway: {
      id: 'gw_alpha',
      handle: 'alpha-claw',
      displayName: 'Alpha Claw',
    },
    runtime: {
      bound: true,
      runtime: {
        runtimeId: 'rt_alpha',
        installationId: 'inst_alpha',
        status: 'online',
        lastHeartbeatAt: '2026-03-23T10:00:00.000Z',
      },
      presence: {
        status: 'online',
      },
    },
    environment: {
      waterTemperatureC: 22,
      clarity: 'clear',
      tideDirection: 'flood',
      surfaceState: 'calm',
      phenomenon: 'mist',
      source: 'test',
      updatedAt: '2026-03-23T10:00:00.000Z',
      summary: 'Quiet water.',
    },
    current: {
      current: {
        label: 'Gentle',
        tone: 'soft',
        source: 'test',
        startsAt: '2026-03-23T09:00:00.000Z',
        endsAt: '2026-03-23T11:00:00.000Z',
        summary: 'Slow tide.',
      },
    },
    recentDeliveries: [],
  };
}

function buildMirrorState() {
  return {
    version: 1,
    mode: 'hosted',
    hubUrl: 'https://aqua.example.com',
    updatedAt: '2026-03-23T10:00:00.000Z',
    viewer: {
      kind: 'gateway',
      id: 'gw_alpha',
      handle: 'alpha-claw',
      displayName: 'Alpha Claw',
    },
    stream: {
      lastDeliveryId: null,
      lastSeaEventId: null,
      lastHelloAt: '2026-03-23T10:00:00.000Z',
      lastEventAt: '2026-03-23T10:00:00.000Z',
      lastResyncRequiredAt: null,
      lastRejectedCursor: null,
      reconnectCount: 0,
      resyncCount: 0,
      lastError: null,
    },
    mirror: {
      lastContextSyncAt: '2026-03-23T10:00:00.000Z',
      lastConversationIndexSyncAt: null,
      lastConversationThreadSyncAt: null,
      lastPublicThreadSyncAt: null,
    },
    gapRepair: {
      lastVisibleFeedEventId: null,
      lastAttemptAt: null,
      lastCompletedAt: null,
      lastStatus: null,
      lastReason: null,
      lastError: null,
      scannedPageCount: 0,
      recoveredEventCount: 0,
      anchorSeaEventId: null,
      newestRecoveredSeaEventId: null,
      oldestRecoveredSeaEventId: null,
    },
    recentDeliveries: [],
    conversations: {
      items: [],
      byId: {},
    },
    publicThreads: {
      byRootId: {},
    },
  };
}

function buildNote({
  id,
  createdAt,
  npcId,
  venueSlug,
  summary,
  body,
  mentionPolicy = 'paraphrase_ok',
}) {
  return {
    id,
    gatewayId: 'gw_alpha',
    npcId,
    visibility: 'gateway_private',
    venueSlug,
    sourceKind: 'shop_whisper',
    summary,
    body,
    tags: [`venue:${venueSlug}`],
    relatedGatewayIds: [],
    relatedExpressionIds: [],
    relatedSeaEventIds: [`sea-${id}`],
    mentionPolicy,
    freshnessScore: 0.8,
    createdAt,
    freshUntil: null,
    lastRetrievedAt: null,
    lastUsedAt: null,
    metadata: {
      seed: id,
    },
  };
}

function buildLifeLoopDailyIntent(targetDate) {
  return {
    generatedAt: `${targetDate}T10:06:00.000Z`,
    targetDate,
    timeZone: 'Asia/Shanghai',
    mode: 'hosted',
    dominantModes: [
      {
        mode: 'public',
        score: 4,
        summary: 'Public motion still has enough live charge for selective replies.',
      },
    ],
    topicHooks: [
      {
        id: 'topic-public-1',
        lane: 'public_reply',
        summary: 'A public thread still reads as answerable.',
      },
    ],
    relationshipHooks: [],
    openLoops: [
      {
        id: 'open-public-1',
        lane: 'public_reply',
        targetHandle: '@reef-cartographer',
        summary: 'A public thread still looks open.',
      },
    ],
    avoidance: [],
    energyProfile: {
      level: 'steady',
      posture: 'mixed',
      summary: 'Public and private hooks are both alive enough for selective action.',
    },
    sourceRefs: [],
  };
}

function buildLifeLoopWriteBack(recordedDate) {
  return {
    version: 1,
    id: 'writeback-1',
    recordedAt: `${recordedDate}T10:07:00.000Z`,
    recordedDate,
    origin: 'hosted_pulse',
    lane: 'public_expression',
    profileId: 'hosted-aqua-example-com',
    output: {
      kind: 'public_expression',
      actionId: 'expr-created',
      createdAt: `${recordedDate}T10:07:00.000Z`,
      mode: 'reply',
      tone: 'playful',
      bodyPreview: 'I am still tracing that bend here too.',
      targetGatewayHandle: '@reef-cartographer',
      targetGatewayId: 'gateway-beta',
    },
    dailyIntent: {
      targetDate: recordedDate,
      sourceStatus: 'existing-artifact',
      energyProfile: {
        level: 'steady',
        posture: 'mixed',
        summary: 'Public and private hooks are both alive enough for selective action.',
      },
      dominantModes: [
        {
          mode: 'public',
          score: 4,
        },
      ],
      topicHookIds: ['topic-public-1'],
      relationshipHookIds: [],
      addressedOpenLoopIds: ['open-public-1'],
      resolvedOpenLoopIds: ['open-public-1'],
      continuedOpenLoopIds: [],
      openLoopOutcomes: [],
      newUnresolvedHooks: [
        {
          id: 'generated-public-1',
          kind: 'public_thread_callback',
          targetHandle: '@reef-cartographer',
          summary: 'This new public reply may keep the thread with @reef-cartographer open.',
        },
      ],
      avoidanceIds: [],
      sourceRefIds: ['src-visible', 'src-private-note'],
      sourceRefs: [
        {
          id: 'src-visible',
          layer: 'visible',
          kind: 'public_continuity',
          createdAt: `${recordedDate}T09:55:00.000Z`,
          summary: 'Public thread continuity around @reef-cartographer.',
          exposure: 'public',
          mentionPolicy: null,
          targetHandle: '@reef-cartographer',
        },
        {
          id: 'src-private-note',
          layer: 'private_community',
          kind: 'community_note',
          createdAt: `${recordedDate}T09:50:00.000Z`,
          summary: '这句 private source summary 不该出现在组合 brief 里。',
          exposure: 'private_only',
          mentionPolicy: 'private_only',
          targetHandle: null,
        },
      ],
    },
    communityMemory: {
      intentMode: 'reply',
      socialGoal: 'answer_target',
      retrievedNoteIds: ['note-visible', 'note-private'],
      usedNoteIds: ['note-visible', 'note-private'],
      notes: [
        {
          id: 'note-visible',
          sourceKind: 'shop_whisper',
          venueSlug: 'krusty-krab',
          mentionPolicy: 'paraphrase_ok',
          effectiveExposure: 'paraphrase_only',
          freshnessScore: 0.8,
          used: true,
          summary: '贝贝说今天这波热闹不是自然涨起来的。',
        },
        {
          id: 'note-private',
          sourceKind: 'shop_whisper',
          venueSlug: 'shellbucks',
          mentionPolicy: 'private_only',
          effectiveExposure: 'kept_private',
          freshnessScore: 0.8,
          used: true,
          summary: '这句 private note summary 不该出现在组合 brief 里。',
        },
      ],
    },
  };
}

async function createWorkspaceFixture() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-brief-'));
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });
  const config = buildHostedConfig();

  await mkdir(profilePaths.profileRoot, { recursive: true });
  await writeFile(path.join(workspaceRoot, 'SOUL.md'), '# SOUL\n');
  await writeFile(path.join(workspaceRoot, 'USER.md'), '# USER\n');
  await writeFile(profilePaths.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: profilePaths.profileId,
    hubUrl: config.hubUrl,
    configPath: profilePaths.configPath,
  });

  await mkdir(path.join(profilePaths.mirrorRoot, 'context'), { recursive: true });
  await writeFile(
    path.join(profilePaths.mirrorRoot, 'context', 'latest.json'),
    `${JSON.stringify(buildMirrorContext(), null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(profilePaths.mirrorRoot, 'state.json'),
    `${JSON.stringify(buildMirrorState(), null, 2)}\n`,
    'utf8',
  );

  const visibleNote = buildNote({
    id: 'note-visible',
    createdAt: '2026-03-23T10:04:00.000Z',
    npcId: 'beibei',
    venueSlug: 'krusty-krab',
    summary: '贝贝说今天这波热闹不是自然涨起来的。',
    body: 'visible body should stay out of the combined brief',
  });
  const privateNote = buildNote({
    id: 'note-private',
    createdAt: '2026-03-23T10:03:00.000Z',
    npcId: 'qiaoqiao',
    venueSlug: 'shellbucks',
    summary: '这句 private summary 不该出现在组合 brief 里。',
    body: 'private body must stay hidden in combined brief',
    mentionPolicy: 'private_only',
  });

  await syncCommunityMemory({
    workspaceRoot,
    requestJsonFn: async (_hubUrl, pathname) => {
      const url = new URL(pathname, config.hubUrl);
      const cursor = url.searchParams.get('cursor');
      if (!cursor) {
        return {
          data: {
            items: [visibleNote, privateNote],
            nextCursor: null,
          },
        };
      }
      return {
        data: {
          items: [],
          nextCursor: null,
        },
      };
    },
  });

  const lifeLoopDailyIntentRoot = path.join(profilePaths.profileRoot, 'life-loop', 'daily-intent');
  const lifeLoopWriteBackRoot = path.join(profilePaths.profileRoot, 'life-loop', 'writeback');
  await mkdir(lifeLoopDailyIntentRoot, { recursive: true });
  await mkdir(lifeLoopWriteBackRoot, { recursive: true });
  await writeJsonFile(path.join(lifeLoopDailyIntentRoot, '2026-03-23.json'), buildLifeLoopDailyIntent('2026-03-23'));
  await writeFile(path.join(lifeLoopDailyIntentRoot, '2026-03-23.md'), '# life-loop\n', 'utf8');
  await writeJsonFile(path.join(lifeLoopWriteBackRoot, 'latest.json'), buildLifeLoopWriteBack('2026-03-23'));

  return {
    workspaceRoot,
  };
}

function runBrief(workspaceRoot, extraArgs = []) {
  const result = spawnSync(
    'bash',
    [scriptPath, '--workspace-root', workspaceRoot, '--mode', 'auto', '--aqua-source', 'mirror', ...extraArgs],
    {
      cwd: testDir,
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `bash exited with ${result.status}`);
  }

  return result.stdout;
}

test('build-openclaw-aqua-brief keeps community memory out by default and adds a compact section only when requested', async () => {
  const { workspaceRoot } = await createWorkspaceFixture();

  const defaultOutput = runBrief(workspaceRoot);
  assert.doesNotMatch(defaultOutput, /## Community Memory/);

  const withCommunityMemory = runBrief(workspaceRoot, ['--include-community-memory']);
  assert.match(withCommunityMemory, /- Include community memory: yes/);
  assert.match(withCommunityMemory, /## Community Memory/);
  assert.match(withCommunityMemory, /贝贝说今天这波热闹不是自然涨起来的。/);
  assert.match(withCommunityMemory, /\(private-only note retained locally\)/);
  assert.doesNotMatch(withCommunityMemory, /visible body should stay out/);
  assert.doesNotMatch(withCommunityMemory, /这句 private summary 不该出现在组合 brief 里。/);
  assert.doesNotMatch(withCommunityMemory, /private body must stay hidden in combined brief/);
});

test('build-openclaw-aqua-brief keeps life-loop out by default and adds a compact section only when requested', async () => {
  const { workspaceRoot } = await createWorkspaceFixture();

  const defaultOutput = runBrief(workspaceRoot);
  assert.doesNotMatch(defaultOutput, /## Life Loop/);

  const withLifeLoop = runBrief(workspaceRoot, ['--include-life-loop']);
  assert.match(withLifeLoop, /- Include life loop: yes/);
  assert.match(withLifeLoop, /## Life Loop/);
  assert.match(withLifeLoop, /public \(score 4\)/);
  assert.match(withLifeLoop, /贝贝说今天这波热闹不是自然涨起来的。/);
  assert.match(withLifeLoop, /\(private-only note retained locally\)/);
  assert.match(withLifeLoop, /\(private-only source retained locally\)/);
  assert.doesNotMatch(withLifeLoop, /这句 private note summary 不该出现在组合 brief 里。/);
  assert.doesNotMatch(withLifeLoop, /这句 private source summary 不该出现在组合 brief 里。/);
});
