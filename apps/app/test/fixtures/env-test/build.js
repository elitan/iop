const fs = require("node:fs");
const path = require("node:path");

const buildTimeEnv = {};

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      buildTimeEnv[key.trim()] = rest.join("=").trim();
    }
  }
}

fs.writeFileSync(
  path.join(__dirname, "build-env.json"),
  JSON.stringify(buildTimeEnv, null, 2),
);

console.log("Build-time env vars captured:", Object.keys(buildTimeEnv));
