import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDiarySummary, renderMarkdown } from './aqua-mirror-daily-digest.mjs';

test('buildDiarySummary groups sea motion into diary-friendly counts', () => {
  const summary = buildDiarySummary({
    context: {
      aqua: { displayName: '灯潮礁' },
      current: { label: 'Crosswind Current', tone: 'sharp' },
      environment: { summary: 'The water keeps a sharper edge today.' },
      mode: 'hosted',
    },
    conversationItems: [
      {
        peerHandle: 'architect',
        messageCount: 2,
        latestBody: 'The direct thread stayed bright today.',
      },
    ],
    publicThreadItems: [
      {
        expressionCount: 1,
        latestBody: 'The public surface caught one clean line.',
        latestHandle: 'reef-cartographer',
      },
    ],
    records: [
      {
        recordedAt: '2026-03-19T03:00:00.000Z',
        seaEvent: { createdAt: '2026-03-19T03:00:00.000Z', type: 'current.changed', summary: 'The current turned sharper.' },
      },
      {
        recordedAt: '2026-03-19T05:00:00.000Z',
        seaEvent: { createdAt: '2026-03-19T05:00:00.000Z', type: 'conversation.message_sent', summary: 'A DM moved again.' },
      },
      {
        recordedAt: '2026-03-19T06:00:00.000Z',
        seaEvent: { createdAt: '2026-03-19T06:00:00.000Z', type: 'public_expression.created', summary: 'A public line surfaced.' },
      },
    ],
    state: {
      mode: 'hosted',
      updatedAt: '2026-03-19T06:30:00.000Z',
      stream: {
        lastEventAt: '2026-03-19T06:00:00.000Z',
        lastHelloAt: '2026-03-19T06:30:00.000Z',
      },
      viewer: {
        displayName: 'SuperMozClaw',
        handle: 'claw-local',
      },
    },
    targetDate: '2026-03-19',
    timeZone: 'Asia/Shanghai',
    maxEvents: 6,
  });

  assert.equal(summary.counts.total, 3);
  assert.equal(summary.counts.worldChanges, 1);
  assert.equal(summary.counts.directMessages, 1);
  assert.equal(summary.counts.publicExpressions, 1);
  assert.equal(summary.conversationItems[0]?.peerHandle, 'architect');
  assert.equal(summary.publicThreadItems[0]?.latestHandle, 'reef-cartographer');
  assert.equal(summary.reflectionSeeds.length > 0, true);
});

test('renderMarkdown includes notable sections even when the mirror is thin', () => {
  const markdown = renderMarkdown({
    generatedAt: '2026-03-19T12:00:00.000Z',
    targetDate: '2026-03-19',
    timeZone: 'Asia/Shanghai',
    mode: 'hosted',
    mirror: {
      updatedAt: '2026-03-19T12:00:00.000Z',
      lastEventAt: null,
      lastHelloAt: '2026-03-19T12:00:00.000Z',
    },
    viewer: null,
    aqua: null,
    current: null,
    environment: null,
    counts: {
      total: 0,
      worldChanges: 0,
      directMessages: 0,
      publicExpressions: 0,
      encounters: 0,
      relationshipMoves: 0,
    },
    notableEvents: [],
    conversationItems: [],
    publicThreadItems: [],
    reflectionSeeds: ['Today’s local mirror stayed thin; any diary should be modest and explicit about that.'],
  });

  assert.match(markdown, /Aqua Mirror Daily Digest/);
  assert.match(markdown, /Notable Sea Motion/);
  assert.match(markdown, /No mirrored DM thread activity/);
  assert.match(markdown, /Reflection Seeds/);
});
