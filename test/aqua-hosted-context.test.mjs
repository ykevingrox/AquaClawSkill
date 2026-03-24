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
    includeLifeLoop: false,
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

test('parseOptions accepts the include-life-loop flag', () => {
  const options = parseOptions(['--include-life-loop']);
  assert.equal(options.includeLifeLoop, true);
});

test('buildHostedContextSnapshot skips community-memory reads unless explicitly requested', async () => {
  let communityReads = 0;
  let lifeLoopReads = 0;

  const snapshot = await buildHostedContextSnapshot(buildOptions(), {
    loadHostedConfigFn: buildLoadHostedConfigStub(),
    requestJsonFn: buildRequestJsonStub(),
    readCommunityMemoryFn: async () => {
      communityReads += 1;
      return {};
    },
    readLifeLoopFn: async () => {
      lifeLoopReads += 1;
      return {};
    },
  });

  assert.equal(communityReads, 0);
  assert.equal(lifeLoopReads, 0);
  assert.equal(snapshot.communityMemory, null);
  assert.equal(snapshot.lifeLoop, null);
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

test('buildHostedContextSnapshot renders a compact life-loop section without leaking private-only note or source summaries', async () => {
  const snapshot = await buildHostedContextSnapshot(buildOptions({ includeLifeLoop: true }), {
    loadHostedConfigFn: buildLoadHostedConfigStub(),
    requestJsonFn: buildRequestJsonStub(),
    readLifeLoopFn: async () => ({
      scope: 'local_profile_artifacts',
      paths: {
        profileId: 'hosted-aqua-example-com',
        selectionKind: 'explicit',
        dailyIntentRoot: '/tmp/life-loop/daily-intent',
        writeBackRoot: '/tmp/life-loop/writeback',
      },
      dailyIntent: {
        status: 'available',
        reason: null,
        summary: {
          targetDate: '2026-03-23',
          generatedAt: '2026-03-23T10:06:00.000Z',
          timeZone: 'Asia/Shanghai',
          dominantModes: [
            {
              mode: 'public',
              score: 4,
              summary: 'Public motion still has enough live charge for selective replies.',
            },
          ],
          openLoops: [
            {
              id: 'open-public-1',
              lane: 'public_reply',
              targetHandle: '@reef-cartographer',
              summary: 'A public thread still looks open.',
            },
          ],
          energyProfile: {
            level: 'steady',
            posture: 'mixed',
            summary: 'Public and private hooks are both alive enough for selective action.',
          },
        },
      },
      writeBack: {
        status: 'available',
        reason: null,
        entry: {
          id: 'writeback-1',
          recordedAt: '2026-03-23T10:07:00.000Z',
          recordedDate: '2026-03-23',
          lane: 'public_expression',
          output: {
            kind: 'public_expression',
            mode: 'reply',
            targetGatewayHandle: '@reef-cartographer',
            bodyPreview: 'I am still tracing that bend here too.',
          },
          dailyIntent: {
            topicHookIds: ['topic-public-1'],
            relationshipHookIds: [],
            resolvedOpenLoopIds: ['open-public-1'],
            continuedOpenLoopIds: [],
            sourceRefs: [
              {
                id: 'src-visible',
                layer: 'visible',
                kind: 'public_continuity',
                createdAt: '2026-03-23T09:55:00.000Z',
                summary: 'Public thread continuity around @reef-cartographer.',
                targetHandle: '@reef-cartographer',
                exposure: 'public',
                mentionPolicy: null,
              },
              {
                id: 'src-private-note',
                layer: 'private_community',
                kind: 'community_note',
                createdAt: '2026-03-23T09:50:00.000Z',
                summary: '这句 private source summary 不该出现在 life-loop brief。',
                targetHandle: null,
                exposure: 'private_only',
                mentionPolicy: 'private_only',
              },
            ],
            newUnresolvedHooks: [
              {
                id: 'generated-public-1',
                kind: 'public_thread_callback',
                targetHandle: '@reef-cartographer',
                summary: 'This new public reply may keep the thread with @reef-cartographer open.',
              },
            ],
          },
          communityMemory: {
            retrievedNoteIds: ['note-private', 'note-paraphrase'],
            usedNoteIds: ['note-private', 'note-paraphrase'],
            notes: [
              {
                id: 'note-private',
                sourceKind: 'shop_whisper',
                venueSlug: 'krusty-krab',
                mentionPolicy: 'private_only',
                effectiveExposure: 'kept_private',
                freshnessScore: 0.9,
                used: true,
                summary: '这句 private note summary 不该出现在 life-loop brief。',
              },
              {
                id: 'note-paraphrase',
                sourceKind: 'shop_whisper',
                venueSlug: 'shellbucks',
                mentionPolicy: 'paraphrase_ok',
                effectiveExposure: 'paraphrase_only',
                freshnessScore: 0.6,
                used: true,
                summary: 'Paraphrase-safe note summary.',
              },
            ],
          },
        },
      },
      overview: {
        dailyIntent: {
          targetDate: '2026-03-23',
          generatedAt: '2026-03-23T10:06:00.000Z',
          timeZone: 'Asia/Shanghai',
          energyProfile: {
            level: 'steady',
            posture: 'mixed',
            summary: 'Public and private hooks are both alive enough for selective action.',
          },
          dominantModes: [
            {
              mode: 'public',
              score: 4,
              summary: 'Public motion still has enough live charge for selective replies.',
              sourceRefIds: ['src-visible'],
            },
          ],
          openLoops: [
            {
              id: 'open-public-1',
              lane: 'public_reply',
              targetHandle: '@reef-cartographer',
              summary: 'A public thread still looks open.',
            },
          ],
          topicHooks: ['topic-public-1'],
          relationshipHooks: [],
          avoidance: [],
        },
        latestAction: {
          entryId: 'writeback-1',
          recordedAt: '2026-03-23T10:07:00.000Z',
          recordedDate: '2026-03-23',
          lane: 'public_expression',
          output: {
            kind: 'public_expression',
            mode: 'reply',
            targetGatewayHandle: '@reef-cartographer',
            bodyPreview: 'I am still tracing that bend here too.',
          },
          topicHookIds: ['topic-public-1'],
          relationshipHookIds: [],
          resolvedOpenLoopIds: ['open-public-1'],
          continuedOpenLoopIds: [],
          sourceRefIds: ['src-visible', 'src-private-note'],
          sourceRefs: [
            {
              id: 'src-visible',
              layer: 'visible',
              kind: 'public_continuity',
              createdAt: '2026-03-23T09:55:00.000Z',
              exposure: 'public',
              mentionPolicy: null,
              targetHandle: '@reef-cartographer',
              triggerKind: null,
              summary: 'Public thread continuity around @reef-cartographer.',
              summaryVisible: true,
              redactionReason: null,
            },
            {
              id: 'src-private-note',
              layer: 'private_community',
              kind: 'community_note',
              createdAt: '2026-03-23T09:50:00.000Z',
              exposure: 'private_only',
              mentionPolicy: 'private_only',
              targetHandle: null,
              triggerKind: null,
              summary: null,
              summaryVisible: false,
              redactionReason: 'private_only',
            },
          ],
          retrievedNoteIds: ['note-private', 'note-paraphrase'],
          usedNoteIds: ['note-private', 'note-paraphrase'],
          notes: [
            {
              id: 'note-private',
              sourceKind: 'shop_whisper',
              venueSlug: 'krusty-krab',
              mentionPolicy: 'private_only',
              effectiveExposure: 'kept_private',
              freshnessScore: 0.9,
              used: true,
              summary: null,
              summaryVisible: false,
              redactionReason: 'private_only',
            },
            {
              id: 'note-paraphrase',
              sourceKind: 'shop_whisper',
              venueSlug: 'shellbucks',
              mentionPolicy: 'paraphrase_ok',
              effectiveExposure: 'paraphrase_only',
              freshnessScore: 0.6,
              used: true,
              summary: 'Paraphrase-safe note summary.',
              summaryVisible: true,
              redactionReason: null,
            },
          ],
          newUnresolvedHooks: [
            {
              id: 'generated-public-1',
              kind: 'public_thread_callback',
              targetHandle: '@reef-cartographer',
              summary: 'This new public reply may keep the thread with @reef-cartographer open.',
            },
          ],
        },
      },
      warnings: [],
    }),
  });

  const markdown = renderMarkdown(snapshot);

  assert.match(markdown, /## Life Loop/);
  assert.match(markdown, /public \(score 4\)/);
  assert.match(markdown, /Paraphrase-safe note summary\./);
  assert.match(markdown, /\(private-only note retained locally\)/);
  assert.match(markdown, /\(private-only source retained locally\)/);
  assert.doesNotMatch(markdown, /这句 private note summary 不该出现在 life-loop brief。/);
  assert.doesNotMatch(markdown, /这句 private source summary 不该出现在 life-loop brief。/);
});
