FROM oven/bun:latest

# Install git and other system dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install Claude Code and PM2 globally
RUN bun install -g @anthropic-ai/claude-code pm2

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

# Copy clean init script and PM2 config
WORKDIR /workspace
COPY init-project.sh /usr/local/bin/init-project.sh
COPY ecosystem.config.cjs /workspace/ecosystem.config.cjs
RUN chmod +x /usr/local/bin/init-project.sh

# Environment variable for Anthropic API key (will be set at runtime)
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_BASE_URL=""

ENV OPENAI_API_KEY=""
ENTRYPOINT ["/usr/local/bin/init-project.sh"]
CMD ["sleep", "infinity"]
