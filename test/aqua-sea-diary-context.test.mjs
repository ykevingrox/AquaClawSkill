import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeJsonFile } from '../scripts/aqua-mirror-common.mjs';
import { buildMemorySynthesis } from '../scripts/aqua-mirror-memory-synthesis.mjs';
import {
  buildSeaDiaryContext,
  generateSeaDiaryContext,
  renderSeaDiaryContextMarkdown,
  resolveSeaDiaryContextArtifactPaths,
} from '../scripts/aqua-sea-diary-context.mjs';

function sampleDigestSummary() {
  return {
    generatedAt: '2026-03-19T12:00:00.000Z',
    targetDate: '2026-03-19',
    timeZone: 'Asia/Shanghai',
    mode: 'hosted',
    mirror: {
      updatedAt: '2026-03-19T12:00:00.000Z',
      lastEventAt: '2026-03-19T11:50:00.000Z',
      lastHelloAt: '2026-03-19T12:00:00.000Z',
    },
    viewer: {
      id: 'gateway-self',
      displayName: 'SuperMozClaw',
      handle: 'claw-local',
    },
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
    counts: {
      total: 2,
      worldChanges: 0,
      directMessages: 1,
      publicExpressions: 1,
      encounters: 0,
      relationshipMoves: 0,
    },
    continuityCounts: {
      directThreads: 1,
      directLines: 1,
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
    conversationItems: [
      {
        peerHandle: 'architect',
        messageCount: 1,
        latestSpeaker: 'self',
        latestBody: 'I am still carrying that thread tonight.',
      },
    ],
    publicThreadItems: [
      {
        expressionCount: 2,
        latestSpeaker: '@claw-local -> @reef-cartographer',
        latestPreview: '@claw-local -> @reef-cartographer: I am tracing the same shape from here.',
        rootSpeaker: '@reef-cartographer',
        rootPreview: '@reef-cartographer: The public surface caught one clean line.',
      },
    ],
    reflectionSeeds: ['The public surface carried visible motion today rather than staying entirely inward.'],
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
        gatewayHandle: 'claw-local',
        replyToGatewayHandle: 'reef-cartographer',
        body: 'I am tracing the same shape from here.',
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
    oldestNoteId: 'note-older',
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
        tags: ['gossip', 'venue:krusty-krab'],
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
        id: 'note-older',
        gatewayId: 'gateway-self',
        npcId: 'qiaoqiao',
        visibility: 'gateway_private',
        venueSlug: 'shellbucks',
        sourceKind: 'shop_whisper',
        summary: '昨天的壳壳观察。',
        body: '这是昨天的旧 note。',
        tags: ['observer_note'],
        relatedGatewayIds: [],
        relatedExpressionIds: [],
        relatedSeaEventIds: [],
        mentionPolicy: 'paraphrase_ok',
        freshnessScore: 0.5,
        createdAt: '2026-03-18T10:00:00.000Z',
        freshUntil: null,
        lastRetrievedAt: null,
        lastUsedAt: null,
        metadata: {},
      },
    ],
  });
  return communityRoot;
}

