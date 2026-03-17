import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildMirrorEnvelopeReport, buildMirrorPressureProfile, renderMirrorEnvelopeMarkdown } from './aqua-mirror-envelope.mjs';

test('buildMirrorPressureProfile reports zero polling and bounded resync requests', () => {
  const profile = buildMirrorPressureProfile({
    mode: 'hosted',
    hydrateConversations: true,
    hydratePublicThreads: true,
    publicThreadLimit: 20,
    reconnectSeconds: 5,
    freshnessWindowSeconds: 1200,
  });

  assert.equal(profile.startup.httpRequestsBeforeStream, 8);
  assert.equal(profile.steadyState.backgroundPollingHttpRequestsPerMinute, 0);
  assert.equal(profile.recovery.resyncRequired.maxSeaFeedRequests, 3);
  assert.equal(profile.recovery.resyncRequired.contextRefreshRequestsAfterRepair, 6);
});

test('buildMirrorEnvelopeReport summarizes footprint, logs, and selected profile', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-mirror-envelope-'));
  const mirrorRoot = path.join(workspaceRoot, '.aquaclaw', 'mirror');
  const contextDir = path.join(mirrorRoot, 'context');
  const seaEventsDir = path.join(mirrorRoot, 'sea-events');
  const conversationsDir = path.join(mirrorRoot, 'conversations');
  const logDir = path.join(workspaceRoot, 'logs');

  await mkdir(contextDir, { recursive: true });
  await mkdir(seaEventsDir, { recursive: true });
  await mkdir(conversationsDir, { recursive: true });
  await mkdir(logDir, { recursive: true });

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
          lastError: null,
        },
        mirror: {
          lastContextSyncAt: '2026-03-17T08:05:00.000Z',
          lastConversationIndexSyncAt: '2026-03-17T08:02:00.000Z',
          lastConversationThreadSyncAt: '2026-03-17T08:02:30.000Z',
          lastPublicThreadSyncAt: null,
        },
        gapRepair: {
          lastVisibleFeedEventId: 'evt_visible',
          lastAttemptAt: '2026-03-17T08:06:00.000Z',
          lastCompletedAt: '2026-03-17T08:06:01.000Z',
          lastStatus: 'recovered',
          lastReason: 'cursor_outside_replay_window',
          scannedPageCount: 2,
          recoveredEventCount: 3,
          anchorSeaEventId: 'evt_anchor',
          newestRecoveredSeaEventId: 'evt_new',
          oldestRecoveredSeaEventId: 'evt_old',
        },
        recentDeliveries: [],
        conversations: {
          items: [],
          byId: {
            cv_123: {
              syncedAt: '2026-03-17T08:02:30.000Z',
              file: 'conversations/cv_123.json',
              messageCount: 1,
              lastMessageId: 'msg_1',
            },
          },
        },
        publicThreads: {
          byRootId: {},
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
  await writeFile(path.join(seaEventsDir, '2026-03-17.ndjson'), '{"id":"evt_1"}\n');
  await writeFile(path.join(conversationsDir, 'index.json'), JSON.stringify({ version: 1 }, null, 2));
  await writeFile(path.join(conversationsDir, 'cv_123.json'), JSON.stringify({ version: 1 }, null, 2));
  await writeFile(path.join(logDir, 'mirror.log'), 'mirror started\n');
  await writeFile(path.join(logDir, 'mirror.err.log'), '');

  const report = await buildMirrorEnvelopeReport({
    workspaceRoot,
    mode: 'hosted',
    maxAgeSeconds: 1200,
    now: '2026-03-17T08:10:00.000Z',
    stdoutLog: path.join(logDir, 'mirror.log'),
    stderrLog: path.join(logDir, 'mirror.err.log'),
  });

  assert.equal(report.selectedMode, 'hosted');
  assert.equal(report.status.status, 'fresh');
  assert.equal(report.footprint.byClassification.cache.fileCount, 3);
  assert.equal(report.footprint.byClassification['memory-source'].fileCount, 2);
  assert.equal(report.logs.stdout.present, true);
  assert.equal(report.currentMirrorState.conversationThreads, 1);

  const markdown = renderMirrorEnvelopeMarkdown(report);
  assert.match(markdown, /## Selected Pressure Profile/);
  assert.match(markdown, /## Mirror Footprint/);
  assert.match(markdown, /## Logs/);
});
