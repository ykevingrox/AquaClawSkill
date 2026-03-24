import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeJsonFile } from '../scripts/aqua-mirror-common.mjs';
import {
  formatLifeLoopBriefMarkdown,
  readLifeLoop,
  summarizeLifeLoopForBrief,
} from '../scripts/aqua-life-loop-read.mjs';
import { resolveHostedProfilePaths, saveActiveHostedProfile } from '../scripts/hosted-aqua-common.mjs';

function buildDailyIntentSummary(targetDate, overrides = {}) {
  return {
    generatedAt: `${targetDate}T08:00:00.000Z`,
    targetDate,
    timeZone: 'Asia/Shanghai',
    mode: 'hosted',
    dominantModes: [
      {
        mode: 'public',
        score: 4,
        summary: 'Public motion still has enough live charge for selective replies.',
        sourceRefIds: ['src-visible'],
      },
      {
        mode: 'reflective',
        score: 3,
        summary: 'Private afterimages still matter, but do not need to dominate.',
        sourceRefIds: ['src-scene'],
      },
    ],
    topicHooks: [
      {
        id: 'topic-public-1',
        lane: 'public_reply',
        summary: 'A public thread still reads as answerable.',
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
        cue: '@reef-cartographer: Then follow it one more step.',
        rationale: 'Another speaker still owns the latest visible line.',
        sourceRefIds: ['src-visible'],
      },
    ],
    avoidance: [
      {
        id: 'avoid-public-1',
        scope: 'public',
        kind: 'privacy',
        summary: 'Do not upgrade private whispers into public fact.',
        sourceRefIds: ['src-private-note'],
      },
    ],
    energyProfile: {
      level: 'steady',
      posture: 'mixed',
      summary: 'Public and private hooks are both alive enough for selective action.',
    },
    sourceRefs: [
      {
        id: 'src-visible',
        layer: 'visible',
        kind: 'public_continuity',
        createdAt: `${targetDate}T07:40:00.000Z`,
        summary: 'Public thread continuity around @reef-cartographer.',
        targetHandle: '@reef-cartographer',
        exposure: 'public',
      },
      {
        id: 'src-private-note',
        layer: 'private_community',
        kind: 'community_note',
        createdAt: `${targetDate}T06:50:00.000Z`,
        summary: 'Private source summary that should stay redacted.',
        exposure: 'private_only',
        mentionPolicy: 'private_only',
      },
    ],
    ...overrides,
  };
}

function buildWriteBackEntry(recordedDate, overrides = {}) {
  return {
    version: 1,
    id: 'writeback-1',
    recordedAt: `${recordedDate}T10:00:00.000Z`,
    recordedDate,
    origin: 'hosted_pulse',
    lane: 'public_expression',
    profileId: 'hosted-explicit-aqua-example-com',
    output: {
      kind: 'public_expression',
      actionId: 'expr-created',
      createdAt: `${recordedDate}T10:00:00.000Z`,
      mode: 'reply',
      tone: 'playful',
      bodyPreview: 'I am still tracing that bend here too.',
      targetGatewayHandle: '@reef-cartographer',
      targetGatewayId: 'gateway-beta',
      rootExpressionId: 'expr-root',
      replyToExpressionId: 'expr-target',
    },
    dailyIntent: {
      targetDate: recordedDate,
      sourceStatus: 'existing-artifact',
      energyProfile: {
        level: 'steady',
        posture: 'mixed',
        summary: 'Public and private hooks are both alive enough for selective action.',
      },
      dominantModes: [
        {
          mode: 'public',
          score: 4,
        },
      ],
      topicHookIds: ['topic-public-1'],
      relationshipHookIds: [],
      addressedOpenLoopIds: ['open-public-1'],
      resolvedOpenLoopIds: ['open-public-1'],
      continuedOpenLoopIds: [],
      openLoopOutcomes: [
        {
          id: 'open-public-1',
          status: 'resolved',
        },
      ],
      newUnresolvedHooks: [
        {
          id: 'generated-public-1',
          lane: 'public_reply',
          kind: 'public_thread_callback',
          createdAt: `${recordedDate}T10:00:00.000Z`,
          targetHandle: '@reef-cartographer',
          summary: 'This new public reply may keep the thread with @reef-cartographer open.',
        },
      ],
      avoidanceIds: ['avoid-public-1'],
      sourceRefIds: ['src-visible', 'src-private-note'],
      sourceRefs: [
        {
          id: 'src-visible',
          layer: 'visible',
          kind: 'public_continuity',
          createdAt: `${recordedDate}T07:40:00.000Z`,
          summary: 'Public thread continuity around @reef-cartographer.',
          targetHandle: '@reef-cartographer',
          exposure: 'public',
          mentionPolicy: null,
          triggerKind: null,
        },
        {
          id: 'src-private-note',
          layer: 'private_community',
          kind: 'community_note',
          createdAt: `${recordedDate}T06:50:00.000Z`,
          summary: 'Private source summary that should stay redacted.',
          targetHandle: null,
          exposure: 'private_only',
          mentionPolicy: 'private_only',
          triggerKind: null,
        },
      ],
    },
    communityMemory: {
      intentMode: 'reply',
      socialGoal: 'answer_target',
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
          summary: 'This private note summary should stay redacted.',
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
    ...overrides,
  };
}

async function createHostedWorkspaceFixture() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-life-loop-read-'));
  const activeProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-active-aqua-example-com',
  });
  const explicitProfile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-explicit-aqua-example-com',
  });

  await mkdir(activeProfile.profileRoot, { recursive: true });
  await mkdir(explicitProfile.profileRoot, { recursive: true });
  await writeFile(activeProfile.configPath, '{}\n', 'utf8');
  await writeFile(explicitProfile.configPath, '{}\n', 'utf8');
  await saveActiveHostedProfile({
    workspaceRoot,
    profileId: activeProfile.profileId,
    hubUrl: 'https://active.example.com',
    configPath: activeProfile.configPath,
  });

  const dailyIntentRoot = path.join(explicitProfile.profileRoot, 'life-loop', 'daily-intent');
  const writeBackRoot = path.join(explicitProfile.profileRoot, 'life-loop', 'writeback');
  await mkdir(dailyIntentRoot, { recursive: true });
  await mkdir(writeBackRoot, { recursive: true });

  await writeJsonFile(path.join(dailyIntentRoot, '2026-03-19.json'), buildDailyIntentSummary('2026-03-19'));
  await writeFile(path.join(dailyIntentRoot, '2026-03-19.md'), '# old\n', 'utf8');
  await writeJsonFile(path.join(dailyIntentRoot, '2026-03-20.json'), buildDailyIntentSummary('2026-03-20'));
  await writeFile(path.join(dailyIntentRoot, '2026-03-20.md'), '# latest\n', 'utf8');
  await writeJsonFile(path.join(writeBackRoot, 'latest.json'), buildWriteBackEntry('2026-03-20'));

  return {
    workspaceRoot,
    activeProfile,
    explicitProfile,
  };
}

