const http = require("node:http");
const { APP_NAME } = require("./shared/config");

const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(APP_NAME);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
