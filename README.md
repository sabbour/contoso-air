# Contoso Air Demo Application

This project was created using Vite with React for the frontend and Node.js with Express for the backend using GitHub Copilot Edits.

## Project Structure

The project is organized into two main folders:
- `frontend/`: Contains the React application built with Vite
- `backend/`: Contains the Express.js API server

## Getting Started

### Installing Dependencies

To install all dependencies for both frontend and backend:

```bash
npm install && \
    npm install --prefix frontend && \
    npm install --prefix backend
```

### Development

Run both the frontend and backend in development mode concurrently.

```bash
npm run dev:all
```

### Production

Build the frontend for production and copy the build results to the backend's public folder.

```bash
npm run build
``` 

Start the backend server (ensure the frontend is built first).

```bash
npm run start
```

### Docker Deployment

To build and run the application using Docker:

1. Build the Docker image:
```bash
docker build -t contoso-air .
```

2. Run the Docker container:
```bash
docker run -p 3001:3001 -d contoso-air
```

3. Access the application at:
```
http://localhost:3001
```

### Frontend Scripts

- **`npm run dev`**: Starts the Vite development server for the React frontend.
- **`npm run build`**: Builds the React frontend for production.
- **`npm run preview`**: Serves the production build locally for preview.
- **`npm run lint`**: Runs ESLint to check for code quality issues.

### Backend Scripts
- **`npm run dev`**: Starts the backend server in development mode using Nodemon.
- **`npm run start`**: Starts the backend server in production mode.

## Prometheus Metrics
This application integrates Prometheus metrics to monitor performance and usage.

### Metrics Endpoint
- **Backend**: Metrics are exposed at `/api/metrics` on the backend server (default port: 3001).

### Accessing Metrics
To access the metrics, ensure the backend server is running and navigate to:
```
http://localhost:3001/api/metrics
```
You can configure Prometheus to scrape this endpoint for monitoring.

### Health Check Endpoint
- **Backend**: A health check endpoint is available at `/healthz` on the backend server (default port: 3001).

### Accessing Health Check
To verify the server's health, ensure the backend server is running and navigate to:
```
http://localhost:3001/healthz
```
This endpoint returns a JSON response indicating the server's status.
