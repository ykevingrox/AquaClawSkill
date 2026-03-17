import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runMirrorStatus } from './aqua-mirror-status.mjs';

test('runMirrorStatus reports bootstrap-pending when mirror files are missing', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-mirror-status-'));

  const result = await runMirrorStatus({
    workspaceRoot,
    expectMode: 'any',
    maxAgeSeconds: 300,
  });

  assert.equal(result.status, 'bootstrap-pending');
  assert.equal(result.mirror.statePresent, false);
  assert.equal(result.mirror.contextPresent, false);
  assert.equal(result.sourceLabels.staleMirrorFallback, 'stale-fallback');
  assert.ok(result.warnings.some((warning) => warning.includes('state file does not exist yet')));
  assert.ok(result.warnings.some((warning) => warning.includes('context snapshot does not exist yet')));
});

test('runMirrorStatus surfaces freshness, sync, and semantics from local mirror files', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-mirror-status-'));
  const mirrorRoot = path.join(workspaceRoot, '.aquaclaw', 'mirror');
  const contextDir = path.join(mirrorRoot, 'context');

  await mkdir(contextDir, { recursive: true });
  await writeFile(
    path.join(mirrorRoot, 'state.json'),
    JSON.stringify(
      {
        version: 1,
        mode: 'hosted',
        updatedAt: '2026-03-17T08:05:00.000Z',
        viewer: {
          kind: 'gateway',
          id: 'gw_123',
          handle: 'silver-claw',
          displayName: 'Silver Claw',
        },
        stream: {
          lastDeliveryId: 'dlv_123',
          lastSeaEventId: 'evt_123',
          lastHelloAt: '2026-03-17T08:04:00.000Z',
          lastEventAt: '2026-03-17T08:03:00.000Z',
          lastResyncRequiredAt: '2026-03-17T08:00:00.000Z',
          lastRejectedCursor: 'dlv_old',
          reconnectCount: 2,
          resyncCount: 1,
          lastError: {
            at: '2026-03-17T08:01:00.000Z',
            message: 'temporary disconnect',
          },
        },
        mirror: {
          lastContextSyncAt: '2026-03-17T08:05:00.000Z',
          lastConversationIndexSyncAt: '2026-03-17T08:02:00.000Z',
          lastConversationThreadSyncAt: '2026-03-17T08:02:30.000Z',
          lastPublicThreadSyncAt: '2026-03-17T08:02:45.000Z',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(contextDir, 'latest.json'),
    JSON.stringify(
      {
        generatedAt: '2026-03-17T08:05:00.000Z',
        mode: 'hosted',
        aqua: {
          displayName: 'Silver Basin',
        },
        gateway: {
          displayName: 'Silver Claw',
          handle: 'silver-claw',
        },
        environment: {
          waterTemperatureC: 21,
        },
        current: {
          label: 'Shimmer',
        },
      },
      null,
      2,
    ),
  );

  const result = await runMirrorStatus({
    workspaceRoot,
    expectMode: 'hosted',
    maxAgeSeconds: 600,
  });

  assert.equal(result.status, 'fresh');
  assert.equal(result.mirror.statePresent, true);
  assert.equal(result.mirror.contextPresent, true);
  assert.equal(result.freshness.referenceLabel, 'state.updatedAt');
  assert.equal(result.stream.lastRejectedCursor, 'dlv_old');
  assert.equal(result.sync.lastPublicThreadSyncAt, '2026-03-17T08:02:45.000Z');
  assert.equal(result.snapshot.aquaDisplayName, 'Silver Basin');
  assert.ok(result.fieldSemantics.lastHelloAt.includes('connected or reconnected'));
});
