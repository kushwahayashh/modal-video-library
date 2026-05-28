import path from "path";
import { Database } from "bun:sqlite";

export function createSqliteStore(dataDir) {
  const dbPath = path.join(dataDir, "luna.db");
  const db = new Database(dbPath, { create: true });

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      size TEXT NOT NULL,
      duration TEXT,
      createdAt TEXT NOT NULL,
      modifiedAt TEXT NOT NULL,
      addedAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_added_at ON videos(addedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_filename ON videos(filename);

    CREATE TABLE IF NOT EXISTS thumbnail_overrides (
      videoId TEXT PRIMARY KEY,
      imageUrl TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_progress (
      videoId TEXT PRIMARY KEY,
      currentTime REAL NOT NULL,
      duration REAL NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  const getVideoStmt = db.query("SELECT * FROM videos WHERE id = ?");
  const getThumbnailStmt = db.query("SELECT imageUrl FROM thumbnail_overrides WHERE videoId = ?");
  const setThumbnailStmt = db.query(`
    INSERT INTO thumbnail_overrides (videoId, imageUrl)
    VALUES (?, ?)
    ON CONFLICT(videoId) DO UPDATE SET imageUrl = excluded.imageUrl
  `);
  const removeThumbnailStmt = db.query("DELETE FROM thumbnail_overrides WHERE videoId = ?");
  const getProgressStmt = db.query("SELECT currentTime, duration, updatedAt FROM watch_progress WHERE videoId = ?");
  const setProgressStmt = db.query(`
    INSERT INTO watch_progress (videoId, currentTime, duration, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(videoId) DO UPDATE SET
      currentTime = excluded.currentTime,
      duration = excluded.duration,
      updatedAt = excluded.updatedAt
  `);
  const removeProgressStmt = db.query("DELETE FROM watch_progress WHERE videoId = ?");

  const upsertVideoStmt = db.query(`
    INSERT INTO videos (
      id, filename, title, sizeBytes, size, duration, createdAt, modifiedAt, addedAt, lastSeenAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      filename = excluded.filename,
      title = excluded.title,
      sizeBytes = excluded.sizeBytes,
      size = excluded.size,
      duration = excluded.duration,
      createdAt = excluded.createdAt,
      modifiedAt = excluded.modifiedAt,
      addedAt = videos.addedAt,
      lastSeenAt = excluded.lastSeenAt
  `);

  const deleteMissingVideosStmt = db.query("DELETE FROM videos WHERE lastSeenAt != ?");

  const moveMetadata = db.transaction((oldId, newId, newFilename) => {
    db.query("UPDATE videos SET id = ?, filename = ?, title = ? WHERE id = ?").run(
      newId,
      newFilename,
      path.basename(newFilename, path.extname(newFilename)),
      oldId
    );
    db.query("UPDATE thumbnail_overrides SET videoId = ? WHERE videoId = ?").run(newId, oldId);
    db.query("UPDATE watch_progress SET videoId = ? WHERE videoId = ?").run(newId, oldId);
  });

  const deleteVideoMetadataTx = db.transaction((id) => {
    db.query("DELETE FROM videos WHERE id = ?").run(id);
    removeThumbnailStmt.run(id);
    removeProgressStmt.run(id);
  });

  function upsertVideo(video) {
    upsertVideoStmt.run(
      video.id,
      video.filename,
      video.title,
      video.sizeBytes,
      video.size,
      video.duration,
      video.createdAt,
      video.modifiedAt,
      video.addedAt,
      video.lastSeenAt
    );
  }

  function listVideos({ queryText = "", offset = 0, limit = 0 } = {}) {
    const trimmed = queryText.trim().toLowerCase();
    const where = trimmed ? "WHERE lower(title) LIKE ? OR lower(filename) LIKE ?" : "";
    const params = trimmed ? [`%${trimmed}%`, `%${trimmed}%`] : [];
    const total = (db.query(`SELECT COUNT(*) AS count FROM videos ${where}`).get(...params) as any).count;

    const sql = `
      SELECT v.*, t.imageUrl AS thumbnail
      FROM videos v
      LEFT JOIN thumbnail_overrides t ON t.videoId = v.id
      ${where}
      ORDER BY datetime(v.addedAt) DESC, v.id ASC
      ${limit > 0 ? "LIMIT ? OFFSET ?" : ""}
    `;
    const rows = db.query(sql).all(...params, ...(limit > 0 ? [limit, offset] : [])) as any[];
    return { videos: rows, total };
  }

  function getAllThumbnails() {
    return Object.fromEntries(
      (db.query("SELECT videoId, imageUrl FROM thumbnail_overrides ORDER BY videoId").all() as any[])
        .map((row) => [row.videoId, row.imageUrl])
    );
  }

  function getAllProgress() {
    return Object.fromEntries(
      (db.query("SELECT videoId, currentTime, duration, updatedAt FROM watch_progress ORDER BY videoId").all() as any[])
        .map((row) => [
          row.videoId,
          { currentTime: row.currentTime, duration: row.duration, updatedAt: row.updatedAt },
        ])
    );
  }

  return {
    dbPath,
    getVideo: (id) => getVideoStmt.get(id) || null,
    upsertVideo,
    deleteMissingVideos: (scanId) => deleteMissingVideosStmt.run(scanId),
    listVideos,
    renameVideo: moveMetadata,
    deleteVideo: deleteVideoMetadataTx,
    getThumbnail: (videoId) => (getThumbnailStmt.get(videoId) as any)?.imageUrl || null,
    setThumbnail: (videoId, imageUrl) => setThumbnailStmt.run(videoId, imageUrl),
    removeThumbnail: (videoId) => removeThumbnailStmt.run(videoId),
    getAllThumbnails,
    getProgress: (videoId) => getProgressStmt.get(videoId) || null,
    setProgress: (videoId, currentTime, duration, updatedAt = new Date().toISOString()) =>
      setProgressStmt.run(videoId, currentTime, duration, updatedAt),
    removeProgress: (videoId) => removeProgressStmt.run(videoId),
    getAllProgress,
    close: () => db.close(),
  };
}
