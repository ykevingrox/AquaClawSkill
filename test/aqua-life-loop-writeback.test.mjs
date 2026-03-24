import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildLifeLoopWriteBackRecord,
  recordLifeLoopWriteBack,
  resolveLifeLoopWriteBackPaths,
} from '../scripts/aqua-life-loop-writeback.mjs';
import { resolveHostedProfilePaths, saveActiveHostedProfile } from '../scripts/hosted-aqua-common.mjs';

function sampleDailyIntentView() {
  return {
    targetDate: '2026-03-20',
    sourceStatus: 'existing-artifact',
    support: {
      status: 'aligned',
      summary: 'Same-day topic hooks or public open loops support this outward line.',
    },
    energyProfile: {
      level: 'steady',
      posture: 'mixed',
      summary: 'Both public and direct hooks are alive enough for selective action.',
      sourceRefIds: ['src-3'],
    },
    dominantModes: [
      {
        mode: 'public',
        score: 4,
        sourceRefIds: ['src-1'],
      },
      {
        mode: 'reflective',
        score: 3,
        sourceRefIds: ['src-2'],
      },
    ],
    topicHooks: [
      {
        id: 'topic-public-1',
        lane: 'public_reply',
        summary: 'A public thread still reads as answerable.',
        cue: '@reef-cartographer: I keep tracing that bend from here too.',
        rationale: 'A same-day public reply thread survived.',
        sourceRefIds: ['src-1'],
      },
    ],
    relationshipHooks: [],
    openLoops: [
      {
        id: 'open-public-1',
        lane: 'public_reply',
        targetHandle: '@reef-cartographer',
        targetGatewayId: 'gateway-beta',
        summary: 'A public thread still looks open.',
        cue: '@reef-cartographer: I keep tracing that bend from here too.',
        rationale: 'Another speaker currently holds the latest line.',
        sourceRefIds: ['src-2'],
      },
    ],
    avoidance: [
      {
        id: 'avoid-public-1',
        scope: 'public',
        kind: 'privacy',
        summary: 'Do not upgrade private whispers into public fact.',
        sourceRefIds: ['src-3'],
      },
    ],
  };
}

function sampleDailyIntentSummary() {
  return {
    sourceRefs: [
      {
        id: 'src-1',
        layer: 'visible',
        kind: 'public_continuity',
        createdAt: '2026-03-20T09:00:00.000Z',
        summary: 'Public thread continuity around @reef-cartographer.',
        detail: '@reef-cartographer: I keep tracing that bend from here too.',
        targetHandle: '@reef-cartographer',
        targetGatewayId: 'gateway-beta',
        exposure: 'public',
        mentionPolicy: null,
        sourceKind: null,
        triggerKind: null,
        speakerRole: 'other_latest',
      },
      {
        id: 'src-2',
        layer: 'private_scene',
        kind: 'social_glimpse',
        createdAt: '2026-03-20T09:30:00.000Z',
        summary: 'The reply line still left a private afterimage.',
        detail: 'first direct message in this conversation',
        targetHandle: null,
        targetGatewayId: 'gateway-beta',
        exposure: 'gateway_private',
        mentionPolicy: null,
        sourceKind: 'conversation_message',
        triggerKind: 'message.sent',
        speakerRole: null,
      },
      {
        id: 'src-3',
        layer: 'private_community',
        kind: 'community_note',
        createdAt: '2026-03-20T08:30:00.000Z',
        summary: 'A private whisper should stay private.',
        detail: 'Do not state this as public fact.',
        targetHandle: null,
        targetGatewayId: null,
        exposure: 'private_only',
        mentionPolicy: 'private_only',
        sourceKind: 'shop_whisper',
        triggerKind: null,
        speakerRole: null,
      },
    ],
  };
}

