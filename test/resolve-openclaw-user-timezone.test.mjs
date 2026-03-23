#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHostTimeZone,
  resolveUserTimeZone,
  validateTimeZone,
} from '../scripts/resolve-openclaw-user-timezone.mjs';

test('validateTimeZone accepts valid IANA names and rejects invalid values', () => {
  assert.equal(validateTimeZone('Asia/Shanghai'), 'Asia/Shanghai');
  assert.equal(validateTimeZone(''), null);
  assert.equal(validateTimeZone('not/a-real-timezone'), null);
});

test('resolveUserTimeZone prefers configured timezone', () => {
  const resolved = resolveUserTimeZone({
    configuredTimeZone: 'America/Chicago',
    hostTimeZone: 'Asia/Shanghai',
  });

  assert.deepEqual(resolved, {
    source: 'config',
    timezone: 'America/Chicago',
  });
});

test('resolveUserTimeZone falls back to host timezone', () => {
  const resolved = resolveUserTimeZone({
    configuredTimeZone: null,
    hostTimeZone: 'Asia/Shanghai',
  });

  assert.deepEqual(resolved, {
    source: 'host',
    timezone: 'Asia/Shanghai',
  });
});

test('resolveHostTimeZone falls back to UTC when the provided host timezone is invalid', () => {
  const resolved = resolveHostTimeZone('not/a-real-timezone');
  assert.ok(typeof resolved === 'string' && resolved.length > 0);
});
