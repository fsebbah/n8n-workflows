# ============================================
# n8n Custom Image with redis-cli
# ============================================
# Extends official n8n image to add redis-cli
# Required for Execute Command node to run XADD
# See RFC-090 for details
# ============================================

FROM docker.n8n.io/n8nio/n8n:latest

# Switch to root to install packages
USER root

# Install redis-tools (includes redis-cli)
# n8n base image is Alpine Linux
RUN apk add --no-cache redis

# Verify installation
RUN redis-cli --version

# Switch back to node user (n8n default)
USER node

# Default command (inherited from base image)