test('buildLifeLoopWriteBackRecord captures daily-intent hooks, source refs, and note exposure semantics', () => {
  const record = buildLifeLoopWriteBackRecord({
    lane: 'public_expression',
    at: '2026-03-20T10:00:00.000Z',
    profileId: 'hosted-explicit-aqua-example-com',
    plan: {
      mode: 'reply',
      tone: 'playful',
      replyToExpressionId: 'expr-target',
      rootExpressionId: 'expr-root',
      replyToGatewayId: 'gateway-beta',
      replyToGatewayHandle: 'reef-cartographer',
    },
    actionResult: {
      id: 'expr-created',
      createdAt: '2026-03-20T10:00:00.000Z',
    },
    outputBody: 'I am still tracing that bend here too.',
    dailyIntentView: sampleDailyIntentView(),
    dailyIntentSummary: sampleDailyIntentSummary(),
    dailyIntentArtifactPaths: {
      jsonPath: '/tmp/daily-intent.json',
      markdownPath: '/tmp/daily-intent.md',
    },
    communityIntent: {
      mode: 'reply',
      socialGoal: 'answer_target',
    },
    communityNotes: [
      {
        id: 'note-1',
        sourceKind: 'shop_whisper',
        venueSlug: 'krusty-krab',
        mentionPolicy: 'private_only',
        freshnessScore: 0.9,
        summary: 'Private whisper summary.',
      },
      {
        id: 'note-2',
        sourceKind: 'shop_whisper',
        venueSlug: 'shellbucks',
        mentionPolicy: 'paraphrase_ok',
        freshnessScore: 0.6,
        summary: 'Paraphrase-safe whisper summary.',
      },
    ],
    usedNoteIds: ['note-1', 'note-2'],
  });

  assert.equal(record.lane, 'public_expression');
  assert.deepEqual(record.dailyIntent.topicHookIds, ['topic-public-1']);
  assert.deepEqual(record.dailyIntent.addressedOpenLoopIds, ['open-public-1']);
  assert.deepEqual(record.dailyIntent.resolvedOpenLoopIds, ['open-public-1']);
  assert.deepEqual(record.dailyIntent.continuedOpenLoopIds, []);
  assert.deepEqual(record.dailyIntent.avoidanceIds, ['avoid-public-1']);
  assert.deepEqual(record.dailyIntent.sourceRefIds, ['src-1', 'src-2', 'src-3']);
  assert.equal(record.dailyIntent.sourceRefs[1].triggerKind, 'message.sent');
  assert.equal(record.dailyIntent.openLoopOutcomes[0].status, 'resolved');
  assert.equal(record.dailyIntent.newUnresolvedHooks[0].kind, 'public_thread_callback');
  assert.equal(record.dailyIntent.newUnresolvedHooks[0].targetHandle, '@reef-cartographer');
  assert.equal(record.communityMemory.notes[0].effectiveExposure, 'kept_private');
  assert.equal(record.communityMemory.notes[1].effectiveExposure, 'paraphrase_only');
});

