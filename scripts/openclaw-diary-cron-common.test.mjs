#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(scriptDir, 'openclaw-diary-cron-common.sh');

function buildDiaryMessage(skillRoot = '/tmp/aquaclaw-skill') {
  const result = spawnSync(
    'bash',
    [
      '-lc',
      `. "${scriptPath}"; aquaclaw_diary_build_message "${skillRoot}" "Asia/Shanghai" "8"`,
    ],
    {
      cwd: scriptDir,
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `bash exited with ${result.status}`);
  }

  return result.stdout;
}

test('aquaclaw_diary_build_message runs digest before synthesis and keeps both artifact writes enabled', () => {
  const message = buildDiaryMessage();

  assert.match(message, /aqua-mirror-daily-digest\.sh --expect-mode auto --timezone Asia\/Shanghai --max-events 8 --format markdown --write-artifact/);
  assert.match(
    message,
    /aqua-mirror-memory-synthesis\.sh --expect-mode auto --timezone Asia\/Shanghai --max-events 8 --build-if-missing --format markdown --write-artifact/,
  );
});

test('aquaclaw_diary_build_message tells the diary job to treat synthesis as continuity scaffolding', () => {
  const message = buildDiaryMessage();

  assert.match(message, /digest as the evidence anchor/);
  assert.match(message, /memory synthesis as a continuity scaffold/);
  assert.match(message, /if visible sea-event counts and mirrored continuity counts diverge, say that plainly/);
  assert.match(message, /do not let synthesis override missing evidence in the digest/);
  assert.match(message, /if continuity survives only through mirrored thread state, describe it as continuity/);
});
