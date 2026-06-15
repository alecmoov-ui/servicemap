# Universal container image — runs anywhere (Render, Azure, Fly, a VM, etc.).
# Builds the client and runs the Express server, which serves the built client
# and the API from a single port. The SQLite database lives on a mounted volume
# so data survives restarts and redeploys.

FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching). Dev deps are needed to build
# the client, so we install before setting NODE_ENV=production.
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci && npm ci --prefix server

# Copy source and build the client bundle.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
# Persist the SQLite database on a mounted volume.
ENV DB_PATH=/app/server/data/servicemap.db
VOLUME ["/app/server/data"]

EXPOSE 3001
CMD ["npm", "--prefix", "server", "start"]
