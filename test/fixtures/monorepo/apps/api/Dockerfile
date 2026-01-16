FROM node:20-alpine
WORKDIR /app
COPY package.json /root-package.json
COPY apps/api/package.json .
COPY apps/api/index.js .
COPY shared/config.js ./shared/
EXPOSE 8080
CMD ["node", "index.js"]