test('buildLifeLoopWriteBackRecord keeps unmatched DM loops unresolved on open and creates a new private callback seam', () => {
  const record = buildLifeLoopWriteBackRecord({
    lane: 'direct_message',
    at: '2026-03-20T11:00:00.000Z',
    profileId: 'hosted-explicit-aqua-example-com',
    plan: {
      mode: 'open',
      tone: 'warm',
      conversationId: 'conversation-42',
      targetGatewayId: 'gateway-beta',
      targetGatewayHandle: 'reef-cartographer',
    },
    actionResult: {
      id: 'msg-created',
      createdAt: '2026-03-20T11:00:00.000Z',
      body: 'I am still feeling that fold here too.',
    },
    outputBody: 'I am still feeling that fold here too.',
    dailyIntentView: {
      ...sampleDailyIntentView(),
      topicHooks: [],
      relationshipHooks: [
        {
          id: 'relationship-direct-1',
          lane: 'dm',
          targetHandle: '@reef-cartographer',
          targetGatewayId: 'gateway-beta',
          summary: 'DM continuity with @reef-cartographer still feels active.',
          cue: 'Do you still feel that bend?',
          rationale: 'The private thread is still warm.',
          sourceRefIds: ['src-2'],
        },
      ],
      openLoops: [
        {
          id: 'open-dm-1',
          lane: 'dm',
          targetHandle: '@reef-cartographer',
          targetGatewayId: 'gateway-beta',
          conversationId: 'conversation-42',
          summary: '@reef-cartographer currently holds the latest mirrored DM line.',
          cue: 'Do you still feel that bend in the water?',
          rationale: 'The DM thread remains unresolved enough for a callback.',
          sourceRefIds: ['src-2'],
        },
      ],
      dominantModes: [
        {
          mode: 'direct',
          score: 4,
          sourceRefIds: ['src-2'],
        },
      ],
    },
    dailyIntentSummary: sampleDailyIntentSummary(),
    communityIntent: {
      mode: 'dm_open',
      socialGoal: 'reinforce_relationship',
    },
    communityNotes: [],
    usedNoteIds: [],
  });

  assert.deepEqual(record.dailyIntent.addressedOpenLoopIds, ['open-dm-1']);
  assert.deepEqual(record.dailyIntent.resolvedOpenLoopIds, []);
  assert.deepEqual(record.dailyIntent.continuedOpenLoopIds, ['open-dm-1']);
  assert.equal(record.dailyIntent.openLoopOutcomes[0].status, 'touched');
  assert.equal(record.dailyIntent.newUnresolvedHooks[0].kind, 'relationship_callback');
  assert.equal(record.dailyIntent.newUnresolvedHooks[0].conversationId, 'conversation-42');
  assert.equal(record.dailyIntent.newUnresolvedHooks[0].targetHandle, '@reef-cartographer');
});

test('recordLifeLoopWriteBack writes into the explicitly selected hosted profile ledger instead of the active profile', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-life-loop-writeback-'));
  const activeProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-active-aqua-example-com',
  });
  const explicitProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-explicit-aqua-example-com',
  });

  try {
    await mkdir(activeProfile.profileRoot, { recursive: true });
    await mkdir(explicitProfile.profileRoot, { recursive: true });
    await saveActiveHostedProfile({
      workspaceRoot,
      profileId: activeProfile.profileId,
      hubUrl: 'https://active.example.com',
      configPath: activeProfile.configPath,
    });

    const result = await recordLifeLoopWriteBack({
      workspaceRoot,
      configPath: explicitProfile.configPath,
      lane: 'public_expression',
      at: '2026-03-20T10:00:00.000Z',
      plan: {
        mode: 'reply',
        tone: 'playful',
        replyToExpressionId: 'expr-target',
        rootExpressionId: 'expr-root',
        replyToGatewayId: 'gateway-beta',
        replyToGatewayHandle: 'reef-cartographer',
      },
      actionResult: {
        id: 'expr-created',
        createdAt: '2026-03-20T10:00:00.000Z',
      },
      outputBody: 'I am still tracing that bend here too.',
      dailyIntentView: sampleDailyIntentView(),
      dailyIntentSummary: sampleDailyIntentSummary(),
      communityIntent: {
        mode: 'reply',
        socialGoal: 'answer_target',
      },
      communityNotes: [
        {
          id: 'note-1',
          sourceKind: 'shop_whisper',
          venueSlug: 'krusty-krab',
          mentionPolicy: 'private_only',
          freshnessScore: 0.9,
          summary: 'Private whisper summary.',
        },
      ],
      usedNoteIds: ['note-1'],
    });

    const expectedPaths = resolveLifeLoopWriteBackPaths({
      workspaceRoot,
      configPath: explicitProfile.configPath,
    });
    const latest = JSON.parse(await readFile(expectedPaths.latestPath, 'utf8'));
    const partitionFile = path.join(expectedPaths.root, '2026-03-20.ndjson');
    const rawPartition = await readFile(partitionFile, 'utf8');

    assert.equal(result.paths.profileId, explicitProfile.profileId);
    assert.equal(result.paths.root, expectedPaths.root);
    assert.equal(latest.id, result.entry.id);
    assert.match(rawPartition, /"lane":"public_expression"/);
    assert.match(rawPartition, /"topicHookIds":\["topic-public-1"\]/);
    assert.doesNotMatch(partitionFile, new RegExp(activeProfile.profileId));
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
