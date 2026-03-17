import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { resolveWorkspaceRoot } from './hosted-aqua-common.mjs';

export const DEFAULT_MIRROR_RELATIVE_DIR = path.join('.aquaclaw', 'mirror');
export const DEFAULT_STATE_FILE_NAME = 'state.json';
export const DEFAULT_CONTEXT_RELATIVE_PATH = path.join('context', 'latest.json');
export const DEFAULT_CONVERSATION_INDEX_RELATIVE_PATH = path.join('conversations', 'index.json');
export const DEFAULT_SEA_EVENTS_RELATIVE_PATH = path.join('sea-events');
export const DEFAULT_CONVERSATIONS_RELATIVE_PATH = path.join('conversations');
export const DEFAULT_PUBLIC_THREADS_RELATIVE_PATH = path.join('public-threads');
export const DEFAULT_RECENT_DELIVERY_LIMIT = 20;

export function resolveMirrorPaths({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  mirrorDir = process.env.AQUACLAW_MIRROR_DIR,
  stateFile = process.env.AQUACLAW_MIRROR_STATE_FILE,
} = {}) {
  const resolvedWorkspaceRoot = resolveWorkspaceRoot(workspaceRoot);
  const resolvedMirrorRoot = stateFile
    ? path.dirname(path.resolve(stateFile))
    : path.resolve(mirrorDir ?? path.join(resolvedWorkspaceRoot, DEFAULT_MIRROR_RELATIVE_DIR));

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    mirrorRoot: resolvedMirrorRoot,
    statePath: stateFile ? path.resolve(stateFile) : path.join(resolvedMirrorRoot, DEFAULT_STATE_FILE_NAME),
    contextPath: path.join(resolvedMirrorRoot, DEFAULT_CONTEXT_RELATIVE_PATH),
    seaEventsDir: path.join(resolvedMirrorRoot, DEFAULT_SEA_EVENTS_RELATIVE_PATH),
    conversationsDir: path.join(resolvedMirrorRoot, DEFAULT_CONVERSATIONS_RELATIVE_PATH),
    conversationIndexPath: path.join(resolvedMirrorRoot, DEFAULT_CONVERSATION_INDEX_RELATIVE_PATH),
    publicThreadsDir: path.join(resolvedMirrorRoot, DEFAULT_PUBLIC_THREADS_RELATIVE_PATH),
  };
}

export function createDefaultMirrorState() {
  return {
    version: 1,
    mode: null,
    hubUrl: null,
    updatedAt: null,
    viewer: {
      kind: null,
      id: null,
      handle: null,
      displayName: null,
    },
    stream: {
      lastDeliveryId: null,
      lastSeaEventId: null,
      lastHelloAt: null,
      lastEventAt: null,
      lastResyncRequiredAt: null,
      lastRejectedCursor: null,
      reconnectCount: 0,
      resyncCount: 0,
      lastError: null,
    },
    mirror: {
      lastContextSyncAt: null,
      lastConversationIndexSyncAt: null,
      lastConversationThreadSyncAt: null,
      lastPublicThreadSyncAt: null,
    },
    recentDeliveries: [],
    conversations: {
      items: [],
      byId: {},
    },
    publicThreads: {
      byRootId: {},
    },
  };
}

export async function loadMirrorState(statePath) {
  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeMirrorState(parsed);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createDefaultMirrorState();
    }
    throw error;
  }
}

