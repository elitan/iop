FROM node:20-alpine

WORKDIR /app

COPY test/fixtures/env-test/package.json ./
COPY test/fixtures/env-test/build.js ./
COPY test/fixtures/env-test/index.js ./

# Copy .env if it exists (for build-time vars)
COPY test/fixtures/env-test/.en[v] ./

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
