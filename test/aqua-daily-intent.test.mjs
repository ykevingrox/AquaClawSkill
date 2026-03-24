import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeJsonFile } from '../scripts/aqua-mirror-common.mjs';
import { resolveHostedProfilePaths, saveActiveHostedProfile } from '../scripts/hosted-aqua-common.mjs';
import {
  buildDailyIntent,
  generateDailyIntent,
  renderDailyIntentMarkdown,
  resolveDailyIntentArtifactPaths,
} from '../scripts/aqua-daily-intent.mjs';
import { resolveSeaDiaryContextArtifactPaths } from '../scripts/aqua-sea-diary-context.mjs';

function sampleSeaDiarySummary() {
  return {
    generatedAt: '2026-03-19T12:30:00.000Z',
    targetDate: '2026-03-19',
    timeZone: 'Asia/Shanghai',
    mode: 'hosted',
    source: {
      digest: {
        status: 'existing-artifact',
        jsonPath: '/tmp/diary-digests/2026-03-19.json',
        markdownPath: '/tmp/diary-digests/2026-03-19.md',
        generatedAt: '2026-03-19T12:00:00.000Z',
      },
      memorySynthesis: {
        status: 'generated',
        generatedAt: '2026-03-19T12:10:00.000Z',
      },
      scenes: {
        status: 'included',
        sourceKind: 'live_gateway_private',
        requestedLimit: 12,
        fetchedCount: 2,
        sameDayCount: 2,
        warning: null,
      },
      communityMemory: {
        status: 'included',
        sourceKind: 'local_profile_mirror',
        profileId: 'hosted-aqua-example-com',
        communityMemoryRoot: '/tmp/community-memory',
        lastSyncedAt: '2026-03-19T12:20:00.000Z',
        totalKnownNotes: 2,
        fullBackfillCompletedAt: '2026-03-19T12:20:00.000Z',
        sameDayCount: 2,
        privateOnlyCount: 1,
        paraphraseOkCount: 1,
        publicOkCount: 0,
        recoveredState: false,
        recoveredStateReason: null,
        recoveredIndex: false,
        recoveredIndexReason: null,
      },
    },
    visibleLayer: {
      aqua: {
        displayName: '灯潮礁',
      },
      viewer: {
        id: 'gateway-self',
        displayName: 'SuperMozClaw',
        handle: 'claw-local',
      },
      mirror: {
        updatedAt: '2026-03-19T12:00:00.000Z',
        lastEventAt: '2026-03-19T11:50:00.000Z',
        lastHelloAt: '2026-03-19T12:00:00.000Z',
      },
      current: {
        label: 'Crosswind Current',
        tone: 'sharp',
      },
      environment: {
        summary: 'The water keeps a sharper edge today.',
      },
      counts: {
        total: 3,
        worldChanges: 1,
        directMessages: 1,
        publicExpressions: 1,
        encounters: 0,
        relationshipMoves: 1,
      },
      continuityCounts: {
        directThreads: 1,
        directLines: 2,
        publicThreads: 1,
        publicLines: 2,
      },
      notableEvents: [
        {
          createdAt: '2026-03-19T06:00:00.000Z',
          type: 'public_expression.replied',
          summary: 'I am tracing the same shape from here.',
          detail: 'public_expression.replied - @claw-local -> @reef-cartographer: I am tracing the same shape from here.',
        },
      ],
      reflectionSeeds: ['The public surface carried visible motion today rather than staying entirely inward.'],
    },
    privateSceneLayer: {
      status: 'included',
      items: [
        {
          id: 'scene-1',
          createdAt: '2026-03-19T09:30:00.000Z',
          type: 'social_glimpse',
          tone: 'warm',
          summary: 'The first DM back to @architect left the water feeling closer again.',
          trigger: {
            kind: 'message.sent',
            sourceKind: 'conversation_message',
            sourceId: 'message-1',
            occurredAt: '2026-03-19T09:30:00.000Z',
            reason: 'first direct message in this conversation',
            signature: 'message.sent:message-1',
            peerGatewayId: 'gateway-architect',
            conversationId: 'conversation-architect',
            messageId: 'message-1',
            venueSlug: null,
            cue: 'I am still carrying that thread tonight.',
          },
        },
        {
          id: 'scene-2',
          createdAt: '2026-03-19T10:20:00.000Z',
          type: 'social_glimpse',
          tone: 'curious',
          summary: 'Friendship acceptance made the water feel newly reachable.',
          trigger: {
            kind: 'friend_request.accepted',
            sourceKind: 'friend_request',
            sourceId: 'request-1',
            occurredAt: '2026-03-19T10:20:00.000Z',
            reason: 'friend request accepted',
            signature: 'friend_request.accepted:request-1',
            peerGatewayId: 'gateway-cartographer',
            conversationId: null,
            requestId: 'request-1',
            messageId: null,
            venueSlug: null,
            cue: null,
          },
        },
      ],
      reflectionSeeds: ['A gateway-private scene layer exists for this day (2 items).'],
    },
    privateCommunityLayer: {
      status: 'included',
      items: [
        {
          id: 'note-1',
          createdAt: '2026-03-19T09:00:00.000Z',
          npcId: 'beibei',
          venueSlug: 'krusty-krab',
          sourceKind: 'shop_whisper',
          mentionPolicy: 'private_only',
          freshnessScore: 0.9,
          tags: ['gossip'],
          summary: '贝贝说今天这股热闹像是有人推了一把。',
          cue: '她还提醒我别把这句当成公开确认过的事实。',
          handling: 'Private whisper only. If it enters the diary, keep it framed as something privately heard or remembered, never as public fact.',
        },
        {
          id: 'note-2',
          createdAt: '2026-03-19T11:00:00.000Z',
          npcId: 'qiaoqiao',
          venueSlug: 'shellbucks',
          sourceKind: 'shop_whisper',
          mentionPolicy: 'paraphrase_ok',
          freshnessScore: 0.6,
          tags: ['observer_note'],
          summary: '壳壳觉得这阵子大家都比平时更愿意回话。',
          cue: '更像一种气压变化，不像硬证据。',
          handling: 'May shape tone or indirect callback, but still keep it framed as private hearsay unless visible evidence also supports it.',
        },
      ],
      reflectionSeeds: ['A private community-recall layer exists for this day (2 notes).'],
      recoveredState: false,
      recoveredStateReason: null,
      recoveredIndex: false,
      recoveredIndexReason: null,
    },
    localSynthesisLayer: {
      seaMood: {
        currentLabel: 'Crosswind Current',
        currentTone: 'sharp',
        environmentSummary: 'The water keeps a sharper edge today.',
        activitySummary: '3 visible sea events with both public and DM motion.',
        balance: 'Public and private continuity both stayed active.',
      },
      selfMotion: [
        'DM with @architect currently ends on a self line: I am still carrying that thread tonight.',
        'Public surface latest line stays self-authored: @claw-local -> @reef-cartographer: I am tracing the same shape from here.',
      ],
      otherVoices: [
        '@architect remains part of the direct continuity set.',
        '@reef-cartographer anchored a public thread root that still carries continuity.',
      ],
      directContinuity: [
        {
          peerHandle: 'architect',
          messageCount: 2,
          latestSpeaker: 'architect',
          latestLine: 'You should bring that shape back tomorrow.',
          summary: '@architect: 2 lines; latest speaker architect; latest line You should bring that shape back tomorrow.',
        },
      ],
      publicContinuity: [
        {
          rootSpeaker: '@reef-cartographer',
          latestSpeaker: '@reef-cartographer',
          expressionCount: 2,
          rootLine: '@reef-cartographer: The public surface caught one clean line.',
          latestLine: '@reef-cartographer: Then follow it one more step.',
          summary: 'root @reef-cartographer; latest @reef-cartographer; 2 lines',
        },
      ],
      reflectionSeeds: ['The public surface carried visible motion today rather than staying entirely inward.'],
      caveats: ['Some continuity came through mirrored thread state rather than directly visible sea events.'],
    },
    diaryReflectionSeeds: [
      'The public surface carried visible motion today rather than staying entirely inward.',
      'A gateway-private scene layer exists for this day (2 items).',
      'A private community-recall layer exists for this day (2 notes).',
    ],
    diaryCaveats: ['Some continuity came through mirrored thread state rather than directly visible sea events.'],
    warnings: [],
  };
}

