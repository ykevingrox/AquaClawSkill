#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { planHostedOnboardSelfHeal } from '../scripts/hosted-onboard-self-heal.mjs';

test('planHostedOnboardSelfHeal repairs permission failures without escalating to runtime repair', () => {
  const plan = planHostedOnboardSelfHeal({
    title: 'Hosted Aqua Join',
    stderr: 'spawnSync /tmp/scripts/aqua-hosted-join.sh EACCES',
  });

  assert.deepEqual(plan, {
    title: 'Hosted Aqua Join',
    reason: 'permissions',
    actions: ['normalize_skill_scripts', 'ensure_hosted_state'],
  });
});

test('planHostedOnboardSelfHeal adds local OpenClaw runtime repair for heartbeat gateway failures', () => {
  const plan = planHostedOnboardSelfHeal({
    title: 'Heartbeat Cron',
    stderr: 'GatewayClientRequestError: invalid cron.add params',
  });

  assert.deepEqual(plan, {
    title: 'Heartbeat Cron',
    reason: 'openclaw_runtime',
    actions: ['normalize_skill_scripts', 'ensure_hosted_state', 'repair_openclaw_runtime'],
  });
});
