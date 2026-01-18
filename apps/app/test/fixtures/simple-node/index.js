const http = require("node:http");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      message: "Hello from simple-node!",
      time: new Date().toISOString(),
    }),
  );
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
