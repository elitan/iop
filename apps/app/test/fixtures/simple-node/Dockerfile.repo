FROM node:20-alpine
WORKDIR /app
COPY apps/app/test/fixtures/simple-node/package.json .
COPY apps/app/test/fixtures/simple-node/index.js .
EXPOSE 8080
CMD ["node", "index.js"]
