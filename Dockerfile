FROM node:20-alpine AS builder

WORKDIR /app

# Install server deps
COPY server/package.json server/package-lock.json* /app/server/
RUN cd /app/server && npm install

# Install client deps and build
COPY client/package.json client/package-lock.json* /app/client/
RUN cd /app/client && npm install
COPY client/ /app/client/
RUN cd /app/client && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built client and server
COPY --from=builder /app/server /app/server
COPY --from=builder /app/client/dist /app/server/public

# Create uploads dir
RUN mkdir -p /app/server/uploads

WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
