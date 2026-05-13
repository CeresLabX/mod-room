FROM node:20-slim

WORKDIR /app

# Install server deps
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# Copy server source (index.js, db.js, routes, etc.)
COPY server/ ./

# Copy client source and build
COPY client/ ./client/
RUN cd /app/client && npm install && NODE_ENV=development npm run build

# vite outputs to /app/server/public, copy to /app/public where server expects it
RUN cp -r /app/server/public /app/public

# Create uploads dir
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

COPY start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