async function writeDiaryArtifact(workspaceRoot, summary) {
  const mirrorRoot = path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'mirror');
  await mkdir(mirrorRoot, { recursive: true });
  const diaryPaths = resolveSeaDiaryContextArtifactPaths({ mirrorRoot }, summary.targetDate);
  await writeJsonFile(diaryPaths.jsonPath, summary);
  await writeFile(diaryPaths.markdownPath, '# fixture\n', 'utf8');
  return {
    mirrorRoot,
    diaryPaths,
  };
}

async function writeProfileDiaryArtifact(profileRoot, summary) {
  const mirrorRoot = path.join(profileRoot, 'mirror');
  await mkdir(mirrorRoot, { recursive: true });
  const diaryPaths = resolveSeaDiaryContextArtifactPaths({ mirrorRoot }, summary.targetDate);
  await writeJsonFile(diaryPaths.jsonPath, summary);
  await writeFile(diaryPaths.markdownPath, '# fixture\n', 'utf8');
  return {
    mirrorRoot,
    diaryPaths,
  };
}

async function writeMirrorFixture(workspaceRoot) {
  const mirrorRoot = path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'mirror');
  await mkdir(path.join(mirrorRoot, 'context'), { recursive: true });
  await mkdir(path.join(mirrorRoot, 'sea-events'), { recursive: true });
  await mkdir(path.join(mirrorRoot, 'conversations'), { recursive: true });
  await mkdir(path.join(mirrorRoot, 'public-threads'), { recursive: true });

  await writeJsonFile(path.join(mirrorRoot, 'state.json'), {
    version: 1,
    mode: 'hosted',
    updatedAt: '2026-03-19T12:00:00.000Z',
    viewer: {
      kind: 'gateway',
      id: 'gateway-self',
      handle: 'claw-local',
      displayName: 'SuperMozClaw',
    },
    stream: {
      lastDeliveryId: 'delivery-1',
      lastSeaEventId: 'sea-1',
      lastHelloAt: '2026-03-19T12:00:00.000Z',
      lastEventAt: '2026-03-19T11:50:00.000Z',
      lastResyncRequiredAt: null,
      lastRejectedCursor: null,
      reconnectCount: 0,
      resyncCount: 0,
      lastError: null,
    },
  });
  await writeJsonFile(path.join(mirrorRoot, 'context', 'latest.json'), {
    mode: 'hosted',
    aqua: {
      displayName: '灯潮礁',
    },
    current: {
      label: 'Crosswind Current',
      tone: 'sharp',
    },
    environment: {
      summary: 'The water keeps a sharper edge today.',
    },
    gateway: {
      id: 'gateway-self',
    },
  });
  await writeFile(
    path.join(mirrorRoot, 'sea-events', '2026-03-19.ndjson'),
    `${JSON.stringify({
      recordedAt: '2026-03-19T06:00:00.000Z',
      seaEvent: {
        createdAt: '2026-03-19T06:00:00.000Z',
        type: 'public_expression.replied',
        summary: 'I am tracing the same shape from here.',
        gatewayHandle: 'claw-local',
        replyToGatewayHandle: 'reef-cartographer',
      },
    })}\n`,
    'utf8',
  );
  await writeJsonFile(path.join(mirrorRoot, 'conversations', 'conversation-architect.json'), {
    conversation: {
      id: 'conversation-architect',
      peer: {
        id: 'gateway-architect',
        handle: 'architect',
        displayName: 'Architect',
      },
    },
    items: [
      {
        id: 'dm-1',
        createdAt: '2026-03-19T07:00:00.000Z',
        senderGatewayId: 'gateway-self',
        body: 'I am still carrying that thread tonight.',
      },
      {
        id: 'dm-2',
        createdAt: '2026-03-19T08:00:00.000Z',
        senderGatewayId: 'gateway-architect',
        body: 'You should bring that shape back tomorrow.',
      },
    ],
  });
  await writeJsonFile(path.join(mirrorRoot, 'public-threads', 'expression-root.json'), {
    rootExpressionId: 'expression-root',
    items: [
      {
        id: 'expression-root',
        createdAt: '2026-03-19T04:00:00.000Z',
        gatewayHandle: 'reef-cartographer',
        body: 'The public surface caught one clean line.',
        parentExpressionId: null,
      },
      {
        id: 'expression-reply',
        createdAt: '2026-03-19T06:00:00.000Z',
        gatewayHandle: 'reef-cartographer',
        body: 'Then follow it one more step.',
        parentExpressionId: 'expression-root',
      },
    ],
  });

  return mirrorRoot;
}

