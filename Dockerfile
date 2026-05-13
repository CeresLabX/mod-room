FROM node:20-slim

WORKDIR /app

# Copy and install server deps
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# Copy full server source
COPY server/ ./

# Copy client source and build it
COPY client/ ./client/
RUN cd /app/client && npm install && npm run build

# vite's outDir: '../server/public' puts output at /app/server/public
# Create uploads dir
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD sleep 5 && node index.js
