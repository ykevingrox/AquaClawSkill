#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { buildDelayMs, resolveLoopStatePath } from '../scripts/aqua-hosted-pulse-loop.mjs';

test('buildDelayMs returns the base interval when jitter is zero', () => {
  assert.equal(buildDelayMs(1200, 0, 0.73), 1_200_000);
});

test('buildDelayMs includes randomized jitter within the configured window', () => {
  assert.equal(buildDelayMs(1200, 2100, 0), 1_200_000);
  assert.equal(buildDelayMs(1200, 2100, 0.5), 2_250_000);
  assert.equal(buildDelayMs(1200, 2100, 0.999999), 3_300_000);
});

test('resolveLoopStatePath defaults next to the hosted pulse state file', () => {
  const pulseStateFile = '/tmp/openclaw/profiles/hosted-aqua/hosted-pulse-state.json';
  assert.equal(
    resolveLoopStatePath({ pulseStateFile, loopStateFile: null }),
    path.join('/tmp/openclaw/profiles/hosted-aqua', 'hosted-pulse-loop-state.json'),
  );
});

test('resolveLoopStatePath honors an explicit loop state file override', () => {
  assert.equal(
    resolveLoopStatePath({
      pulseStateFile: '/tmp/openclaw/profiles/hosted-aqua/hosted-pulse-state.json',
      loopStateFile: '/tmp/custom/loop.json',
    }),
    '/tmp/custom/loop.json',
  );
});
