export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS farms (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  altitude_m REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_farms_deleted_at ON farms (deleted_at);
CREATE INDEX IF NOT EXISTS idx_farms_sync_status ON farms (sync_status);

CREATE TABLE IF NOT EXISTS plots (
  id TEXT PRIMARY KEY NOT NULL,
  farm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  crop TEXT NOT NULL,
  area_ha REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (farm_id) REFERENCES farms (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plots_farm_id ON plots (farm_id);
CREATE INDEX IF NOT EXISTS idx_plots_deleted_at ON plots (deleted_at);
CREATE INDEX IF NOT EXISTS idx_plots_crop ON plots (crop);

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY NOT NULL,
  farm_id TEXT,
  plot_id TEXT,
  crop TEXT NOT NULL,
  predicted_class TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  threshold REAL NOT NULL,
  is_low_confidence INTEGER NOT NULL DEFAULT 0,
  model_version TEXT NOT NULL,
  local_photo_uri TEXT NOT NULL,
  cloudinary_public_id TEXT,
  explanation_json TEXT,
  scanned_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (farm_id) REFERENCES farms (id) ON DELETE SET NULL,
  FOREIGN KEY (plot_id) REFERENCES plots (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_farm_id ON scans (farm_id);
CREATE INDEX IF NOT EXISTS idx_scans_plot_id ON scans (plot_id);
CREATE INDEX IF NOT EXISTS idx_scans_crop ON scans (crop);
CREATE INDEX IF NOT EXISTS idx_scans_severity ON scans (severity);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans (scanned_at);
CREATE INDEX IF NOT EXISTS idx_scans_deleted_at ON scans (deleted_at);
CREATE INDEX IF NOT EXISTS idx_scans_sync_status ON scans (sync_status);
`;