test('readLifeLoop loads the latest profile-scoped daily-intent and write-back artifacts from the explicitly selected hosted profile', async () => {
  const fixture = await createHostedWorkspaceFixture();

  try {
    const result = await readLifeLoop({
      workspaceRoot: fixture.workspaceRoot,
      configPath: fixture.explicitProfile.configPath,
    });

    assert.equal(result.paths.profileId, fixture.explicitProfile.profileId);
    assert.equal(result.dailyIntent.status, 'available');
    assert.equal(result.writeBack.status, 'available');
    assert.equal(result.dailyIntent.summary.targetDate, '2026-03-20');
    assert.equal(result.overview.dailyIntent.dominantModes[0].mode, 'public');
    assert.equal(result.overview.latestAction?.lane, 'public_expression');
    assert.equal(result.overview.latestAction?.output?.targetGatewayHandle, '@reef-cartographer');
    assert.equal(result.warnings.length, 0);
  } finally {
    await rm(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('life-loop brief markdown redacts private-only source and note summaries while preserving sharable usage details', async () => {
  const fixture = await createHostedWorkspaceFixture();

  try {
    const result = await readLifeLoop({
      workspaceRoot: fixture.workspaceRoot,
      configPath: fixture.explicitProfile.configPath,
    });
    const brief = summarizeLifeLoopForBrief(result);
    const markdown = formatLifeLoopBriefMarkdown(brief);

    assert.match(markdown, /## Life Loop/);
    assert.match(markdown, /public \(score 4\)/);
    assert.match(markdown, /@reef-cartographer/);
    assert.match(markdown, /Paraphrase-safe note summary\./);
    assert.match(markdown, /\(private-only note retained locally\)/);
    assert.match(markdown, /\(private-only source retained locally\)/);
    assert.doesNotMatch(markdown, /This private note summary should stay redacted\./);
    assert.doesNotMatch(markdown, /Private source summary that should stay redacted\./);
  } finally {
    await rm(fixture.workspaceRoot, { recursive: true, force: true });
  }
});

test('readLifeLoop degrades to missing-status warnings when local artifacts have not been built yet', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aquaclaw-life-loop-read-missing-'));
  const profile = resolveHostedProfilePaths({
    workspaceRoot,
    profileId: 'hosted-empty-aqua-example-com',
  });

  try {
    await mkdir(profile.profileRoot, { recursive: true });
    await writeFile(profile.configPath, '{}\n', 'utf8');

    const result = await readLifeLoop({
      workspaceRoot,
      configPath: profile.configPath,
    });
    const brief = summarizeLifeLoopForBrief(result);

    assert.equal(result.dailyIntent.status, 'missing');
    assert.equal(result.writeBack.status, 'missing');
    assert.match(result.warnings[0], /daily-intent/);
    assert.match(result.warnings[1], /write-back/);
    assert.equal(brief.dailyIntent.status, 'missing');
    assert.equal(brief.latestWriteBack.status, 'missing');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
