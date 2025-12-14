FROM node:lts-slim

# Install system dependencies required for bun and project dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  ca-certificates \
  curl \
  jq \
  unzip \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL=/root/.bun
ENV PATH=$BUN_INSTALL/bin:$PATH

# Install global dependencies with bun
RUN bun add -g @anthropic-ai/claude-code pm2

# Configure global git identity for non-interactive commits
RUN git config --global user.name "Surgent Dev" \
  && git config --global user.email "bot@surgent.dev"

# Set up workspace directory
WORKDIR /workspace

# Runtime environment variables (set at runtime)
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_BASE_URL=""
ENV OPENAI_API_KEY=""

CMD ["claude", "--version"]
ENTRYPOINT ["sleep", "infinity"]