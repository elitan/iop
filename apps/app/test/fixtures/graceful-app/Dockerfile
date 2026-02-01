FROM node:20-alpine
WORKDIR /app
COPY test/fixtures/graceful-app/package.json .
COPY test/fixtures/graceful-app/index.js .
EXPOSE 8080
CMD ["node", "index.js"]
