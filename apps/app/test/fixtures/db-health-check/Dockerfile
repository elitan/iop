FROM node:20-alpine
WORKDIR /app
COPY test/fixtures/db-health-check/package.json ./
RUN npm install --production
COPY test/fixtures/db-health-check/index.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
