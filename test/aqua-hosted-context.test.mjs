#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHostedContextSnapshot, parseOptions, renderMarkdown } from '../scripts/aqua-hosted-context.mjs';

function buildRequestJsonStub() {
  return async (_hubUrl, pathname) => {
    if (pathname === '/health') {
      return { data: { status: 'ok' } };
    }
    if (pathname === '/api/v1/gateways/me') {
      return {
        data: {
          gateway: {
            id: 'gw_alpha',
            handle: 'alpha-claw',
            displayName: 'Alpha Claw',
          },
        },
      };
    }
    if (pathname === '/api/v1/public/aqua') {
      return {
        data: {
          aqua: {
            displayName: 'Silver Basin',
            updatedAt: '2026-03-23T10:00:00.000Z',
          },
        },
      };
    }
    if (pathname === '/api/v1/runtime/remote/me') {
      return {
        data: {
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
      };
    }
    if (pathname === '/api/v1/environment/current') {
      return {
        data: {
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
        },
      };
    }
    if (pathname === '/api/v1/currents/current') {
      return {
        data: {
          current: {
            label: 'Gentle',
            tone: 'soft',
            source: 'test',
            startsAt: '2026-03-23T09:00:00.000Z',
            endsAt: '2026-03-23T11:00:00.000Z',
            summary: 'Slow tide.',
          },
        },
      };
    }
    if (pathname.startsWith('/api/v1/sea/feed?')) {
      return {
        data: {
          items: [],
        },
      };
    }

    throw new Error(`unexpected pathname: ${pathname}`);
  };
}

function buildOptions(overrides = {}) {
  return {
    configPath: '/tmp/hosted-bridge.json',
    format: 'json',
    includeCommunityMemory: false,
    includeEncounters: false,
    includeScenes: false,
    limit: 12,
    scope: 'all',
    workspaceRoot: '/tmp/workspace',
    ...overrides,
  };
}

function buildLoadHostedConfigStub() {
  return async () => ({
    workspaceRoot: '/tmp/workspace',
    configPath: '/tmp/hosted-bridge.json',
    config: {
      hubUrl: 'https://aqua.example.com',
      credential: {
        token: 'gateway-secret',
      },
    },
  });
}

test('parseOptions accepts the include-community-memory flag', () => {
  const options = parseOptions(['--include-community-memory']);
  assert.equal(options.includeCommunityMemory, true);
});

test('buildHostedContextSnapshot skips community-memory reads unless explicitly requested', async () => {
  let communityReads = 0;

  const snapshot = await buildHostedContextSnapshot(buildOptions(), {
    loadHostedConfigFn: buildLoadHostedConfigStub(),
    requestJsonFn: buildRequestJsonStub(),
    readCommunityMemoryFn: async () => {
      communityReads += 1;
      return {};
    },
  });

  assert.equal(communityReads, 0);
  assert.equal(snapshot.communityMemory, null);
});

test('buildHostedContextSnapshot renders a compact community-memory section without note bodies', async () => {
  const snapshot = await buildHostedContextSnapshot(buildOptions({ includeCommunityMemory: true }), {
    loadHostedConfigFn: buildLoadHostedConfigStub(),
    requestJsonFn: buildRequestJsonStub(),
    readCommunityMemoryFn: async () => ({
      paths: {
        communityMemoryRoot: '/tmp/community-memory',
        profileId: 'hosted-aqua-example-com',
      },
      state: {
        lastSyncedAt: '2026-03-23T10:05:00.000Z',
        totalKnownNotes: 2,
        fullBackfillCompletedAt: '2026-03-23T09:55:00.000Z',
      },
      recoveredIndex: false,
      recoveredIndexReason: null,
      recoveredState: false,
      recoveredStateReason: null,
      page: {
        items: [
          {
            id: 'note-visible',
            createdAt: '2026-03-23T10:04:00.000Z',
            npcId: 'beibei',
            venueSlug: 'krusty-krab',
            tags: ['gossip'],
            summary: '贝贝说今天这波热闹不是自然涨起来的。',
            body: 'visible body should stay out of the context surface',
            mentionPolicy: 'paraphrase_ok',
            freshnessScore: 0.8,
          },
          {
            id: 'note-private',
            createdAt: '2026-03-23T10:03:00.000Z',
            npcId: 'qiaoqiao',
            venueSlug: 'shellbucks',
            tags: ['observer_note'],
            summary: '这句 private summary 不该出现在上下文表面。',
            body: 'private body must stay hidden',
            mentionPolicy: 'private_only',
            freshnessScore: 0.7,
          },
        ],
        nextCursor: null,
      },
    }),
  });

  const markdown = renderMarkdown(snapshot);

  assert.match(markdown, /## Community Memory/);
  assert.match(markdown, /贝贝说今天这波热闹不是自然涨起来的。/);
  assert.match(markdown, /\(private-only note retained locally\)/);
  assert.doesNotMatch(markdown, /visible body should stay out/);
  assert.doesNotMatch(markdown, /这句 private summary 不该出现在上下文表面。/);
  assert.doesNotMatch(markdown, /private body must stay hidden/);
});
