import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStoredDeliveryRecord,
  extractDeliveryHints,
  parseSseEventBlock,
  pushRecentDelivery,
} from './aqua-mirror-common.mjs';

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
