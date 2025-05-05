# Use the latest stable Node.js 20 image as the base image for building
FROM node:20 AS builder

# Set the working directory
WORKDIR /app

# Copy package.json files for all components
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies at the root level and in frontend/backend directories
RUN npm install && \
    npm install --prefix frontend && \
    npm install --prefix backend

# Copy the rest of the application code
COPY . .

# Build the application (builds frontend and copies to backend/public)
RUN npm run build

# Use a smaller image for the runtime stage
FROM node:20-slim AS runtime

# Set the working directory
WORKDIR /app

# Copy package.json files - they definitely exist
COPY package.json ./
COPY backend/package.json ./backend/

# Install only production dependencies
RUN npm install --only=production && \
    npm install --only=production --prefix backend

# Copy built application from builder stage
COPY --from=builder /app/backend ./backend

# Create a non-root user and set permissions
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# Expose the port the application runs on
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
