import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface Doc<T> {
  id: string;
  ownerId: string;
  /** Starts at 1 and increments on every write. */
  revision: number;
  value: T;
  createdAt: string;
  updatedAt: string;
}

export interface Blob {
  mimeType: string;
  bytes: Uint8Array;
}

/** Register a name here rather than inventing collection strings per feature. */
export const COLLECTIONS = {
  agents: "agents",
  avatars: "avatars",
  teacherSessions: "teacher_sessions",
  datasets: "datasets",
  preparations: "preparations",
  priceCache: "price_cache",
  trainingRuns: "training_runs",
  trainingRequests: "training_requests",
  artifacts: "artifacts",
} as const;

/** Owner for data that belongs to no browser, such as a provider price cache. */
export const SYSTEM_OWNER = "system";

export class RevisionConflictError extends Error {
  constructor(collection: string, id: string) {
    super(`Revision conflict on ${collection}/${id}`);
    this.name = "RevisionConflictError";
  }
}

export interface Store {
  get<T>(collection: string, ownerId: string, id: string): Doc<T> | null;
  /** Newest first. */
  list<T>(collection: string, ownerId: string, limit?: number): Doc<T>[];
  /**
   * Writes a doc. With `expectedRevision` the write only applies if the stored
   * revision matches (null = must not exist), else RevisionConflictError.
   */
  put<T>(collection: string, ownerId: string, id: string, value: T, options?: { expectedRevision?: number | null }): Doc<T>;
  /**
   * Atomic insert for durable idempotency. Survives restarts: a second call
   * with the same id returns the first doc with `created: false`.
   */
  insertIfAbsent<T>(collection: string, ownerId: string, id: string, value: T): { doc: Doc<T>; created: boolean };
  delete(collection: string, ownerId: string, id: string): boolean;
  putBlob(ownerId: string, blobId: string, blob: Blob): void;
  getBlob(ownerId: string, blobId: string): Blob | null;
  close(): void;
}

interface DocRow {
  collection: string;
  owner_id: string;
  id: string;
  revision: number;
  value: string;
  created_at: string;
  updated_at: string;
}

function toDoc<T>(row: DocRow): Doc<T> {
  return {
    id: row.id,
    ownerId: row.owner_id,
    revision: row.revision,
    value: JSON.parse(row.value) as T,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createStore(dbPath: string): Store {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      owner_id   TEXT NOT NULL,
      id         TEXT NOT NULL,
      revision   INTEGER NOT NULL,
      value      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, owner_id, id)
    );
    CREATE TABLE IF NOT EXISTS blobs (
      owner_id  TEXT NOT NULL,
      id        TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      bytes     BLOB NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
  `);

  const selectOne = db.prepare("SELECT * FROM docs WHERE collection = ? AND owner_id = ? AND id = ?");
  const selectMany = db.prepare(
    "SELECT * FROM docs WHERE collection = ? AND owner_id = ? ORDER BY updated_at DESC, id LIMIT ?",
  );
  const insert = db.prepare(
    `INSERT INTO docs (collection, owner_id, id, revision, value, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT DO NOTHING`,
  );
  const upsert = db.prepare(
    `INSERT INTO docs (collection, owner_id, id, revision, value, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT (collection, owner_id, id)
     DO UPDATE SET revision = revision + 1, value = excluded.value, updated_at = excluded.updated_at`,
  );
  const update = db.prepare(
    `UPDATE docs SET revision = revision + 1, value = ?, updated_at = ?
     WHERE collection = ? AND owner_id = ? AND id = ? AND revision = ?`,
  );
  const remove = db.prepare("DELETE FROM docs WHERE collection = ? AND owner_id = ? AND id = ?");
  const saveBlob = db.prepare(
    `INSERT INTO blobs (owner_id, id, mime_type, bytes) VALUES (?, ?, ?, ?)
     ON CONFLICT (owner_id, id) DO UPDATE SET mime_type = excluded.mime_type, bytes = excluded.bytes`,
  );
  const loadBlob = db.prepare("SELECT mime_type, bytes FROM blobs WHERE owner_id = ? AND id = ?");

  const read = <T>(collection: string, ownerId: string, id: string): Doc<T> | null => {
    const row = selectOne.get(collection, ownerId, id) as DocRow | undefined;
    return row ? toDoc<T>(row) : null;
  };

  return {
    get: read,

    list<T>(collection: string, ownerId: string, limit = 100) {
      return (selectMany.all(collection, ownerId, limit) as unknown as DocRow[]).map((row) => toDoc<T>(row));
    },

    put<T>(collection: string, ownerId: string, id: string, value: T, options: { expectedRevision?: number | null } = {}) {
      const json = JSON.stringify(value);
      const now = new Date().toISOString();
      const { expectedRevision } = options;
      if (expectedRevision === undefined) {
        upsert.run(collection, ownerId, id, json, now, now);
      } else {
        const changes =
          expectedRevision === null
            ? insert.run(collection, ownerId, id, json, now, now).changes
            : update.run(json, now, collection, ownerId, id, expectedRevision).changes;
        if (Number(changes) === 0) throw new RevisionConflictError(collection, id);
      }
      return read<T>(collection, ownerId, id)!;
    },

    insertIfAbsent<T>(collection: string, ownerId: string, id: string, value: T) {
      const now = new Date().toISOString();
      const { changes } = insert.run(collection, ownerId, id, JSON.stringify(value), now, now);
      return { doc: read<T>(collection, ownerId, id)!, created: Number(changes) === 1 };
    },

    delete(collection, ownerId, id) {
      return Number(remove.run(collection, ownerId, id).changes) === 1;
    },

    putBlob(ownerId, blobId, blob) {
      saveBlob.run(ownerId, blobId, blob.mimeType, blob.bytes);
    },

    getBlob(ownerId, blobId) {
      const row = loadBlob.get(ownerId, blobId) as { mime_type: string; bytes: Uint8Array } | undefined;
      return row ? { mimeType: row.mime_type, bytes: row.bytes } : null;
    },

    close() {
      db.close();
    },
  };
}

const globalForStore = globalThis as unknown as { __aaStore?: { dbPath: string; store: Store } };

/** One connection per process, surviving dev-server module reloads. */
export function getStore(): Store {
  const dbPath = path.resolve(process.env.AA_DATA_DIR ?? ".data", "aa.sqlite");
  if (globalForStore.__aaStore?.dbPath !== dbPath) {
    globalForStore.__aaStore = { dbPath, store: createStore(dbPath) };
  }
  return globalForStore.__aaStore.store;
}
