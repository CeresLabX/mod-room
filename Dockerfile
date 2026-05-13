FROM node:20-slim

WORKDIR /app

# Install server deps (production only)
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# Copy server source
COPY server/ ./

# Install client deps (including devDeps for vite) and build
COPY client/ ./client/
RUN cd /app/client && npm install && NODE_ENV=development npm run build

# vite outputs to /app/server/public (vite.config.js outDir: '../server/public')
# No copy needed - vite writes directly to sibling directory

# Create uploads dir
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=8080
ENV HEALTHCHECK_PORT=8080

EXPOSE 8080

CMD ["node", "index.js"]
