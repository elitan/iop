FROM node:20-alpine
WORKDIR /app
COPY apps/app/test/fixtures/monorepo/package.json /root-package.json
COPY apps/app/test/fixtures/monorepo/apps/api/package.json .
COPY apps/app/test/fixtures/monorepo/apps/api/index.js .
COPY apps/app/test/fixtures/monorepo/shared/config.js ./shared/
EXPOSE 8080
CMD ["node", "index.js"]
