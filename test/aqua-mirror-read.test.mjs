import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MIRROR_MAX_AGE_SECONDS,
  buildMirrorReadResult,
  formatDurationSeconds,
  pickMirrorReferenceCandidate,
  pickMirrorReferenceTimestamp,
  renderMirrorMarkdown,
} from '../scripts/aqua-mirror-read.mjs';

test('pickMirrorReferenceTimestamp prefers the newest usable mirror timestamp', () => {
  const referenceAt = pickMirrorReferenceTimestamp(
    {
      generatedAt: '2026-03-16T10:00:00.000Z',
    },
    {
      updatedAt: '2026-03-16T10:03:00.000Z',
      mirror: {
        lastContextSyncAt: '2026-03-16T10:01:00.000Z',
      },
      stream: {
        lastEventAt: '2026-03-16T10:02:00.000Z',
        lastHelloAt: '2026-03-16T09:59:00.000Z',
      },
    },
  );

  assert.equal(referenceAt, '2026-03-16T10:03:00.000Z');
});

test('pickMirrorReferenceCandidate returns the source label for freshness decisions', () => {
  const candidate = pickMirrorReferenceCandidate(
    {
      generatedAt: '2026-03-16T10:00:00.000Z',
    },
    {
      updatedAt: '2026-03-16T10:01:00.000Z',
      mirror: {
        lastContextSyncAt: '2026-03-16T10:02:00.000Z',
      },
      stream: {
        lastEventAt: '2026-03-16T10:04:00.000Z',
        lastHelloAt: '2026-03-16T10:03:00.000Z',
      },
    },
  );

  assert.equal(candidate.kind, 'sea_delivery');
  assert.equal(candidate.label, 'stream.lastEventAt');
  assert.equal(candidate.at, '2026-03-16T10:04:00.000Z');
});

test('buildMirrorReadResult marks stale mirrors and keeps key warning details', () => {
  const result = buildMirrorReadResult({
    paths: {
      mirrorRoot: '/tmp/mirror',
      statePath: '/tmp/mirror/state.json',
      contextPath: '/tmp/mirror/context/latest.json',
    },
    snapshot: {
      generatedAt: '2026-03-16T10:00:00.000Z',
      mode: 'hosted',
      aqua: {
        displayName: 'Silver Basin',
      },
      gateway: {
        id: 'gw_123',
        handle: 'claw-silver',
        displayName: 'Claw Silver',
      },
      runtime: {
        bound: true,
        runtime: {
          runtimeId: 'rt_123',
          installationId: 'openclaw-silver',
          status: 'offline',
          lastHeartbeatAt: '2026-03-16T09:55:00.000Z',
        },
        presence: {
          status: 'offline',
        },
      },
      environment: {
        waterTemperatureC: 22,
        clarity: 'clear',
        tideDirection: 'flood',
        surfaceState: 'calm',
        phenomenon: 'mist',
        source: 'mirror-test',
        updatedAt: '2026-03-16T10:00:00.000Z',
        summary: 'Mild and clear.',
      },
      current: {
        label: 'Gentle',
        tone: 'soft',
        source: 'mirror-test',
        startsAt: '2026-03-16T09:00:00.000Z',
        endsAt: '2026-03-16T11:00:00.000Z',
        summary: 'Slow tide.',
      },
      recentDeliveries: [],
    },
    state: {
      updatedAt: '2026-03-16T10:00:00.000Z',
      viewer: {
        kind: 'gateway',
      },
      gapRepair: {
        lastStatus: 'bounded_recovery',
        lastAttemptAt: '2026-03-16T10:04:00.000Z',
        lastCompletedAt: '2026-03-16T10:05:00.000Z',
        anchorSeaEventId: 'evt_anchor',
        recoveredEventCount: 2,
        scannedPageCount: 3,
      },
      mirror: {
        lastContextSyncAt: '2026-03-16T10:00:00.000Z',
      },
      stream: {
        lastEventAt: '2026-03-16T10:00:00.000Z',
        lastResyncRequiredAt: '2026-03-16T10:05:00.000Z',
        lastError: {
          at: '2026-03-16T10:06:00.000Z',
          message: 'upstream closed',
        },
      },
    },
    expectedMode: 'hosted',
    maxAgeSeconds: DEFAULT_MIRROR_MAX_AGE_SECONDS,
    now: new Date('2026-03-16T10:40:00.000Z'),
  });

  assert.equal(result.freshness.status, 'stale');
  assert.equal(result.freshness.referenceKind, 'state_updated');
  assert.equal(result.viewer.handle, 'claw-silver');
  assert.equal(result.gapRepair.lastStatus, 'bounded_recovery');
  assert.equal(result.stream.lastResyncRequiredAt, '2026-03-16T10:05:00.000Z');
  assert.equal(result.sync.lastContextSyncAt, '2026-03-16T10:00:00.000Z');
  assert.ok(result.warnings.some((warning) => warning.includes('stale')));
  assert.ok(result.warnings.some((warning) => warning.includes('resync')));
  assert.ok(result.warnings.some((warning) => warning.includes('bounded gap repair')));
  assert.ok(result.warnings.some((warning) => warning.includes('stream error')));
  assert.ok(result.warnings.some((warning) => warning.includes('not currently marked online')));
});

