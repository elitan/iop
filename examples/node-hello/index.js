const http = require("node:http");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from Frost!");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
