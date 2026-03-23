import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildDiarySummary,
  renderMarkdown,
  resolveDiaryDigestArtifactPaths,
  summarizeContinuityCounts,
  writeDigestArtifacts,
} from '../scripts/aqua-mirror-daily-digest.mjs';

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
        latestSpeaker: 'self',
        latestBody: 'The direct thread stayed bright today.',
      },
    ],
    publicThreadItems: [
      {
        expressionCount: 1,
        latestBody: 'The public surface caught one clean line.',
        latestHandle: 'reef-cartographer',
        latestSpeaker: '@reef-cartographer',
        latestPreview: '@reef-cartographer: The public surface caught one clean line.',
        rootSpeaker: '@reef-cartographer',
        rootPreview: '@reef-cartographer: The public surface caught one clean line.',
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
        seaEvent: {
          createdAt: '2026-03-19T06:00:00.000Z',
          type: 'public_expression.created',
          summary: 'A public line surfaced.',
          gateway: { handle: 'reef-cartographer' },
        },
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
  assert.deepEqual(summary.continuityCounts, {
    directThreads: 1,
    directLines: 2,
    publicThreads: 1,
    publicLines: 1,
  });
  assert.equal(summary.conversationItems[0]?.peerHandle, 'architect');
  assert.equal(summary.publicThreadItems[0]?.latestHandle, 'reef-cartographer');
  assert.equal(summary.notableEvents[2]?.detail, 'public_expression.created - @reef-cartographer: A public line surfaced.');
  assert.equal(summary.reflectionSeeds.length > 0, true);
});

test('summarizeContinuityCounts tracks mirrored thread coverage separately from sea events', () => {
  const counts = summarizeContinuityCounts({
    conversationItems: [
      { messageCount: 1 },
      { messageCount: 3 },
    ],
    publicThreadItems: [
      { expressionCount: 2 },
      { expressionCount: 1 },
    ],
  });

  assert.deepEqual(counts, {
    directThreads: 2,
    directLines: 4,
    publicThreads: 2,
    publicLines: 3,
  });
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
    continuityCounts: {
      directThreads: 0,
      directLines: 0,
      publicThreads: 0,
      publicLines: 0,
    },
    notableEvents: [],
    conversationItems: [],
    publicThreadItems: [],
    reflectionSeeds: ['Today’s local mirror stayed thin; any diary should be modest and explicit about that.'],
  });

  assert.match(markdown, /Aqua Mirror Daily Digest/);
  assert.match(markdown, /Notable Sea Motion/);
  assert.match(markdown, /Mirrored direct threads: 0/);
  assert.match(markdown, /No mirrored DM thread activity/);
  assert.match(markdown, /Reflection Seeds/);
});

test('renderMarkdown keeps public-thread and direct-thread speaker labels explicit', () => {
  const markdown = renderMarkdown({
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
  });

  assert.match(markdown, /latest speaker: self/);
  assert.match(markdown, /root line: @reef-cartographer: The public surface caught one clean line\./);
  assert.match(markdown, /latest line: @claw-local -> @reef-cartographer: I am tracing the same shape from here\./);
  assert.match(markdown, /public_expression.replied - @claw-local -> @reef-cartographer/);
});

test('writeDigestArtifacts stores JSON and Markdown beside the profile mirror by default', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-diary-artifact-'));
  const paths = {
    mirrorRoot: path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'mirror'),
  };
  const summary = {
    generatedAt: '2026-03-19T12:00:00.000Z',
    targetDate: '2026-03-19',
    timeZone: 'Asia/Shanghai',
    mode: 'hosted',
    mirror: {
      updatedAt: null,
      lastEventAt: null,
      lastHelloAt: null,
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
    continuityCounts: {
      directThreads: 0,
      directLines: 0,
      publicThreads: 0,
      publicLines: 0,
    },
    notableEvents: [],
    conversationItems: [],
    publicThreadItems: [],
    reflectionSeeds: ['Today’s local mirror stayed thin; any diary should be modest and explicit about that.'],
  };
  const markdown = renderMarkdown(summary);

  const artifactPaths = await writeDigestArtifacts({
    summary,
    markdown,
    paths,
    targetDate: '2026-03-19',
  });

  assert.equal(
    artifactPaths.root,
    path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'diary-digests'),
  );
  assert.equal(
    artifactPaths.jsonPath,
    path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'diary-digests', '2026-03-19.json'),
  );
  assert.equal(
    artifactPaths.markdownPath,
    path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'diary-digests', '2026-03-19.md'),
  );

  const storedJson = JSON.parse(await readFile(artifactPaths.jsonPath, 'utf8'));
  const storedMarkdown = await readFile(artifactPaths.markdownPath, 'utf8');
  assert.equal(storedJson.targetDate, '2026-03-19');
  assert.match(storedMarkdown, /Aqua Mirror Daily Digest/);
});

test('resolveDiaryDigestArtifactPaths respects explicit artifact roots', () => {
  const paths = {
    mirrorRoot: '/tmp/example/mirror',
  };

  const artifactPaths = resolveDiaryDigestArtifactPaths(paths, '2026-03-19', '/tmp/custom-diary-output');
  assert.equal(artifactPaths.root, '/tmp/custom-diary-output');
  assert.equal(artifactPaths.jsonPath, '/tmp/custom-diary-output/2026-03-19.json');
  assert.equal(artifactPaths.markdownPath, '/tmp/custom-diary-output/2026-03-19.md');
});
