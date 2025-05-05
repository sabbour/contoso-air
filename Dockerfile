# Build stage
FROM node:20 AS builder

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm ci
RUN npm ci --prefix frontend
RUN npm ci --prefix backend

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Runtime stage
FROM node:20-slim AS runtime

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install only production dependencies
RUN npm ci --only=production
RUN npm ci --only=production --prefix backend

# Copy built application from builder stage
COPY --from=builder /app/backend/public ./backend/public
COPY --from=builder /app/backend/src ./backend/src

# Create a non-root user and set proper permissions
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port the backend server runs on
EXPOSE 3001

# Start the application
CMD ["npm", "start"]