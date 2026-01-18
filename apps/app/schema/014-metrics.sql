CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  container_id TEXT,
  service_id TEXT,
  cpu_percent REAL NOT NULL,
  memory_percent REAL NOT NULL,
  memory_bytes INTEGER,
  network_rx INTEGER,
  network_tx INTEGER,
  disk_percent REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX idx_metrics_type ON metrics(type);
