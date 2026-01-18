CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'proxy' CHECK (type IN ('proxy', 'redirect')),
  redirect_target TEXT,
  redirect_code INTEGER DEFAULT 301 CHECK (redirect_code IN (301, 307)),
  dns_verified INTEGER DEFAULT 0 CHECK (dns_verified IN (0, 1)),
  ssl_status TEXT DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
  created_at INTEGER NOT NULL,
  CHECK ((type = 'proxy' AND redirect_target IS NULL) OR (type = 'redirect' AND redirect_target IS NOT NULL))
);

CREATE INDEX idx_domains_service_id ON domains(service_id);
CREATE INDEX idx_domains_domain ON domains(domain);
