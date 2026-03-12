#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), '.openclaw', 'workspace');
const DEFAULT_HOSTED_CONFIG_RELATIVE_PATH = path.join('.aquaclaw', 'hosted-bridge.json');
const DEFAULT_HOSTED_PULSE_STATE_RELATIVE_PATH = path.join('.aquaclaw', 'hosted-pulse-state.json');

export function parseArgValue(argv, index, current, label) {
  if (current.includes('=')) {
    return current.slice(current.indexOf('=') + 1);
  }

  const next = argv[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`${label} requires a value`);
  }

  return next;
}

export function normalizeBaseUrl(raw) {
  const url = new URL(String(raw).trim());
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function buildError(response, payload, fallbackMessage, request) {
  const error = new Error(payload?.error?.message ?? fallbackMessage);
  error.statusCode = response.status;
  error.code = payload?.error?.code ?? null;
  error.payload = payload;
  error.method = request.method;
  error.url = request.url;
  return error;
}

export async function requestJson(baseUrl, pathname, { method = 'GET', token, payload } = {}) {
  const url = pathname.startsWith('http://') || pathname.startsWith('https://')
    ? pathname
    : `${normalizeBaseUrl(baseUrl)}${pathname}`;
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to reach AquaClaw at ${url}: ${message}`);
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`invalid JSON response from ${url}`);
    }
  }

  if (!response.ok) {
    throw buildError(response, body, `request failed: ${response.status}`, { method, url });
  }

  return body;
}

export function resolveWorkspaceRoot(raw = process.env.OPENCLAW_WORKSPACE_ROOT) {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_WORKSPACE_ROOT;
  return path.resolve(value);
}

export function resolveHostedConfigPath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
} = {}) {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const explicit = typeof configPath === 'string' && configPath.trim() ? configPath.trim() : null;
  return path.resolve(explicit ?? path.join(root, DEFAULT_HOSTED_CONFIG_RELATIVE_PATH));
}

export function resolveHostedPulseStatePath({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  stateFile = process.env.AQUACLAW_HOSTED_PULSE_STATE,
} = {}) {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const explicit = typeof stateFile === 'string' && stateFile.trim() ? stateFile.trim() : null;
  return path.resolve(explicit ?? path.join(root, DEFAULT_HOSTED_PULSE_STATE_RELATIVE_PATH));
}

function assertHostedConfigShape(config, configPath) {
  if (!config || typeof config !== 'object') {
    throw new Error(`invalid hosted Aqua config at ${configPath}`);
  }
  if (config.version !== 1) {
    throw new Error(`unsupported hosted Aqua config version at ${configPath}`);
  }
  if (config.mode !== 'hosted') {
    throw new Error(`invalid hosted Aqua mode at ${configPath}`);
  }
  if (typeof config.hubUrl !== 'string' || !config.hubUrl.trim()) {
    throw new Error(`missing hubUrl in hosted Aqua config at ${configPath}`);
  }
  if (typeof config?.credential?.token !== 'string' || !config.credential.token.trim()) {
    throw new Error(`missing gateway token in hosted Aqua config at ${configPath}`);
  }
  if (typeof config?.runtime?.runtimeId !== 'string' || !config.runtime.runtimeId.trim()) {
    throw new Error(`missing runtimeId in hosted Aqua config at ${configPath}`);
  }
}

export async function loadHostedConfig({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
} = {}) {
  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot);
  const resolvedConfigPath = resolveHostedConfigPath({
    workspaceRoot: resolvedWorkspaceRoot,
    configPath,
  });

  let raw;
  try {
    raw = await readFile(resolvedConfigPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`hosted Aqua config not found at ${resolvedConfigPath}. Run aqua-hosted-join.sh first.`);
    }
    throw error;
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(`invalid JSON in hosted Aqua config at ${resolvedConfigPath}`);
  }

  assertHostedConfigShape(config, resolvedConfigPath);

  return {
    config,
    configPath: resolvedConfigPath,
    workspaceRoot: resolvedWorkspaceRoot,
  };
}

export async function saveHostedConfig(configPath, config) {
  const directory = path.dirname(configPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  const payload = JSON.stringify(config, null, 2) + '\n';

  await writeFile(tempPath, payload, { mode: 0o600 });
  await rename(tempPath, configPath);
  try {
    await chmod(configPath, 0o600);
  } catch {}
}

function slugifySegment(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export function buildHostedJoinDefaults() {
  const hostname = os.hostname() || 'host';
  const hostSlug = slugifySegment(hostname, 'host');
  const suffix = randomBytes(3).toString('hex');
  const runtimeSlug = `${hostSlug}-${suffix}`;

  return {
    displayName: `OpenClaw @ ${hostname}`,
    handle: `claw-${runtimeSlug}`,
    installationId: `openclaw-${hostSlug}`,
    runtimeId: `openclaw-${runtimeSlug}`,
    label: `OpenClaw @ ${hostname}`,
    source: 'openclaw_skill_hosted',
  };
}

export function formatTimestamp(value) {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}
