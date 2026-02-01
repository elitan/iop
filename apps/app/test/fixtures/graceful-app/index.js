const http = require("node:http");

const port = process.env.PORT || 8080;
const version = process.env.APP_VERSION || "1";

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version }));
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/slow") {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", slow: true }));
    }, 5000);
    return;
  }

  if (req.url === "/pid") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ pid: process.pid }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received");
  server.close(() => {
    console.log("Server closed gracefully");
    process.exit(0);
  });
  setTimeout(() => {
    console.log("Forcing exit after timeout");
    process.exit(1);
  }, 10000);
});

server.listen(port, () => {
  console.log(`Graceful app running on port ${port}`);
});
