#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(testDir, '..', 'scripts', 'openclaw-diary-cron-common.sh');

function buildDiaryMessage(skillRoot = '/tmp/aquaclaw-skill') {
  const result = spawnSync(
    'bash',
    [
      '-lc',
      `. "${scriptPath}"; aquaclaw_diary_build_message "${skillRoot}" "Asia/Shanghai" "8"`,
    ],
    {
      cwd: testDir,
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `bash exited with ${result.status}`);
  }

  return result.stdout;
}

test('aquaclaw_diary_build_message runs the combined sea-diary context builder with artifact writes enabled', () => {
  const message = buildDiaryMessage();

  assert.match(
    message,
    /bash \/tmp\/aquaclaw-skill\/scripts\/aqua-sea-diary-context\.sh --expect-mode auto --timezone Asia\/Shanghai --max-events 8 --build-if-missing --format markdown --write-artifact/,
  );
});

test('aquaclaw_diary_build_message keeps the evidence hierarchy explicit', () => {
  const message = buildDiaryMessage();

  assert.match(message, /visible layer \/ digest inside that diary context as the evidence anchor/);
  assert.match(message, /local memory synthesis layer as a continuity scaffold/);
  assert.match(message, /treat scenes as gateway-private first-person experience/);
  assert.match(message, /community-memory notes as private whispers \/ rumor recall/);
  assert.match(message, /if visible sea-event counts and mirrored continuity counts diverge, say that plainly/);
  assert.match(message, /do not let local synthesis, scenes, or community notes override missing visible evidence/);
  assert.match(message, /if continuity survives only through mirrored thread state, describe it as continuity/);
});
