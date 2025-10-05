FROM node:latest

# Install system dependencies (git for cloning, ca-certificates for HTTPS, jq for JSON parsing)
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  ca-certificates \
  curl \
  jq \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure Bun global bin path for all users
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Install Claude Code and PM2 globally with Bun
RUN bun add -g @anthropic-ai/claude-code pm2

# Configure global git identity for non-interactive commits
RUN git config --global user.name "Surgent Dev" \
 && git config --global user.email "bot@surgent.dev"

# Set up workspace directory
WORKDIR /workspace

# Clone and prepare the React TypeScript template
RUN git clone https://github.com/bahodirr/worker-vite-react-template.git template

# Install dependencies in the template
WORKDIR /workspace/template
RUN bun install

# Create non-root runtime user
# RUN useradd -m -s /bin/bash agent

# Persist bash history for debugging
RUN mkdir -p /commandhistory \
  && touch /commandhistory/.bash_history \
  # && chown -R agent:agent /commandhistory

# Configure bash history persistence for agent user
# RUN echo "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" >> /home/agent/.bashrc

# Copy clean init script and PM2 config
WORKDIR /workspace
COPY init-project.sh /usr/local/bin/init-project.sh
COPY ecosystem.config.cjs /workspace/ecosystem.config.cjs
RUN chmod +x /usr/local/bin/init-project.sh

# Ensure agent owns the workspace so it can write to cloned repos
# RUN chown -R agent:agent /workspace

# Run as non-root user
# USER agent

# Environment variable for Anthropic API key (will be set at runtime)
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_BASE_URL=""

ENV OPENAI_API_KEY=""
ENTRYPOINT ["/usr/local/bin/init-project.sh"]
CMD ["sleep", "infinity"]
