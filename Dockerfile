# Syntax=docker/dockerfile:1.4

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Copy LICENSE early so it's available in builder
COPY LICENSE ./

# Enable Corepack and install dependencies
RUN corepack enable && \
    yarn install --immutable --production=false

# Copy source files
COPY . .

# Build the TypeScript project
RUN yarn build

# Production stage
FROM node:22-alpine AS runner

# OCI Labels
LABEL org.opencontainers.image.title="mealie-mcp-server" \
      org.opencontainers.image.description="A Model Context Protocol (MCP) server for Mealie recipe management. Exposes 43 tools and 1 prompt for AI assistants to search, create, and manage recipes, meal plans, shopping lists, categories, and tags." \
      org.opencontainers.image.ref.name="main" \
      org.opencontainers.image.licenses='MIT' \
      org.opencontainers.image.vendor="Timo Reymann <mail@timo-reymann.de>" \
      org.opencontainers.image.authors="Timo Reymann <mail@timo-reymann.de>" \
      org.opencontainers.image.url="https://github.com/timo-reymann/mealie-mcp-server" \
      org.opencontainers.image.documentation="https://github.com/timo-reymann/mealie-mcp-server" \
      org.opencontainers.image.source="https://github.com/timo-reymann/mealie-mcp-server.git"

WORKDIR /app

# Copy built files and LICENSE from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/LICENSE ./LICENSE

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
