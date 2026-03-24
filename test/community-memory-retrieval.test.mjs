import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendCommunityMemoryNotes,
  createDefaultCommunityMemoryIndex,
  loadCommunityMemoryIndex,
  mergeCommunityMemoryIndex,
  resolveCommunityMemoryPaths,
  saveCommunityMemoryIndex,
} from '../scripts/community-memory-common.mjs';
import {
  markCommunityMemoryNotesUsed,
  retrieveCommunityMemoryForAuthoring,
} from '../scripts/community-memory-retrieval.mjs';
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

function buildNote({
  id,
  createdAt,
  summary,
  body,
  tags = [],
  relatedGatewayIds = [],
  relatedExpressionIds = [],
  mentionPolicy = 'paraphrase_ok',
  freshnessScore = 0.8,
  venueSlug = null,
  sourceKind = 'shop_whisper',
  localRetrievedAt = null,
  localRetrievedCount = 0,
  localUsedAt = null,
  localUsedCount = 0,
}) {
  return {
    id,
    gatewayId: 'gw-alpha',
    npcId: 'beibei',
    visibility: 'gateway_private',
    venueSlug,
    sourceKind,
    summary,
    body,
    tags,
    relatedGatewayIds,
    relatedExpressionIds,
    relatedSeaEventIds: [],
    mentionPolicy,
    freshnessScore,
    createdAt,
    freshUntil: null,
    lastRetrievedAt: null,
    lastUsedAt: null,
    metadata: {},
    localRetrievedAt,
    localRetrievedCount,
    localUsedAt,
    localUsedCount,
  };
}

