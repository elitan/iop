const http = require("node:http");
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("OK");
    return;
  }
  res.writeHead(200);
  res.end("Hello from frost-yaml-test");
});
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
