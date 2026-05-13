FROM node:20-slim

WORKDIR /app

# Install server deps
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# Copy server source
COPY server/ ./

# Build client
COPY client/ ./client/
RUN cd /app/client && npm install && npm run build

# The client build already outputs to ../server/public due to vite.config.js
# But since we're in /app, the build outputs to /app/public
# No extra copy needed — vite build writes directly to /app/public

# Create uploads dir
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD sleep 5 && node index.js
