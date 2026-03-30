FROM node:18-alpine

WORKDIR /app

# Copy server package files
COPY server/package*.json ./server/

# Install server dependencies
WORKDIR /app/server
RUN npm install --production

# Copy server source code
COPY server/ ./server/

# Set working directory to server
WORKDIR /app/server

# Expose port (Railway will override with PORT env var)
EXPOSE 5000

# Set environment variables (don't override PORT - Railway sets this)
ENV NODE_ENV=production

# Start the server
CMD ["node", "index.js"]
