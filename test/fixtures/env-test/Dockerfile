FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY build.js ./
COPY index.js ./

# Copy .env if it exists (for build-time vars)
COPY .en[v] ./

# Run build script to capture .env vars
RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
