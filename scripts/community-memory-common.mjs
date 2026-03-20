#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { appendNdjson, datePartitionFromIso, writeJsonFile } from './aqua-mirror-common.mjs';
import {
  resolveCommunityMemoryRootPath,
  resolveHostedConfigSelection,
  resolveWorkspaceRoot,
} from './hosted-aqua-common.mjs';

export const DEFAULT_COMMUNITY_MEMORY_STATE_FILE_NAME = 'state.json';
export const DEFAULT_COMMUNITY_MEMORY_INDEX_FILE_NAME = 'index.json';
export const DEFAULT_COMMUNITY_MEMORY_NOTES_DIR_NAME = 'notes';
export const DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE = 50;

export function resolveCommunityMemoryPaths({
  workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT,
  configPath = process.env.AQUACLAW_HOSTED_CONFIG,
  communityMemoryDir = process.env.AQUACLAW_COMMUNITY_MEMORY_DIR,
} = {}) {
  const selection = resolveHostedConfigSelection({
    workspaceRoot,
    configPath,
  });
  const resolvedWorkspaceRoot = resolveWorkspaceRoot(selection.workspaceRoot);
  const communityMemoryRoot = resolveCommunityMemoryRootPath({
    workspaceRoot: resolvedWorkspaceRoot,
    communityMemoryDir,
    configPath: selection.configPath,
  });

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    configPath: selection.configPath,
    profileId: selection.profileId ?? null,
    profileRoot: selection.profileRoot ?? null,
    selectionKind: selection.selectionKind,
    communityMemoryRoot,
    statePath: path.join(communityMemoryRoot, DEFAULT_COMMUNITY_MEMORY_STATE_FILE_NAME),
    indexPath: path.join(communityMemoryRoot, DEFAULT_COMMUNITY_MEMORY_INDEX_FILE_NAME),
    notesDir: path.join(communityMemoryRoot, DEFAULT_COMMUNITY_MEMORY_NOTES_DIR_NAME),
  };
}

export function createDefaultCommunityMemoryState() {
  return {
    version: 1,
    hubUrl: null,
    gatewayId: null,
    gatewayHandle: null,
    updatedAt: null,
    lastSyncedAt: null,
    fullBackfillCompletedAt: null,
    newestNoteId: null,
    oldestNoteId: null,
    totalKnownNotes: 0,
    lastError: null,
  };
}

export function normalizeCommunityMemoryState(input) {
  const base = createDefaultCommunityMemoryState();
  if (!input || typeof input !== 'object') {
    return base;
  }
  if (input.version !== 1) {
    return base;
  }

  return {
    ...base,
    ...input,
    lastError:
      input.lastError && typeof input.lastError === 'object'
        ? {
            message:
              typeof input.lastError.message === 'string' && input.lastError.message.trim()
                ? input.lastError.message.trim()
                : null,
            at:
              typeof input.lastError.at === 'string' && input.lastError.at.trim() ? input.lastError.at.trim() : null,
          }
        : null,
  };
}

export async function loadCommunityMemoryState(statePath) {
  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      state: normalizeCommunityMemoryState(parsed),
      recovered: false,
      recoveryReason: null,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        state: createDefaultCommunityMemoryState(),
        recovered: true,
        recoveryReason: 'missing_state',
      };
    }
    if (error instanceof SyntaxError) {
      return {
        state: createDefaultCommunityMemoryState(),
        recovered: true,
        recoveryReason: 'invalid_state_json',
      };
    }
    throw error;
  }
}

export async function saveCommunityMemoryState(statePath, state) {
  await writeJsonFile(statePath, {
    ...normalizeCommunityMemoryState(state),
    updatedAt: new Date().toISOString(),
  });
}

export function cloneCommunityMemoryNote(note) {
  return {
    ...note,
    tags: Array.isArray(note?.tags) ? [...note.tags] : [],
    relatedGatewayIds: Array.isArray(note?.relatedGatewayIds) ? [...note.relatedGatewayIds] : [],
    relatedExpressionIds: Array.isArray(note?.relatedExpressionIds) ? [...note.relatedExpressionIds] : [],
    relatedSeaEventIds: Array.isArray(note?.relatedSeaEventIds) ? [...note.relatedSeaEventIds] : [],
    metadata: note?.metadata && typeof note.metadata === 'object' ? { ...note.metadata } : {},
  };
}

function compareCommunityMemoryNotes(left, right) {
  const leftTime = Date.parse(left?.createdAt ?? '');
  const rightTime = Date.parse(right?.createdAt ?? '');
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

function normalizeCommunityMemoryNote(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('invalid community memory note');
  }
  if (typeof input.id !== 'string' || !input.id.trim()) {
    throw new Error('community memory note id is required');
  }
  if (typeof input.createdAt !== 'string' || !input.createdAt.trim()) {
    throw new Error(`community memory note ${input.id} createdAt is required`);
  }

  return cloneCommunityMemoryNote({
    id: input.id.trim(),
    gatewayId: typeof input.gatewayId === 'string' ? input.gatewayId : null,
    npcId: typeof input.npcId === 'string' ? input.npcId : null,
    visibility: typeof input.visibility === 'string' ? input.visibility : null,
    venueSlug: typeof input.venueSlug === 'string' && input.venueSlug.trim() ? input.venueSlug.trim() : null,
    sourceKind: typeof input.sourceKind === 'string' ? input.sourceKind : null,
    summary: typeof input.summary === 'string' ? input.summary : '',
    body: typeof input.body === 'string' ? input.body : '',
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    relatedGatewayIds: Array.isArray(input.relatedGatewayIds)
      ? input.relatedGatewayIds.map((value) => String(value).trim()).filter(Boolean)
      : [],
    relatedExpressionIds: Array.isArray(input.relatedExpressionIds)
      ? input.relatedExpressionIds.map((value) => String(value).trim()).filter(Boolean)
      : [],
    relatedSeaEventIds: Array.isArray(input.relatedSeaEventIds)
      ? input.relatedSeaEventIds.map((value) => String(value).trim()).filter(Boolean)
      : [],
    mentionPolicy: typeof input.mentionPolicy === 'string' ? input.mentionPolicy : null,
    freshnessScore: Number.isFinite(input.freshnessScore) ? input.freshnessScore : null,
    createdAt: input.createdAt.trim(),
    freshUntil: typeof input.freshUntil === 'string' && input.freshUntil.trim() ? input.freshUntil.trim() : null,
    lastRetrievedAt:
      typeof input.lastRetrievedAt === 'string' && input.lastRetrievedAt.trim() ? input.lastRetrievedAt.trim() : null,
    lastUsedAt: typeof input.lastUsedAt === 'string' && input.lastUsedAt.trim() ? input.lastUsedAt.trim() : null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  });
}

