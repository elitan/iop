FROM node:20-alpine
WORKDIR /app
COPY test/fixtures/monorepo/package.json /root-package.json
COPY test/fixtures/monorepo/apps/api/package.json .
COPY test/fixtures/monorepo/apps/api/index.js .
COPY test/fixtures/monorepo/shared/config.js ./shared/
EXPOSE 8080
CMD ["node", "index.js"]
