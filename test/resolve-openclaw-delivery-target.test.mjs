#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectDirectSessionCandidates,
  collectTelegramSessionCandidates,
  normalizeDeliveryTo,
  normalizeDeliveryToForChannel,
  resolveDeliveryTarget,
  resolveTelegramAllowFromTarget,
} from '../scripts/resolve-openclaw-delivery-target.mjs';

test('normalizeDeliveryTo strips telegram prefix', () => {
  assert.equal(normalizeDeliveryTo('telegram:5485910808'), '5485910808');
  assert.equal(normalizeDeliveryTo('5485910808'), '5485910808');
  assert.equal(normalizeDeliveryTo(''), null);
});

test('normalizeDeliveryToForChannel strips matching channel prefix', () => {
  assert.equal(normalizeDeliveryToForChannel('discord:12345', 'discord'), '12345');
  assert.equal(normalizeDeliveryToForChannel('telegram:5485910808', 'telegram'), '5485910808');
  assert.equal(normalizeDeliveryToForChannel('12345', 'discord'), '12345');
});

test('collectDirectSessionCandidates prefers latest direct session across channels', () => {
  const sessions = {
    'agent:main:telegram:direct:111': {
      updatedAt: 10,
      deliveryContext: {
        channel: 'telegram',
        to: 'telegram:111',
        accountId: 'default',
      },
      chatType: 'direct',
    },
    'agent:main:telegram:direct:222': {
      updatedAt: 20,
      deliveryContext: {
        channel: 'telegram',
        to: 'telegram:222',
        accountId: 'default',
      },
      chatType: 'direct',
    },
    'agent:main:discord:direct:x': {
      updatedAt: 30,
      deliveryContext: {
        channel: 'discord',
        to: 'discord:123',
      },
      chatType: 'direct',
    },
  };

  const candidates = collectDirectSessionCandidates(sessions);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].channel, 'discord');
  assert.equal(candidates[0].to, '123');
  assert.equal(candidates[0].sessionKey, 'agent:main:discord:direct:x');
});

test('collectTelegramSessionCandidates only keeps direct telegram sessions', () => {
  const sessions = {
    'agent:main:telegram:direct:111': {
      updatedAt: 10,
      deliveryContext: {
        channel: 'telegram',
        to: 'telegram:111',
      },
      chatType: 'direct',
    },
    'agent:main:discord:direct:x': {
      updatedAt: 30,
      deliveryContext: {
        channel: 'discord',
        to: 'discord:123',
      },
      chatType: 'direct',
    },
  };

  const candidates = collectTelegramSessionCandidates(sessions);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].channel, 'telegram');
  assert.equal(candidates[0].to, '111');
});

test('resolveTelegramAllowFromTarget falls back to first allowFrom entry', () => {
  const resolved = resolveTelegramAllowFromTarget({
    allowFrom: ['5485910808'],
  });

  assert.deepEqual(resolved, {
    accountId: null,
    channel: 'telegram',
    sessionKey: null,
    source: 'allow_from',
    to: '5485910808',
    updatedAt: 0,
  });
});

test('resolveDeliveryTarget prefers session target and falls back to allowFrom', () => {
  const preferred = resolveDeliveryTarget({
    sessions: {
      'agent:main:telegram:direct:5485910808': {
        updatedAt: 1773897127662,
        deliveryContext: {
          channel: 'telegram',
          to: 'telegram:5485910808',
          accountId: 'default',
        },
        chatType: 'direct',
      },
    },
    telegramAllowFrom: {
      allowFrom: ['999999'],
    },
  });

  assert.equal(preferred?.to, '5485910808');
  assert.equal(preferred?.channel, 'telegram');
  assert.equal(preferred?.source, 'sessions');
  assert.equal(preferred?.accountId, 'default');

  const fallback = resolveDeliveryTarget({
    sessions: {},
    telegramAllowFrom: {
      allowFrom: ['999999'],
    },
  });
  assert.equal(fallback?.to, '999999');
  assert.equal(fallback?.channel, 'telegram');
  assert.equal(fallback?.source, 'allow_from');
});

test('resolveDeliveryTarget prefers the most recent direct session even when it is not telegram', () => {
  const resolved = resolveDeliveryTarget({
    sessions: {
      'agent:main:telegram:direct:5485910808': {
        updatedAt: 1773897127662,
        deliveryContext: {
          channel: 'telegram',
          to: 'telegram:5485910808',
          accountId: 'default',
        },
        chatType: 'direct',
      },
      'agent:main:discord:direct:12345': {
        updatedAt: 1773897127999,
        deliveryContext: {
          channel: 'discord',
          to: 'discord:12345',
        },
        chatType: 'direct',
      },
    },
    telegramAllowFrom: {
      allowFrom: ['999999'],
    },
  });

  assert.equal(resolved?.channel, 'discord');
  assert.equal(resolved?.to, '12345');
  assert.equal(resolved?.sessionKey, 'agent:main:discord:direct:12345');
  assert.equal(resolved?.source, 'sessions');
});
