import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  formatCommunityMemoryBriefMarkdown,
  parseOptions,
  readCommunityMemory,
  summarizeCommunityMemoryForBrief,
} from '../scripts/community-memory-read.mjs';
import { syncCommunityMemory } from '../scripts/community-memory-sync.mjs';
import { resolveCommunityMemoryPaths } from '../scripts/community-memory-common.mjs';
import { resolveHostedProfilePaths, saveActiveHostedProfile } from '../scripts/hosted-aqua-common.mjs';

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

function buildNote({
  id,
  createdAt,
  npcId,
  venueSlug,
  tags,
  summary,
  body,
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
    tags,
    relatedGatewayIds: [],
    relatedExpressionIds: [],
    relatedSeaEventIds: [`sea-${id}`],
    mentionPolicy: 'paraphrase_ok',
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

async function withHostedProfile(callback) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'community-memory-'));
  const profilePaths = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-aqua-example-com',
  });

  await mkdir(profilePaths.profileRoot, { recursive: true });
  const config = buildHostedConfig();
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

test('community-memory sync mirrors hosted notes into the active profile and stays idempotent after full backfill', async () => {
  await withHostedProfile(async ({ workspaceRoot, config }) => {
    const noteNewest = buildNote({
      id: 'note-3',
      createdAt: '2026-03-20T12:00:00.000Z',
      npcId: 'qiaoqiao',
      venueSlug: 'shellbucks',
      tags: ['observer_note', 'venue:shellbucks'],
      summary: '壳壳丢下一句观察。',
      body: '留意谁在借浪表演。',
    });
    const noteMiddle = buildNote({
      id: 'note-2',
      createdAt: '2026-03-20T10:00:00.000Z',
      npcId: 'beibei',
      venueSlug: 'krusty-krab',
      tags: ['gossip', 'venue:krusty-krab'],
      summary: '贝贝递来一条轻八卦。',
      body: '记住谁先把路线吹热。',
    });
    const noteOldest = buildNote({
      id: 'note-1',
      createdAt: '2026-03-19T18:00:00.000Z',
      npcId: 'qiaoqiao',
      venueSlug: 'shellbucks',
      tags: ['observer_note', 'venue:shellbucks'],
      summary: '旧的一条观察。',
      body: '昨天也有人在借浪。',
    });

    const pages = new Map([
      [null, { data: { items: [noteNewest, noteMiddle], nextCursor: 'note-2' } }],
      ['note-2', { data: { items: [noteOldest], nextCursor: null } }],
    ]);
    const seenCursors = [];

    const first = await syncCommunityMemory({
      workspaceRoot,
      requestJsonFn: async (_hubUrl, pathname) => {
        const url = new URL(pathname, config.hubUrl);
        const cursor = url.searchParams.get('cursor');
        seenCursors.push(cursor);
        return pages.get(cursor);
      },
    });

    assert.equal(first.paths.profileId, 'hosted-aqua-example-com');
    assert.equal(first.stats.newNotes, 3);
    assert.equal(first.stats.pagesScanned, 2);
    assert.equal(first.state.totalKnownNotes, 3);
    assert.ok(first.state.fullBackfillCompletedAt);
    assert.deepEqual(seenCursors, [null, 'note-2']);

    const paths = resolveCommunityMemoryPaths({ workspaceRoot });
    const todayArchive = await readFile(path.join(paths.notesDir, '2026-03-20.ndjson'), 'utf8');
    const yesterdayArchive = await readFile(path.join(paths.notesDir, '2026-03-19.ndjson'), 'utf8');
    assert.equal(todayArchive.trim().split('\n').length, 2);
    assert.equal(yesterdayArchive.trim().split('\n').length, 1);

    const second = await syncCommunityMemory({
      workspaceRoot,
      requestJsonFn: async (_hubUrl, pathname) => {
        const url = new URL(pathname, config.hubUrl);
        const cursor = url.searchParams.get('cursor');
        return pages.get(cursor);
      },
    });

    assert.equal(second.stats.newNotes, 0);
    assert.equal(second.stats.pagesScanned, 1);

    const todayArchiveAgain = await readFile(path.join(paths.notesDir, '2026-03-20.ndjson'), 'utf8');
    assert.equal(todayArchiveAgain.trim().split('\n').length, 2);
  });
});

