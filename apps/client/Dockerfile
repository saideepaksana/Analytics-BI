# Stage 1: Build the Vite application
FROM node:20-slim AS builder

WORKDIR /app

# Copy ROOT package contents for workspaces
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/

# Install workspace dependencies
RUN npm install

# Copy application source code
COPY apps/client ./apps/client/

# Set environment variables for the build
# We set API base URL to a relative path '/api' so Nginx proxies it to the backend container
ENV VITE_API_BASE_URL=/api
# Socket URL is also proxied
ENV VITE_SOCKET_URL=/

# Build the client app
RUN npm run build --workspace=apps/client

# Stage 2: Serve the application via Nginx
FROM nginx:alpine

# Copy the build output from the builder stage
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# Replace default Nginx configuration
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Run Nginx
CMD ["nginx", "-g", "daemon off;"]
