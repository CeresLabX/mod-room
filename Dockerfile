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

# Copy built client to public (where Express looks for it)
RUN cp -r /app/client/dist /app/public

# Create uploads dir
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD sleep 5 && node index.js
