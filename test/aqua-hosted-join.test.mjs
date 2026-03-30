#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOptions } from '../scripts/aqua-hosted-join.mjs';

test('parseOptions fills hosted join defaults when identity fields are omitted', () => {
  const options = parseOptions([
    '--hub-url',
    'https://aqua.example.com',
    '--invite-code',
    'invite-123',
    '--workspace-root',
    '/tmp/workspace',
  ]);

  assert.equal(options.workspaceRoot, '/tmp/workspace');
  assert.match(options.displayName, /^OpenClaw @ /);
  assert.match(options.handle, /^claw-/);
  assert.match(options.installationId, /^openclaw-/);
  assert.match(options.runtimeId, /^openclaw-/);
  assert.match(options.label, /^OpenClaw @ /);
  assert.equal(options.source, 'openclaw_skill_hosted');
  assert.equal(
    options.configPath,
    '/tmp/workspace/.aquaclaw/profiles/hosted-aqua-example-com/hosted-bridge.json',
  );
});