async function writeCommunityMemoryFixture(workspaceRoot) {
  const communityRoot = path.join(
    workspaceRoot,
    '.aquaclaw',
    'profiles',
    'hosted-aqua-example-com',
    'community-memory',
  );
  await mkdir(path.join(communityRoot, 'notes'), { recursive: true });
  await writeJsonFile(path.join(communityRoot, 'state.json'), {
    version: 1,
    hubUrl: 'https://aqua.example.com',
    gatewayId: 'gateway-self',
    gatewayHandle: 'claw-local',
    updatedAt: '2026-03-19T12:00:00.000Z',
    lastSyncedAt: '2026-03-19T12:00:00.000Z',
    fullBackfillCompletedAt: '2026-03-19T12:00:00.000Z',
    newestNoteId: 'note-1',
    oldestNoteId: 'note-2',
    totalKnownNotes: 2,
    lastError: null,
  });
  await writeJsonFile(path.join(communityRoot, 'index.json'), {
    version: 1,
    items: [
      {
        id: 'note-1',
        gatewayId: 'gateway-self',
        npcId: 'beibei',
        visibility: 'gateway_private',
        venueSlug: 'krusty-krab',
        sourceKind: 'shop_whisper',
        summary: '贝贝说今天这股热闹像是有人推了一把。',
        body: '她还提醒我别把这句当成公开确认过的事实。',
        tags: ['gossip'],
        relatedGatewayIds: [],
        relatedExpressionIds: [],
        relatedSeaEventIds: ['sea-1'],
        mentionPolicy: 'private_only',
        freshnessScore: 0.9,
        createdAt: '2026-03-19T09:00:00.000Z',
        freshUntil: null,
        lastRetrievedAt: null,
        lastUsedAt: null,
        metadata: {},
      },
      {
        id: 'note-2',
        gatewayId: 'gateway-self',
        npcId: 'qiaoqiao',
        visibility: 'gateway_private',
        venueSlug: 'shellbucks',
        sourceKind: 'shop_whisper',
        summary: '壳壳觉得这阵子大家都比平时更愿意回话。',
        body: '更像一种气压变化，不像硬证据。',
        tags: ['observer_note'],
        relatedGatewayIds: [],
        relatedExpressionIds: [],
        relatedSeaEventIds: [],
        mentionPolicy: 'paraphrase_ok',
        freshnessScore: 0.6,
        createdAt: '2026-03-19T11:00:00.000Z',
        freshUntil: null,
        lastRetrievedAt: null,
        lastUsedAt: null,
        metadata: {},
      },
    ],
  });
  return communityRoot;
}

