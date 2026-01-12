const http = require("http");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/slow") {
    const delay = parseInt(url.searchParams.get("delay") || "5", 10);
    console.log(`Slow endpoint: delaying ${delay}s`);
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Responded after ${delay}s delay`);
    }, delay * 1000);
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from timeout-test");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
