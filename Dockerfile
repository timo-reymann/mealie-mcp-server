# Syntax=docker/dockerfile:1.4

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Enable Corepack and install dependencies
RUN corepack enable && \
    yarn install --immutable --production=false

# Copy source files
COPY . .

# Build the TypeScript project
RUN yarn build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Install only production dependencies
RUN corepack enable && \
    yarn install --immutable --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose the default MCP server port (stdio, but can be used with TCP if needed)
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["node", "dist/index.js"]
