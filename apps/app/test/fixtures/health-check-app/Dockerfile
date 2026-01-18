FROM node:20-alpine
WORKDIR /app
COPY test/fixtures/health-check-app/package.json .
COPY test/fixtures/health-check-app/index.js .
EXPOSE 8080
CMD ["node", "index.js"]
