import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildStoredSeaEventRecord,
  buildStoredDeliveryRecord,
  createDefaultMirrorState,
  extractDeliveryHints,
  parseSseEventBlock,
  resolveMirrorPaths,
  pushRecentDelivery,
} from '../scripts/aqua-mirror-common.mjs';
import {
  collectGapRepairPageItems,
  hydrateConversationThreads,
  selectGapRepairAnchor,
} from '../scripts/aqua-mirror-sync.mjs';

test('extractDeliveryHints derives lazy DM and public-thread sync targets from a delivery', () => {
  const hints = extractDeliveryHints({
    seaEvent: {
      type: 'conversation.message_sent',
      metadata: {
        conversationId: 'cv_123',
        messageId: 'msg_123',
      },
    },
  });

  assert.equal(hints.refreshContext, false);
  assert.equal(hints.refreshConversationIndex, true);
  assert.deepEqual(hints.conversationUpdates, [
    {
      conversationId: 'cv_123',
      messageId: 'msg_123',
    },
  ]);
  assert.deepEqual(hints.publicThreadUpdates, []);
});

test('extractDeliveryHints refreshes context and public-thread targets for world/public deliveries', () => {
  const currentHints = extractDeliveryHints({
    seaEvent: {
      type: 'current.changed',
      metadata: {},
    },
  });
  assert.equal(currentHints.refreshContext, true);

  const publicHints = extractDeliveryHints({
    seaEvent: {
      type: 'public_expression.replied',
      metadata: {
        expressionId: 'public-expression-2',
        rootExpressionId: 'public-expression-1',
      },
    },
  });
  assert.deepEqual(publicHints.publicThreadUpdates, [
    {
      rootExpressionId: 'public-expression-1',
      expressionId: 'public-expression-2',
    },
  ]);
});

test('pushRecentDelivery deduplicates by delivery id and keeps the newest entries', () => {
  const first = buildStoredDeliveryRecord({
    id: 'sea-delivery-1',
    seaEvent: { id: 'evt-1', type: 'current.changed' },
  }, '2026-03-16T10:00:00.000Z');
  const second = buildStoredDeliveryRecord({
    id: 'sea-delivery-2',
    seaEvent: { id: 'evt-2', type: 'environment.changed' },
  }, '2026-03-16T10:01:00.000Z');
  const updatedFirst = buildStoredDeliveryRecord({
    id: 'sea-delivery-1',
    seaEvent: { id: 'evt-1', type: 'current.changed' },
  }, '2026-03-16T10:02:00.000Z');

  const deduped = pushRecentDelivery([first, second], updatedFirst, 2);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].deliveryId, 'sea-delivery-2');
  assert.equal(deduped[1].recordedAt, '2026-03-16T10:02:00.000Z');
});

test('parseSseEventBlock parses event, id, and JSON payload', () => {
  const frame = parseSseEventBlock(
    [
      'id: sea-delivery-1',
      'event: sea.invalidate',
      'data: {"id":"sea-delivery-1","seaEvent":{"id":"evt-1","type":"current.changed"}}',
      '',
    ].join('\n'),
  );

  assert.deepEqual(frame, {
    id: 'sea-delivery-1',
    event: 'sea.invalidate',
    data: {
      id: 'sea-delivery-1',
      seaEvent: {
        id: 'evt-1',
        type: 'current.changed',
      },
    },
  });
});

test('buildStoredSeaEventRecord records bounded gap repair events without a delivery id', () => {
  const record = buildStoredSeaEventRecord(
    {
      id: 'evt_gap',
      type: 'conversation.message_sent',
      actorGatewayId: 'gw_alpha',
      subjectGatewayId: 'gw_beta',
      objectGatewayId: null,
      createdAt: '2026-03-17T08:00:00.000Z',
    },
    '2026-03-17T08:05:00.000Z',
  );

  assert.equal(record.source, 'feed_repair');
  assert.equal(record.deliveryId, null);
  assert.deepEqual(record.activityGatewayIds, ['gw_alpha', 'gw_beta']);
  assert.equal(record.seaEvent.id, 'evt_gap');
});

test('selectGapRepairAnchor prefers the last visible feed event for gateway viewers', () => {
  const anchor = selectGapRepairAnchor(
    {
      recentDeliveries: [
        buildStoredSeaEventRecord({
          id: 'evt_public',
          type: 'public_expression.created',
          visibility: 'public',
          createdAt: '2026-03-17T08:00:00.000Z',
        }),
        buildStoredSeaEventRecord({
          id: 'evt_system',
          type: 'current.changed',
          visibility: 'system',
          createdAt: '2026-03-17T08:01:00.000Z',
        }),
      ],
      gapRepair: {
        lastVisibleFeedEventId: null,
      },
    },
    'gateway',
  );

  assert.equal(anchor, 'evt_public');
});

test('selectGapRepairAnchor prefers the persisted feed anchor when present', () => {
  const anchor = selectGapRepairAnchor(
    {
      recentDeliveries: [],
      gapRepair: {
        lastVisibleFeedEventId: 'evt_saved',
      },
    },
    'gateway',
  );

  assert.equal(anchor, 'evt_saved');
});

test('collectGapRepairPageItems ignores events after cutoff and stops at anchor', () => {
  const result = collectGapRepairPageItems(
    [
      { id: 'evt_new', createdAt: '2026-03-17T08:03:00.000Z' },
      { id: 'evt_gap_2', createdAt: '2026-03-17T08:01:00.000Z' },
      { id: 'evt_gap_1', createdAt: '2026-03-17T08:00:30.000Z' },
      { id: 'evt_anchor', createdAt: '2026-03-17T08:00:00.000Z' },
    ],
    'evt_anchor',
    '2026-03-17T08:02:00.000Z',
  );

  assert.equal(result.anchorFound, true);
  assert.deepEqual(
    result.collected.map((item) => item.id),
    ['evt_gap_2', 'evt_gap_1'],
  );
});

test('hydrateConversationThreads can reuse an existing index without refetching it', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-hydrate-conversations-'));
  const paths = resolveMirrorPaths({ workspaceRoot });
  const state = createDefaultMirrorState();
  state.conversations.items = [{ id: 'cv_123', updatedAt: '2026-03-17T08:00:00.000Z' }];

  let indexCalls = 0;
  const threadCalls = [];
  const target = {
    viewerKind: 'gateway',
    hubUrl: 'http://127.0.0.1:8787',
    mode: 'hosted',
    async fetchConversations() {
      indexCalls += 1;
      return {
        data: {
          items: [{ id: 'cv_123', updatedAt: '2026-03-17T08:00:00.000Z' }],
        },
      };
    },
    async fetchConversationThread(conversationId) {
      threadCalls.push(conversationId);
      return {
        data: {
          items: [],
          readState: null,
        },
      };
    },
  };

  await hydrateConversationThreads(target, paths, state, { skipIndexSync: true });

  assert.equal(indexCalls, 0);
  assert.deepEqual(threadCalls, ['cv_123']);
});