export async function saveMirrorState(statePath, state) {
  await writeJsonFile(statePath, {
    ...state,
    updatedAt: new Date().toISOString(),
  });
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function appendNdjson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

export function normalizeMirrorState(input) {
  const base = createDefaultMirrorState();
  if (!input || typeof input !== 'object') {
    return base;
  }
  if (input.version !== 1) {
    throw new Error('unsupported mirror state version');
  }

  return {
    ...base,
    ...input,
    viewer: {
      ...base.viewer,
      ...(input.viewer && typeof input.viewer === 'object' ? input.viewer : {}),
    },
    stream: {
      ...base.stream,
      ...(input.stream && typeof input.stream === 'object' ? input.stream : {}),
    },
    mirror: {
      ...base.mirror,
      ...(input.mirror && typeof input.mirror === 'object' ? input.mirror : {}),
    },
    recentDeliveries: Array.isArray(input.recentDeliveries) ? input.recentDeliveries : [],
    conversations: {
      ...base.conversations,
      ...(input.conversations && typeof input.conversations === 'object' ? input.conversations : {}),
      items: Array.isArray(input?.conversations?.items) ? input.conversations.items : [],
      byId:
        input?.conversations?.byId && typeof input.conversations.byId === 'object'
          ? input.conversations.byId
          : {},
    },
    publicThreads: {
      ...base.publicThreads,
      ...(input.publicThreads && typeof input.publicThreads === 'object' ? input.publicThreads : {}),
      byRootId:
        input?.publicThreads?.byRootId && typeof input.publicThreads.byRootId === 'object'
          ? input.publicThreads.byRootId
          : {},
    },
  };
}

export function conversationFilePath(paths, conversationId) {
  return path.join(paths.conversationsDir, `${conversationId}.json`);
}

export function publicThreadFilePath(paths, rootExpressionId) {
  return path.join(paths.publicThreadsDir, `${rootExpressionId}.json`);
}

export function relativeMirrorPath(paths, filePath) {
  return path.relative(paths.mirrorRoot, filePath);
}

export function datePartitionFromIso(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export function buildStoredDeliveryRecord(delivery, recordedAt = new Date().toISOString()) {
  return {
    source: 'stream',
    recordedAt,
    deliveryId: delivery?.id ?? null,
    activityGatewayIds: Array.isArray(delivery?.activityGatewayIds) ? delivery.activityGatewayIds : [],
    currentChanged: delivery?.currentChanged === true,
    seaEvent: delivery?.seaEvent ?? null,
  };
}

function deliveryRecordKey(record) {
  return record?.deliveryId ?? record?.seaEvent?.id ?? null;
}

export function pushRecentDelivery(records, nextRecord, maxItems = DEFAULT_RECENT_DELIVERY_LIMIT) {
  const existing = Array.isArray(records) ? records : [];
  const nextKey = deliveryRecordKey(nextRecord);
  const filtered = nextKey ? existing.filter((record) => deliveryRecordKey(record) !== nextKey) : [...existing];
  filtered.push(nextRecord);
  return filtered.slice(Math.max(filtered.length - maxItems, 0));
}

function trimString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function extractDeliveryHints(delivery) {
  const event = delivery?.seaEvent;
  const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const conversationId = trimString(metadata.conversationId);
  const messageId = trimString(metadata.messageId);
  const expressionId = trimString(metadata.expressionId);
  const rootExpressionId = trimString(metadata.rootExpressionId) ?? expressionId;

  return {
    refreshContext: event?.type === 'current.changed' || event?.type === 'environment.changed',
    refreshConversationIndex:
      event?.type === 'conversation.started' ||
      event?.type === 'conversation.message_sent' ||
      event?.type === 'friend_request.accepted' ||
      event?.type === 'friendship.removed',
    conversationUpdates: conversationId ? [{ conversationId, messageId }] : [],
    publicThreadUpdates: rootExpressionId ? [{ rootExpressionId, expressionId }] : [],
  };
}

export function parseSseEventBlock(block) {
  const lines = String(block || '').split('\n');
  let event = 'message';
  let id = null;
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trimStart() : '';

    if (field === 'event') {
      event = rawValue;
      continue;
    }
    if (field === 'id') {
      id = rawValue;
      continue;
    }
    if (field === 'data') {
      dataLines.push(rawValue);
    }
  }

  if (!dataLines.length && event === 'message' && id === null) {
    return null;
  }

  return {
    event,
    id,
    data: dataLines.length ? JSON.parse(dataLines.join('\n')) : null,
  };
}