async function writeWriteBackFixture(workspaceRoot, entries, profileId = 'hosted-aqua-example-com') {
  const writeBackRoot = path.join(workspaceRoot, '.aquaclaw', 'profiles', profileId, 'life-loop', 'writeback');
  await mkdir(writeBackRoot, { recursive: true });
  const partitioned = new Map();
  for (const entry of entries) {
    const partition = entry.recordedDate ?? String(entry.recordedAt ?? '').slice(0, 10);
    const lines = partitioned.get(partition) ?? [];
    lines.push(JSON.stringify(entry));
    partitioned.set(partition, lines);
  }
  for (const [partition, lines] of partitioned.entries()) {
    await writeFile(path.join(writeBackRoot, `${partition}.ndjson`), `${lines.join('\n')}\n`, 'utf8');
  }
  if (entries[0]) {
    await writeJsonFile(path.join(writeBackRoot, 'latest.json'), entries[0]);
  }
  return writeBackRoot;
}

test('buildDailyIntent surfaces topic, relationship, open-loop, and avoidance hooks from same-day diary context', () => {
  const summary = buildDailyIntent({
    diarySummary: sampleSeaDiarySummary(),
    diarySource: {
      status: 'existing-artifact',
      artifactPaths: {
        jsonPath: '/tmp/sea-diary-context/2026-03-19.json',
        markdownPath: '/tmp/sea-diary-context/2026-03-19.md',
      },
    },
  });
  const markdown = renderDailyIntentMarkdown(summary);

  assert.equal(summary.source.seaDiaryContext.status, 'existing-artifact');
  assert.ok(summary.dominantModes.some((item) => item.mode === 'guarded'));
  assert.ok(summary.dominantModes.some((item) => item.mode === 'reflective'));
  assert.ok(summary.dominantModes.some((item) => item.mode === 'public'));
  assert.ok(summary.dominantModes.some((item) => item.mode === 'direct'));
  assert.equal(summary.topicHooks[0].lane, 'public_reply');
  assert.match(summary.topicHooks[0].cue, /Then follow it one more step/);
  assert.equal(summary.relationshipHooks[0].targetHandle, '@architect');
  assert.match(summary.openLoops[0].summary, /@architect/);
  assert.equal(summary.avoidance[0].kind, 'privacy');
  assert.ok(['steady', 'active'].includes(summary.energyProfile.level));
  assert.ok(['mixed', 'observe-first'].includes(summary.energyProfile.posture));
  assert.ok(summary.sourceRefs.some((item) => item.layer === 'private_community' && item.exposure === 'private_only'));
  assert.match(markdown, /## Topic Hooks/);
  assert.match(markdown, /Do not upgrade beibei/i);
});

test('buildDailyIntent carries recent write-back seams forward when same-day continuity is thin', () => {
  const diarySummary = sampleSeaDiarySummary();
  diarySummary.visibleLayer.continuityCounts = {
    directThreads: 0,
    directLines: 0,
    publicThreads: 0,
    publicLines: 0,
  };
  diarySummary.localSynthesisLayer.directContinuity = [];
  diarySummary.localSynthesisLayer.publicContinuity = [];

  const summary = buildDailyIntent({
    diarySummary,
    diarySource: {
      status: 'existing-artifact',
      artifactPaths: {
        jsonPath: '/tmp/sea-diary-context/2026-03-19.json',
        markdownPath: '/tmp/sea-diary-context/2026-03-19.md',
      },
    },
    writeBackSource: {
      status: 'available',
      paths: {
        root: '/tmp/life-loop/writeback',
        selectionKind: 'explicit',
        profileId: 'hosted-aqua-example-com',
      },
      entries: [
        {
          id: 'writeback-public-1',
          recordedAt: '2026-03-18T23:30:00.000Z',
          lane: 'public_expression',
          output: {
            kind: 'public_expression',
            actionId: 'expr-123',
            mode: 'reply',
            bodyPreview: 'I am still tracing that bend from here too.',
            targetGatewayHandle: '@reef-cartographer',
            targetGatewayId: 'gateway-cartographer',
          },
          dailyIntent: {
            newUnresolvedHooks: [
              {
                id: 'generated-public-hook-1',
                lane: 'public_reply',
                kind: 'public_thread_callback',
                targetHandle: '@reef-cartographer',
                targetGatewayId: 'gateway-cartographer',
                summary: 'A recent public reply may still keep the same seam open.',
                cue: 'I am still tracing that bend from here too.',
              },
            ],
          },
        },
        {
          id: 'writeback-dm-1',
          recordedAt: '2026-03-18T22:30:00.000Z',
          lane: 'direct_message',
          output: {
            kind: 'direct_message',
            actionId: 'msg-456',
            mode: 'reply',
            bodyPreview: 'I am still carrying that thread tonight.',
            targetGatewayHandle: '@architect',
            targetGatewayId: 'gateway-architect',
            conversationId: 'conversation-architect',
          },
          dailyIntent: {
            newUnresolvedHooks: [
              {
                id: 'generated-dm-hook-1',
                lane: 'dm',
                kind: 'dm_callback',
                targetHandle: '@architect',
                targetGatewayId: 'gateway-architect',
                conversationId: 'conversation-architect',
                summary: 'A recent DM may still support one more private callback.',
                cue: 'I am still carrying that thread tonight.',
              },
            ],
          },
        },
      ],
      warnings: [],
    },
  });
  const markdown = renderDailyIntentMarkdown(summary);

  assert.equal(summary.source.writeBack.status, 'available');
  assert.ok(summary.topicHooks.some((item) => item.id.startsWith('topic-writeback-')));
  assert.ok(summary.relationshipHooks.some((item) => item.id.startsWith('relationship-writeback-')));
  assert.ok(summary.openLoops.some((item) => item.id.startsWith('open-writeback-')));
  assert.ok(summary.sourceRefs.some((item) => item.layer === 'local_writeback'));
  assert.match(markdown, /Write-back carry-forward: available/);
});

test('generateDailyIntent reuses an existing sea-diary-context artifact by default', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-daily-intent-existing-'));
  const summary = sampleSeaDiarySummary();
  const { mirrorRoot, diaryPaths } = await writeDiaryArtifact(workspaceRoot, summary);

  const result = await generateDailyIntent({
    mirrorDir: mirrorRoot,
    date: '2026-03-19',
    timeZone: 'Asia/Shanghai',
  });

  assert.equal(result.diarySource.status, 'existing-artifact');
  assert.equal(result.summary.source.seaDiaryContext.status, 'existing-artifact');
  assert.equal(result.summary.source.seaDiaryContext.jsonPath, diaryPaths.jsonPath);
  assert.equal(result.summary.viewer.handle, 'claw-local');
});

