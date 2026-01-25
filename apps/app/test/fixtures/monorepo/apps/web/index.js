const http = require("node:http");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from web!");
});

server.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});
