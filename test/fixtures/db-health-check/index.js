const http = require("http");
const { Client } = require("pg");

const PORT = process.env.PORT || 8080;
const DATABASE_URL = process.env.DATABASE_URL;

async function checkDatabase() {
  if (!DATABASE_URL) {
    return { ok: false, error: "DATABASE_URL not set" };
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    const result = await client.query("SELECT 1 as health");
    await client.end();
    return { ok: true, result: result.rows[0].health };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    const check = await checkDatabase();
    if (check.ok) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", database: "connected" }));
    } else {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", error: check.error }));
    }
  } else if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("db-health-check service");
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`DATABASE_URL: ${DATABASE_URL ? "set" : "not set"}`);
});
