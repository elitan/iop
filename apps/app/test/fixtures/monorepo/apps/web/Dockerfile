FROM node:20-alpine
WORKDIR /app
COPY apps/app/test/fixtures/monorepo/package.json /root-package.json
COPY apps/app/test/fixtures/monorepo/apps/web/package.json .
COPY apps/app/test/fixtures/monorepo/apps/web/index.js .
EXPOSE 3000
CMD ["node", "index.js"]
