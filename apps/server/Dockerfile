FROM node:20-slim

WORKDIR /app

# Copy package.json and package-lock.json first to cache dependencies
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
# Copy all package.json files for workspaces


# Install only production dependencies
# Run npm install for the entire workspace
RUN npm install --workspace=apps/server --omit=dev

# Copy the server source code
COPY apps/server ./apps/server/
# If server depends on packages, copy them as well


# Set env to production
ENV NODE_ENV=production
ENV PORT=5000

# Expose the API port
EXPOSE 5000

# Start server
CMD ["node", "apps/server/src/index.js"]
