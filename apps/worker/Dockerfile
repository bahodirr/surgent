FROM oven/bun:alpine

WORKDIR /app

# Install only the server's production deps (cache-friendly)
COPY packages/server/package.json ./
RUN bun install --production

# Copy the server source
COPY packages/server ./

# Build once at image build time for fast startup/readiness
RUN bun run build

ENV PORT=5050

EXPOSE 5050

CMD ["bun", "run", "start"]