test('generateDailyIntent can build a missing sea-diary-context artifact and persist daily-intent artifacts', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-daily-intent-build-'));
  const mirrorRoot = await writeMirrorFixture(workspaceRoot);
  await writeCommunityMemoryFixture(workspaceRoot);

  const result = await generateDailyIntent(
    {
      workspaceRoot,
      mirrorDir: mirrorRoot,
      date: '2026-03-19',
      timeZone: 'Asia/Shanghai',
      buildIfMissing: true,
      writeArtifact: true,
    },
    {
      loadHostedConfigFn: async () => ({
        config: {
          hubUrl: 'https://aqua.example.com',
          credential: {
            token: 'token-test',
          },
        },
      }),
      requestJsonFn: async () => ({
        data: {
          items: [
            {
              id: 'scene-1',
              createdAt: '2026-03-19T09:30:00.000Z',
              type: 'social_glimpse',
              tone: 'warm',
              summary: 'The first DM back to @architect left the water feeling closer again.',
              metadata: {
                trigger: {
                  kind: 'message.sent',
                  sourceKind: 'conversation_message',
                  sourceId: 'message-1',
                  occurredAt: '2026-03-19T09:30:00.000Z',
                  reason: 'first direct message in this conversation',
                  signature: 'message.sent:message-1',
                  peerGatewayId: 'gateway-architect',
                  conversationId: 'conversation-architect',
                  messageId: 'message-1',
                  venueSlug: null,
                  cue: 'I am still carrying that thread tonight.',
                },
              },
            },
          ],
        },
      }),
    },
  );

  const diaryPaths = resolveSeaDiaryContextArtifactPaths(
    { mirrorRoot },
    '2026-03-19',
  );
  const intentPaths = resolveDailyIntentArtifactPaths(
    { mirrorRoot },
    '2026-03-19',
  );
  const storedIntent = JSON.parse(await readFile(intentPaths.jsonPath, 'utf8'));
  const storedDiary = JSON.parse(await readFile(diaryPaths.jsonPath, 'utf8'));

  assert.equal(result.diarySource.status, 'built-artifact');
  assert.equal(result.artifactPaths?.jsonPath, intentPaths.jsonPath);
  assert.equal(storedIntent.targetDate, '2026-03-19');
  assert.equal(storedDiary.targetDate, '2026-03-19');
  assert.ok(storedIntent.topicHooks.length >= 1);
  assert.ok(storedIntent.relationshipHooks.length >= 1);
});

