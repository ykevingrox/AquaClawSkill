import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeJsonFile } from '../scripts/aqua-mirror-common.mjs';
import {
  buildMemorySynthesis,
  generateMemorySynthesis,
  renderMemorySynthesisMarkdown,
  resolveMemorySynthesisArtifactPaths,
} from '../scripts/aqua-mirror-memory-synthesis.mjs';

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

async function writeDigestArtifact(workspaceRoot, digestSummary) {
  const mirrorRoot = path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'mirror');
  const digestRoot = path.join(workspaceRoot, '.aquaclaw', 'profiles', 'hosted-aqua-example-com', 'diary-digests');
  await mkdir(mirrorRoot, { recursive: true });
  await writeJsonFile(path.join(digestRoot, `${digestSummary.targetDate}.json`), digestSummary);
  return {
    mirrorRoot,
    digestRoot,
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

test('buildMemorySynthesis keeps self motion and public continuity explicit', () => {
  const summary = buildMemorySynthesis({
    digestSummary: sampleDigestSummary(),
    digestSource: {
      status: 'existing-artifact',
      artifactPaths: {
        jsonPath: '/tmp/diary-digests/2026-03-19.json',
        markdownPath: '/tmp/diary-digests/2026-03-19.md',
      },
    },
  });
  const markdown = renderMemorySynthesisMarkdown(summary);

  assert.equal(summary.source.digest.status, 'existing-artifact');
  assert.deepEqual(summary.continuityCounts, {
    directThreads: 1,
    directLines: 1,
    publicThreads: 1,
    publicLines: 2,
  });
  assert.match(summary.selfMotion[0], /DM with @architect currently ends on a self line/);
  assert.match(summary.selfMotion[1], /Public surface latest line stays self-authored/);
  assert.match(summary.otherVoices[0], /@architect remains part of the direct continuity set/);
  assert.equal(summary.publicContinuity[0]?.latestSpeaker, '@claw-local -> @reef-cartographer');
  assert.match(summary.seaMood.activitySummary, /1 active DM thread/);
  assert.match(markdown, /## Self Motion/);
  assert.match(markdown, /## Continuity Coverage/);
  assert.match(markdown, /root @reef-cartographer; latest @claw-local -> @reef-cartographer/);
});

test('generateMemorySynthesis reuses an existing diary digest artifact by default', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-memory-synthesis-existing-'));
  const digestSummary = sampleDigestSummary();
  const { mirrorRoot, digestRoot } = await writeDigestArtifact(workspaceRoot, digestSummary);

  const result = await generateMemorySynthesis({
    mirrorDir: mirrorRoot,
    date: '2026-03-19',
    timeZone: 'Asia/Shanghai',
  });

  assert.equal(result.summary.source.digest.status, 'existing-artifact');
  assert.equal(result.summary.source.digest.jsonPath, path.join(digestRoot, '2026-03-19.json'));
  assert.equal(result.digestSource.status, 'existing-artifact');
  assert.equal(result.summary.continuityCounts.directThreads, 1);
  assert.match(result.markdown, /Aqua Mirror Memory Synthesis/);
  assert.match(result.markdown, /Digest JSON:/);
});

test('generateMemorySynthesis can build a missing digest artifact and persist synthesis artifacts', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-memory-synthesis-build-'));
  const mirrorRoot = await writeMirrorFixture(workspaceRoot);

  const result = await generateMemorySynthesis({
    mirrorDir: mirrorRoot,
    date: '2026-03-19',
    timeZone: 'Asia/Shanghai',
    buildIfMissing: true,
    writeArtifact: true,
  });

  const digestJsonPath = path.join(path.dirname(mirrorRoot), 'diary-digests', '2026-03-19.json');
  const synthesisPaths = resolveMemorySynthesisArtifactPaths(
    { mirrorRoot },
    '2026-03-19',
  );
  const storedDigest = JSON.parse(await readFile(digestJsonPath, 'utf8'));
  const storedSynthesis = JSON.parse(await readFile(synthesisPaths.jsonPath, 'utf8'));
  const storedMarkdown = await readFile(synthesisPaths.markdownPath, 'utf8');

  assert.equal(result.summary.source.digest.status, 'built-artifact');
  assert.equal(result.summary.counts.directMessages, 0);
  assert.equal(result.summary.continuityCounts.directThreads, 1);
  assert.equal(storedDigest.targetDate, '2026-03-19');
  assert.equal(storedDigest.continuityCounts.directThreads, 1);
  assert.equal(storedSynthesis.targetDate, '2026-03-19');
  assert.match(storedMarkdown, /## Caveats/);
  assert.match(storedMarkdown, /DM continuity survived through mirrored thread state/);
  assert.match(storedMarkdown, /Public surface latest line stays self-authored/);
  assert.equal(result.artifactPaths?.jsonPath, synthesisPaths.jsonPath);
});
