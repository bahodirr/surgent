FROM node:22.17.0

# Install Claude Code, Codex CLI, and PM2 globally
RUN npm install -g @anthropic-ai/claude-code pm2

# Configure global git identity for non-interactive commits
RUN git config --global user.name "Surgent Dev" \
 && git config --global user.email "bot@surgent.dev"

# Set up workspace directory
WORKDIR /workspace

# Clone and prepare the React TypeScript template
RUN git clone https://github.com/ghostwriternr/vite_react_shadcn_ts.git template

# Install dependencies in the template
WORKDIR /workspace/template
RUN npm install

# Create non-root runtime user
RUN useradd -m -s /bin/bash agent

# Copy clean init script and PM2 config
COPY init-project.sh /usr/local/bin/init-project.sh
COPY ecosystem.config.cjs /workspace/ecosystem.config.cjs
RUN chmod +x /usr/local/bin/init-project.sh

# Return to workspace directory
WORKDIR /workspace

# Environment variable for Anthropic API key (will be set at runtime)
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_BASE_URL=""

ENV OPENAI_API_KEY=""

USER agent
ENTRYPOINT ["/usr/local/bin/init-project.sh"]
CMD ["sleep", "infinity"]