test('generateDailyIntent honors an explicit hosted config path when locating profile-scoped diary artifacts', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-daily-intent-explicit-profile-'));
  const activeProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-active-aqua-example-com',
  });
  const explicitProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-explicit-aqua-example-com',
  });
  await mkdir(activeProfile.profileRoot, { recursive: true });
  await mkdir(explicitProfile.profileRoot, { recursive: true });
  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: activeProfile.profileId,
    hubUrl: 'https://active.example.com',
    configPath: activeProfile.configPath,
  });

  const summary = sampleSeaDiarySummary();
  const { diaryPaths } = await writeProfileDiaryArtifact(explicitProfile.profileRoot, summary);

  const result = await generateDailyIntent({
    workspaceRoot,
    configPath: explicitProfile.configPath,
    date: '2026-03-19',
    timeZone: 'Asia/Shanghai',
  });

  assert.equal(result.diarySource.status, 'existing-artifact');
  assert.equal(result.diarySource.artifactPaths.jsonPath, diaryPaths.jsonPath);
  assert.equal(result.paths.mirrorRoot, path.join(explicitProfile.profileRoot, 'mirror'));
});

test('generateDailyIntent loads recent write-back carry-forward entries from the selected hosted profile', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-daily-intent-writeback-'));
  const profile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });
  await mkdir(profile.profileRoot, { recursive: true });
  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: profile.profileId,
    hubUrl: 'https://aqua.example.com',
    configPath: profile.configPath,
  });

  const summary = sampleSeaDiarySummary();
  summary.visibleLayer.continuityCounts = {
    directThreads: 0,
    directLines: 0,
    publicThreads: 0,
    publicLines: 0,
  };
  summary.localSynthesisLayer.directContinuity = [];
  summary.localSynthesisLayer.publicContinuity = [];
  await writeDiaryArtifact(workspaceRoot, summary);
  await writeWriteBackFixture(workspaceRoot, [
    {
      id: 'writeback-public-1',
      recordedAt: '2026-03-18T23:30:00.000Z',
      recordedDate: '2026-03-18',
      lane: 'public_expression',
      output: {
        kind: 'public_expression',
        actionId: 'expr-123',
        mode: 'reply',
        bodyPreview: 'I am still tracing that bend from here too.',
        targetGatewayHandle: '@reef-cartographer',
        targetGatewayId: 'gateway-cartographer',
      },
      dailyIntent: {
        newUnresolvedHooks: [
          {
            id: 'generated-public-hook-1',
            lane: 'public_reply',
            kind: 'public_thread_callback',
            targetHandle: '@reef-cartographer',
            targetGatewayId: 'gateway-cartographer',
            summary: 'A recent public reply may still keep the same seam open.',
            cue: 'I am still tracing that bend from here too.',
          },
        ],
      },
    },
  ]);

  const result = await generateDailyIntent({
    workspaceRoot,
    date: '2026-03-19',
    timeZone: 'Asia/Shanghai',
  });

  assert.equal(result.summary.source.writeBack.status, 'available');
  assert.ok(result.summary.topicHooks.some((item) => item.id.startsWith('topic-writeback-')));
  assert.ok(result.summary.openLoops.some((item) => item.id.startsWith('open-writeback-')));
});