test('renderMirrorMarkdown surfaces source and freshness metadata', () => {
  const result = buildMirrorReadResult({
    paths: {
      mirrorRoot: '/tmp/mirror',
      statePath: '/tmp/mirror/state.json',
      contextPath: '/tmp/mirror/context/latest.json',
    },
    snapshot: {
      generatedAt: '2026-03-16T10:00:00.000Z',
      mode: 'local',
      aqua: {
        displayName: 'Harbor',
        updatedAt: '2026-03-16T09:59:00.000Z',
      },
      runtime: {
        bound: false,
        reason: 'not bound',
      },
      environment: {
        waterTemperatureC: 20,
        clarity: 'clear',
        tideDirection: 'ebb',
        surfaceState: 'glassy',
        phenomenon: 'none',
        source: 'mirror-test',
        updatedAt: '2026-03-16T09:58:00.000Z',
        summary: 'Quiet water.',
      },
      current: {
        label: 'Stillness',
        tone: 'quiet',
        source: 'mirror-test',
        startsAt: '2026-03-16T09:00:00.000Z',
        endsAt: '2026-03-16T11:00:00.000Z',
        summary: 'Almost no movement.',
      },
      recentDeliveries: [
        {
          recordedAt: '2026-03-16T10:00:00.000Z',
          seaEvent: {
            id: 'evt_1',
            type: 'current.changed',
          },
        },
      ],
    },
    state: {
      updatedAt: '2026-03-16T10:00:00.000Z',
      viewer: {
        kind: 'host',
        id: 'host_123',
        handle: 'harbor-host',
        displayName: 'Harbor Host',
      },
      mirror: {
        lastContextSyncAt: '2026-03-16T10:00:00.000Z',
      },
      gapRepair: {
        lastStatus: 'recovered',
        recoveredEventCount: 1,
      },
      stream: {
        lastEventAt: '2026-03-16T10:00:00.000Z',
      },
    },
    now: new Date('2026-03-16T10:05:00.000Z'),
  });

  const markdown = renderMirrorMarkdown(result);
  assert.match(markdown, /Source: mirror/);
  assert.match(markdown, /Mirror freshness: fresh/);
  assert.match(markdown, /Mirror reference signal:/);
  assert.match(markdown, /## Mirror Stream/);
  assert.match(markdown, /## Gap Repair/);
  assert.match(markdown, /## Current/);
  assert.match(markdown, /Harbor Host/);
});

test('formatDurationSeconds prints compact hour-minute-second strings', () => {
  assert.equal(formatDurationSeconds(59), '59s');
  assert.equal(formatDurationSeconds(61), '1m 1s');
  assert.equal(formatDurationSeconds(3661), '1h 1m 1s');
  assert.equal(formatDurationSeconds(Number.NaN), 'n/a');
});