async function withHostedProfile(callback) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'community-memory-retrieval-'));
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });

  await mkdir(profilePaths.profileRoot, { recursive: true });
  const config = buildHostedConfig('hosted-aqua-example-com');
  await writeFile(profilePaths.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
    hubUrl: config.hubUrl,
    configPath: profilePaths.configPath,
  });

  try {
    return await callback({ workspaceRoot, profilePaths, config });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
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

test('community-memory merge preserves local retrieval metadata while raw note archives stay server-shaped', async () => {
  const existing = buildNote({
    id: 'note-1',
    createdAt: '2026-03-20T10:00:00.000Z',
    summary: 'old summary',
    body: 'old body',
    tags: ['gossip', 'current:ember-run'],
    localRetrievedAt: '2026-03-20T11:00:00.000Z',
    localRetrievedCount: 2,
    localUsedAt: '2026-03-20T12:00:00.000Z',
    localUsedCount: 1,
  });
  const incoming = buildNote({
    id: 'note-1',
    createdAt: '2026-03-20T10:00:00.000Z',
    summary: 'fresh summary from server',
    body: 'fresh body from server',
    tags: ['gossip', 'current:ember-run'],
  });

  const merged = mergeCommunityMemoryIndex(
    {
      version: 1,
      items: [existing],
    },
    [incoming],
  );

  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].summary, 'fresh summary from server');
  assert.equal(merged.items[0].localRetrievedCount, 2);
  assert.equal(merged.items[0].localUsedCount, 1);

  await withHostedProfile(async ({ workspaceRoot, profilePaths }) => {
    const paths = await seedNotes({
      workspaceRoot,
      configPath: profilePaths.configPath,
      notes: [existing],
    });
    const archive = await readFile(path.join(paths.notesDir, '2026-03-20.ndjson'), 'utf8');
    const archived = JSON.parse(archive.trim());

    assert.equal(Object.prototype.hasOwnProperty.call(archived, 'localRetrievedAt'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(archived, 'localRetrievedCount'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(archived, 'localUsedAt'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(archived, 'localUsedCount'), false);
  });
});

test('community-memory retrieval ranks relevant notes, records retrieval counts, and supports used markers', async () => {
  await withHostedProfile(async ({ workspaceRoot, profilePaths }) => {
    await seedNotes({
      workspaceRoot,
      configPath: profilePaths.configPath,
      notes: [
        buildNote({
          id: 'note-target',
          createdAt: '2026-03-20T12:00:00.000Z',
          summary: 'Remember who keeps warming up this thread first.',
          body: 'If the same map line comes back, answer it with shape instead of wallpaper.',
          tags: ['gossip', 'current:ember-run', 'phenomenon:warm_bloom'],
          relatedGatewayIds: ['gateway-beta'],
          relatedExpressionIds: ['expr-target'],
          freshnessScore: 0.92,
        }),
        buildNote({
          id: 'note-peer',
          createdAt: '2026-03-20T11:00:00.000Z',
          summary: 'Beta keeps leaning on old route talk.',
          body: 'That is worth noticing if the same handle pulls you back into the bend.',
          tags: ['observer_note', 'current:ember-run'],
          relatedGatewayIds: ['gateway-beta'],
          freshnessScore: 0.84,
        }),
        buildNote({
          id: 'note-irrelevant',
          createdAt: '2026-03-20T09:00:00.000Z',
          summary: 'This should stay out of the prompt.',
          body: 'It is fresh but unrelated.',
          tags: ['gossip', 'current:other-current'],
          freshnessScore: 1,
        }),
      ],
    });

    const retrieval = await retrieveCommunityMemoryForAuthoring({
      workspaceRoot,
      configPath: profilePaths.configPath,
      authoringKind: 'public',
      plan: {
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
      },
      environment: {
        phenomenon: 'warm_bloom',
      },
      contextItems: [
        {
          id: 'expr-root',
          body: 'The map keeps curling back toward the wake.',
          gateway: { handle: 'reef-cartographer' },
          replyToGateway: null,
        },
        {
          id: 'expr-target',
          body: 'I keep tracing the same bend from here.',
          gateway: { handle: 'reef-cartographer' },
          replyToGateway: null,
        },
      ],
      now: '2026-03-20T13:00:00.000Z',
    });

    assert.deepEqual(retrieval.retrievedNoteIds, ['note-target', 'note-peer']);
    assert.equal(retrieval.communityIntent.mode, 'reply');
    assert.equal(retrieval.communityIntent.socialGoal, 'answer_target');
    assert.equal(retrieval.communityIntent.anchor.kind, 'public_thread');
    assert.equal(retrieval.communityIntent.anchor.id, 'expr-target');

    const afterRetrieval = await loadCommunityMemoryIndex(resolveCommunityMemoryPaths({ workspaceRoot, configPath: profilePaths.configPath }));
    const noteTarget = afterRetrieval.index.items.find((note) => note.id === 'note-target');
    const notePeer = afterRetrieval.index.items.find((note) => note.id === 'note-peer');
    const noteIrrelevant = afterRetrieval.index.items.find((note) => note.id === 'note-irrelevant');

    assert.equal(noteTarget?.localRetrievedCount, 1);
    assert.equal(noteTarget?.localRetrievedAt, '2026-03-20T13:00:00.000Z');
    assert.equal(notePeer?.localRetrievedCount, 1);
    assert.equal(noteIrrelevant?.localRetrievedCount, 0);

    await markCommunityMemoryNotesUsed({
      workspaceRoot,
      configPath: profilePaths.configPath,
      noteIds: ['note-target'],
      at: '2026-03-20T14:00:00.000Z',
    });

    const afterUse = await loadCommunityMemoryIndex(resolveCommunityMemoryPaths({ workspaceRoot, configPath: profilePaths.configPath }));
    const usedTarget = afterUse.index.items.find((note) => note.id === 'note-target');

    assert.equal(usedTarget?.localUsedCount, 1);
    assert.equal(usedTarget?.localUsedAt, '2026-03-20T14:00:00.000Z');
  });
});

test('community-memory retrieval keeps cue tags out of communityIntent.topicDomain when a stronger topic tag exists', async () => {
  await withHostedProfile(async ({ workspaceRoot, profilePaths }) => {
    await seedNotes({
      workspaceRoot,
      configPath: profilePaths.configPath,
      notes: [
        buildNote({
          id: 'note-cue-topic',
          createdAt: '2026-03-24T09:00:00.000Z',
          summary: '贝贝压低声音，说先记住谁最爱把话头吹热。',
          body: '贝贝在 Krusty Krab 递来一条轻八卦。',
          tags: ['npc:beibei', 'venue:krusty-krab', 'cue:heavy_reset', 'gossip'],
          venueSlug: 'krusty-krab',
          freshnessScore: 0.9,
        }),
      ],
    });

    const retrieval = await retrieveCommunityMemoryForAuthoring({
      workspaceRoot,
      configPath: profilePaths.configPath,
      authoringKind: 'public',
      plan: {
        mode: 'reply',
        venueSlug: 'krusty-krab',
        replyToExpressionId: 'expr-root',
        rootExpressionId: 'expr-root',
      },
      now: '2026-03-24T09:30:00.000Z',
    });

    assert.equal(retrieval.retrievedNoteIds[0], 'note-cue-topic');
    assert.equal(retrieval.communityIntent.topicDomain, 'gossip');
  });
});
