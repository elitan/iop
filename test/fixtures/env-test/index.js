const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let buildTimeEnv = {};
try {
  buildTimeEnv = JSON.parse(
    fs.readFileSync(path.join(__dirname, "build-env.json"), "utf-8"),
  );
} catch (_e) {
  console.log("No build-env.json found");
}

const server = http.createServer((req, res) => {
  const runtimeEnv = {
    BUILD_VAR: process.env.BUILD_VAR,
    RUNTIME_VAR: process.env.RUNTIME_VAR,
    SHARED_VAR: process.env.SHARED_VAR,
  };

  const response = {
    buildTime: buildTimeEnv,
    runtime: runtimeEnv,
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response, null, 2));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
