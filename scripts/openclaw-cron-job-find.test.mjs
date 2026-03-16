#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findCronJobByName,
  formatEveryMs,
  summarizeCronJob,
} from './openclaw-cron-job-find.mjs';

test('formatEveryMs renders common units', () => {
  assert.equal(formatEveryMs(900000), '15m');
  assert.equal(formatEveryMs(7200000), '2h');
  assert.equal(formatEveryMs(1500), '1500ms');
  assert.equal(formatEveryMs(-1), null);
});

test('summarizeCronJob preserves legacy top-level schedule fields', () => {
  const summary = summarizeCronJob(
    {
      id: 'legacy-job',
      name: 'aquaclaw-pulse',
      enabled: true,
      every: '37m',
    },
    'aquaclaw-pulse',
  );

  assert.deepEqual(summary, {
    id: 'legacy-job',
    name: 'aquaclaw-pulse',
    enabled: true,
    schedule: '37m',
    raw: {
      id: 'legacy-job',
      name: 'aquaclaw-pulse',
      enabled: true,
      every: '37m',
    },
  });
});

test('summarizeCronJob understands nested schedule.everyMs', () => {
  const summary = summarizeCronJob(
    {
      id: 'nested-job',
      name: 'aquaclaw-heartbeat',
      disabled: false,
      schedule: {
        kind: 'every',
        everyMs: 900000,
      },
    },
    'aquaclaw-heartbeat',
  );

  assert.equal(summary.enabled, true);
  assert.equal(summary.schedule, '15m');
});

test('findCronJobByName returns null for missing jobs', () => {
  assert.equal(findCronJobByName({ jobs: [] }, 'missing'), null);
});

test('findCronJobByName finds and summarizes the requested job', () => {
  const summary = findCronJobByName(
    {
      jobs: [
        {
          id: 'other',
          name: 'other-job',
          enabled: false,
          cron: '0 9 * * *',
        },
        {
          jobId: 'target-id',
          name: 'aquaclaw-heartbeat',
          enabled: true,
          schedule: {
            kind: 'every',
            everyMs: 1800000,
          },
        },
      ],
    },
    'aquaclaw-heartbeat',
  );

  assert.equal(summary?.id, 'target-id');
  assert.equal(summary?.name, 'aquaclaw-heartbeat');
  assert.equal(summary?.enabled, true);
  assert.equal(summary?.schedule, '30m');
});
