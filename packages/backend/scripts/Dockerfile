FROM node:latest

# Install system dependencies (git for cloning, ca-certificates for HTTPS, jq for JSON parsing)
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  ca-certificates \
  curl \
  jq \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL=/root/.bun
ENV PATH=$BUN_INSTALL/bin:$PATH

# Install Claude Code and PM2 globally with Bun
RUN bun add -g @anthropic-ai/claude-code

# Configure global git identity for non-interactive commits
RUN git config --global user.name "Surgent Dev" \
 && git config --global user.email "bot@surgent.dev"

# Set up workspace directory
WORKDIR /workspace

# Environment variable for Anthropic API key (will be set at runtime)
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_BASE_URL=""
ENV OPENAI_API_KEY=""

CMD ["claude", "--version"]
ENTRYPOINT ["sleep", "infinity"]