export function createDefaultCommunityMemoryIndex() {
  return {
    version: 1,
    items: [],
  };
}

export function normalizeCommunityMemoryIndex(input) {
  const base = createDefaultCommunityMemoryIndex();
  if (!input || typeof input !== 'object') {
    return base;
  }
  if (input.version !== 1) {
    return base;
  }

  const items = Array.isArray(input.items) ? input.items.map((item) => normalizeCommunityMemoryNote(item)) : [];
  items.sort(compareCommunityMemoryNotes);

  return {
    ...base,
    items,
  };
}

async function readNotesFromArchive(notesDir) {
  let entries;
  try {
    entries = await readdir(notesDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const notesById = new Map();
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ndjson'))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of files) {
    const raw = await readFile(path.join(notesDir, fileName), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const note = normalizeCommunityMemoryNote(JSON.parse(trimmed));
        notesById.set(note.id, note);
      } catch {}
    }
  }

  return [...notesById.values()].sort(compareCommunityMemoryNotes);
}

export async function loadCommunityMemoryIndex(paths) {
  try {
    const raw = await readFile(paths.indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      index: normalizeCommunityMemoryIndex(parsed),
      recovered: false,
      recoveryReason: null,
    };
  } catch (error) {
    const recoveryReason =
      error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
        ? 'missing_index'
        : error instanceof SyntaxError
          ? 'invalid_index_json'
          : 'index_rebuild';

    if (
      !(
        (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') ||
        error instanceof SyntaxError
      )
    ) {
      const rebuiltItems = await readNotesFromArchive(paths.notesDir);
      return {
        index: {
          version: 1,
          items: rebuiltItems,
        },
        recovered: true,
        recoveryReason,
      };
    }

    const rebuiltItems = await readNotesFromArchive(paths.notesDir);
    return {
      index: {
        version: 1,
        items: rebuiltItems,
      },
      recovered: true,
      recoveryReason,
    };
  }
}

export async function saveCommunityMemoryIndex(indexPath, index) {
  await writeJsonFile(indexPath, normalizeCommunityMemoryIndex(index));
}

export function mergeCommunityMemoryIndex(index, incomingNotes) {
  const knownIds = new Set();
  const items = [];

  for (const note of [...incomingNotes, ...index.items]) {
    const normalized = normalizeCommunityMemoryNote(note);
    if (knownIds.has(normalized.id)) {
      continue;
    }
    knownIds.add(normalized.id);
    items.push(normalized);
  }

  items.sort(compareCommunityMemoryNotes);
  return {
    version: 1,
    items,
  };
}

export async function appendCommunityMemoryNotes(paths, notes) {
  const groups = new Map();

  for (const rawNote of notes) {
    const note = normalizeCommunityMemoryNote(rawNote);
    const partition = datePartitionFromIso(note.createdAt);
    if (!groups.has(partition)) {
      groups.set(partition, []);
    }
    groups.get(partition).push(note);
  }

  for (const [partition, partitionNotes] of groups.entries()) {
    const filePath = path.join(paths.notesDir, `${partition}.ndjson`);
    for (const note of partitionNotes) {
      await appendNdjson(filePath, note);
    }
  }
}

export function listCommunityMemoryNotes({
  index,
  limit = DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE,
  cursor = null,
  venueSlug = null,
  tag = null,
} = {}) {
  const normalizedLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE, 1), DEFAULT_COMMUNITY_MEMORY_PAGE_SIZE);
  const normalizedCursor = typeof cursor === 'string' && cursor.trim() ? cursor.trim() : null;
  const normalizedVenueSlug = typeof venueSlug === 'string' && venueSlug.trim() ? venueSlug.trim() : null;
  const normalizedTag = typeof tag === 'string' && tag.trim() ? tag.trim().toLowerCase() : null;
  const items = (index?.items ?? [])
    .map((note) => normalizeCommunityMemoryNote(note))
    .filter((note) => !normalizedVenueSlug || note.venueSlug === normalizedVenueSlug)
    .filter((note) => !normalizedTag || note.tags.some((candidate) => candidate.toLowerCase() === normalizedTag));

  const startIndex = normalizedCursor ? items.findIndex((note) => note.id === normalizedCursor) + 1 : 0;
  if (normalizedCursor && startIndex === 0) {
    throw new Error('invalid community memory cursor');
  }

  const pageItems = items.slice(startIndex, startIndex + normalizedLimit).map((note) => cloneCommunityMemoryNote(note));
  const nextCursor =
    startIndex + pageItems.length < items.length && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null;

  return {
    items: pageItems,
    nextCursor,
  };
}
