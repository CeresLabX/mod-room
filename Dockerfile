FROM node:20-slim

WORKDIR /app

# Install server deps
COPY server/package.json server/package-lock.json* ./server/
RUN mkdir -p /app/server && cd /app/server && npm install --production

# Copy server source (index.js, db.js, routes, etc.) into /app/server/
COPY server/ ./server/

# Copy client source and build (vite outputs to server/public)
COPY client/ ./client/
RUN cd /app/client && npm install && NODE_ENV=development npm run build

# vite outputs to /app/server/public — server runs from /app/server, serve from /app/server/public
# (no need to copy to /app/public)

# Create uploads dir
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

COPY start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