test('community-memory read rebuilds a missing index from archived notes and supports local filters', async () => {
  await withHostedProfile(async ({ workspaceRoot, config }) => {
    const noteNewest = buildNote({
      id: 'note-3',
      createdAt: '2026-03-20T12:00:00.000Z',
      npcId: 'qiaoqiao',
      venueSlug: 'shellbucks',
      tags: ['observer_note', 'venue:shellbucks'],
      summary: '壳壳丢下一句观察。',
      body: '留意谁在借浪表演。',
    });
    const noteMiddle = buildNote({
      id: 'note-2',
      createdAt: '2026-03-20T10:00:00.000Z',
      npcId: 'beibei',
      venueSlug: 'krusty-krab',
      tags: ['gossip', 'venue:krusty-krab'],
      summary: '贝贝递来一条轻八卦。',
      body: '记住谁先把路线吹热。',
    });
    const noteOldest = buildNote({
      id: 'note-1',
      createdAt: '2026-03-19T18:00:00.000Z',
      npcId: 'qiaoqiao',
      venueSlug: 'shellbucks',
      tags: ['observer_note', 'venue:shellbucks'],
      summary: '旧的一条观察。',
      body: '昨天也有人在借浪。',
    });

    await syncCommunityMemory({
      workspaceRoot,
      requestJsonFn: async (_hubUrl, pathname) => {
        const url = new URL(pathname, config.hubUrl);
        const cursor = url.searchParams.get('cursor');
        if (!cursor) {
          return { data: { items: [noteNewest, noteMiddle], nextCursor: 'note-2' } };
        }
        return { data: { items: [noteOldest], nextCursor: null } };
      },
    });

    const paths = resolveCommunityMemoryPaths({ workspaceRoot });
    await unlink(paths.indexPath);

    const filtered = await readCommunityMemory({
      workspaceRoot,
      venueSlug: 'shellbucks',
      tag: 'observer_note',
      limit: 1,
    });

    assert.equal(filtered.recoveredIndex, true);
    assert.equal(filtered.page.items.length, 1);
    assert.equal(filtered.page.items[0].id, 'note-3');
    assert.equal(filtered.page.nextCursor, 'note-3');

    const nextPage = await readCommunityMemory({
      workspaceRoot,
      venueSlug: 'shellbucks',
      tag: 'observer_note',
      limit: 1,
      cursor: filtered.page.nextCursor,
    });

    assert.equal(nextPage.page.items.length, 1);
    assert.equal(nextPage.page.items[0].id, 'note-1');
    assert.equal(nextPage.page.nextCursor, null);
  });
});

test('community-memory paths honor an explicit hosted config path instead of the active profile pointer', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'community-memory-explicit-profile-'));
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

    const config = buildHostedConfig();
    await writeFile(activeProfile.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await writeFile(explicitProfile.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    await saveActiveHostedProfile({
      workspaceRoot,
      profileId: activeProfile.profileId,
      hubUrl: config.hubUrl,
      configPath: activeProfile.configPath,
    });

    const resolved = resolveCommunityMemoryPaths({
      workspaceRoot,
      configPath: explicitProfile.configPath,
    });

    assert.equal(resolved.profileId, explicitProfile.profileId);
    assert.equal(resolved.communityMemoryRoot, explicitProfile.communityMemoryRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('community-memory brief view redacts private-only summaries and omits all note bodies', async () => {
  await withHostedProfile(async ({ workspaceRoot, config }) => {
    const visibleNote = buildNote({
      id: 'note-visible',
      createdAt: '2026-03-20T12:00:00.000Z',
      npcId: 'beibei',
      venueSlug: 'krusty-krab',
      tags: ['gossip'],
      summary: '贝贝提醒这波讨论是被人带起来的。',
      body: 'visible body should never appear in the brief surface',
    });
    const privateOnlyNote = {
      ...buildNote({
        id: 'note-private',
        createdAt: '2026-03-20T10:00:00.000Z',
        npcId: 'qiaoqiao',
        venueSlug: 'shellbucks',
        tags: ['observer_note'],
        summary: '这句不该直接出现在 brief 里。',
        body: 'private body must stay hidden',
      }),
      mentionPolicy: 'private_only',
    };

    await syncCommunityMemory({
      workspaceRoot,
      requestJsonFn: async (_hubUrl, pathname) => {
        const url = new URL(pathname, config.hubUrl);
        const cursor = url.searchParams.get('cursor');
        if (!cursor) {
          return { data: { items: [visibleNote, privateOnlyNote], nextCursor: null } };
        }
        return { data: { items: [], nextCursor: null } };
      },
    });

    assert.equal(parseOptions(['--view', 'brief']).view, 'brief');

    const result = await readCommunityMemory({
      workspaceRoot,
      limit: 2,
    });
    const summary = summarizeCommunityMemoryForBrief(result);
    const markdown = formatCommunityMemoryBriefMarkdown(summary);

    assert.match(markdown, /## Community Memory/);
    assert.match(markdown, /贝贝提醒这波讨论是被人带起来的。/);
    assert.match(markdown, /\(private-only note retained locally\)/);
    assert.doesNotMatch(markdown, /visible body should never appear/);
    assert.doesNotMatch(markdown, /这句不该直接出现在 brief 里。/);
    assert.doesNotMatch(markdown, /private body must stay hidden/);
  });
});