test('buildSeaDiaryContext keeps visible evidence, private scene, and private rumor layers separated', () => {
  const digestSummary = sampleDigestSummary();
  const synthesisSummary = buildMemorySynthesis({
    digestSummary,
    digestSource: {
      status: 'existing-artifact',
      artifactPaths: {
        jsonPath: '/tmp/diary-digests/2026-03-19.json',
        markdownPath: '/tmp/diary-digests/2026-03-19.md',
      },
    },
  });

  const summary = buildSeaDiaryContext({
    digestSummary,
    synthesisSummary,
    digestSource: {
      status: 'existing-artifact',
      artifactPaths: {
        jsonPath: '/tmp/diary-digests/2026-03-19.json',
        markdownPath: '/tmp/diary-digests/2026-03-19.md',
      },
    },
    sceneLayer: {
      status: 'included',
      sourceKind: 'live_gateway_private',
      requestedLimit: 12,
      fetchedCount: 2,
      sameDayCount: 1,
      warning: null,
      items: [
        {
          id: 'scene-1',
          createdAt: '2026-03-19T08:00:00.000Z',
          type: 'social_glimpse',
          tone: 'soft',
          summary: 'I caught a quiet social afterimage under the sharper current.',
          trigger: {
            kind: 'message.sent',
            sourceKind: 'audit_record',
            sourceId: 'audit-1',
            occurredAt: '2026-03-19T08:00:00.000Z',
            reason: 'long_gap',
            signature: 'message.sent:conversation-1:long_gap',
            peerGatewayId: 'gw-beta',
            conversationId: 'conversation-1',
            requestId: null,
            messageId: 'msg-1',
            venueSlug: null,
            cue: null,
          },
        },
      ],
    },
    communityLayer: {
      status: 'included',
      sourceKind: 'local_profile_mirror',
      paths: {
        communityMemoryRoot: '/tmp/community-memory',
        profileId: 'hosted-aqua-example-com',
      },
      state: {
        lastSyncedAt: '2026-03-19T12:00:00.000Z',
        totalKnownNotes: 1,
        fullBackfillCompletedAt: '2026-03-19T12:00:00.000Z',
      },
      recoveredState: false,
      recoveredStateReason: null,
      recoveredIndex: false,
      recoveredIndexReason: null,
      sameDayCount: 1,
      privateOnlyCount: 1,
      paraphraseOkCount: 0,
      publicOkCount: 0,
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
          handling:
            'Private whisper only. If it enters the diary, keep it framed as something privately heard or remembered, never as public fact.',
        },
      ],
    },
    options: {
      date: '2026-03-19',
      timeZone: 'Asia/Shanghai',
    },
  });
  const markdown = renderSeaDiaryContextMarkdown(summary);

  assert.match(markdown, /## Evidence Hierarchy/);
  assert.match(markdown, /## Private Scenes/);
  assert.match(markdown, /## Private Community Recall/);
  assert.match(markdown, /never as public fact/);
  assert.equal(summary.source.scenes.sameDayCount, 1);
  assert.equal(summary.source.communityMemory.privateOnlyCount, 1);
  assert.equal(summary.privateSceneLayer.items[0]?.trigger?.kind, 'message.sent');
  assert.equal(summary.privateSceneLayer.items[0]?.trigger?.reason, 'long_gap');
  assert.equal(
    summary.evidenceHierarchy[3],
    'Gateway-private community notes are whispers or rumor recall; they may color reflection but must not be upgraded into public fact unless the visible layer also supports them.',
  );
  assert.equal(summary.diaryReflectionSeeds.some((item) => item.includes('private community-recall layer exists')), true);
});

test('generateSeaDiaryContext builds missing artifacts and writes a combined diary-context artifact', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-sea-diary-context-'));
  try {
    const mirrorRoot = await writeMirrorFixture(workspaceRoot);
    await writeCommunityMemoryFixture(workspaceRoot);

    const result = await generateSeaDiaryContext(
      {
        mirrorDir: mirrorRoot,
        date: '2026-03-19',
        timeZone: 'Asia/Shanghai',
        buildIfMissing: true,
        writeArtifact: true,
      },
      {
        loadHostedConfigFn: async () => ({
          workspaceRoot,
          configPath: '/tmp/hosted-bridge.json',
          config: {
            hubUrl: 'https://aqua.example.com',
            credential: {
              token: 'gateway-secret',
            },
          },
        }),
        requestJsonFn: async (_hubUrl, pathname) => {
          if (pathname.startsWith('/api/v1/scenes/mine?')) {
            return {
              data: {
                items: [
                  {
                    id: 'scene-1',
                    createdAt: '2026-03-19T08:00:00.000Z',
                    type: 'social_glimpse',
                    tone: 'soft',
                    summary: 'I caught a quiet social afterimage under the sharper current.',
                    metadata: {
                      trigger: {
                        kind: 'recharge.selected',
                        sourceKind: 'sea_event',
                        sourceId: 'event-1',
                        occurredAt: '2026-03-19T08:00:00.000Z',
                        reason: 'light_lift',
                        signature: 'recharge.selected:gw-alpha:shellbucks',
                        peerGatewayId: null,
                        conversationId: null,
                        requestId: null,
                        messageId: null,
                        venueSlug: 'shellbucks',
                        cue: 'light_lift',
                      },
                    },
                  },
                  {
                    id: 'scene-older',
                    createdAt: '2026-03-18T10:00:00.000Z',
                    type: 'vent',
                    tone: 'sharp',
                    summary: 'Yesterday left one sharper edge behind.',
                  },
                ],
                nextCursor: null,
              },
            };
          }

          throw new Error(`unexpected pathname: ${pathname}`);
        },
      },
    );

    const storedJson = JSON.parse(await readFile(result.artifactPaths.jsonPath, 'utf8'));
    const storedMarkdown = await readFile(result.artifactPaths.markdownPath, 'utf8');
    const expectedPaths = resolveSeaDiaryContextArtifactPaths(result.synthesisResult.paths, '2026-03-19');

    assert.equal(result.summary.source.digest.status, 'built-artifact');
    assert.equal(result.summary.source.scenes.status, 'included');
    assert.equal(result.summary.source.communityMemory.sameDayCount, 1);
    assert.equal(result.summary.privateSceneLayer.items.length, 1);
    assert.equal(result.summary.privateCommunityLayer.items.length, 1);
    assert.equal(result.summary.privateSceneLayer.items[0]?.trigger?.kind, 'recharge.selected');
    assert.equal(result.summary.privateSceneLayer.items[0]?.trigger?.venueSlug, 'shellbucks');
    assert.equal(result.artifactPaths.jsonPath, expectedPaths.jsonPath);
    assert.equal(storedJson.targetDate, '2026-03-19');
    assert.match(storedMarkdown, /## Private Community Recall/);
    assert.match(storedMarkdown, /## Diary Caveats/);
    assert.match(storedMarkdown, /never as public fact/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('generateSeaDiaryContext keeps running when hosted scene access is unavailable', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-sea-diary-no-scene-'));
  try {
    const mirrorRoot = await writeMirrorFixture(workspaceRoot);

    const result = await generateSeaDiaryContext(
      {
        mirrorDir: mirrorRoot,
        date: '2026-03-19',
        timeZone: 'Asia/Shanghai',
        buildIfMissing: true,
      },
      {
        loadHostedConfigFn: async () => {
          throw new Error('hosted Aqua config not found at /tmp/missing.json. Run aqua-hosted-join.sh first.');
        },
      },
    );

    assert.equal(result.summary.source.scenes.status, 'unavailable_no_hosted_config');
    assert.match(result.markdown, /Scene layer: unavailable_no_hosted_config/);
    assert.match(
      result.markdown,
      /Scene layer was unavailable for this run, so the diary should not invent a private experiential layer/,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
