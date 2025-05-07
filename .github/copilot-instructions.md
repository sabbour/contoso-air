<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a Vite + React project. Please ensure that suggestions align with the React framework and Vite's build tool capabilities.

1. Use the latest stable Node.js image as the base image for the builder stage.
2. Set the working directory to `/app`.
3. Copy all `package.json` and `package-lock.json` files from the root, frontend, and backend directories into their respective locations.
4. Install dependencies for each directory using appropriate npm commands.
5. Copy the rest of the application code into the `/app` directory.
6. Build the application using `npm run build`, assuming the build process handles both frontend and backend.
7. Use a smaller Node.js image (such as slim variant) for the runtime stage.
8. Set the working directory to `/app`.
9. Copy the necessary package.json files into their appropriate locations.
10. Install only production dependencies using `npm install --only=production` commands for each directory as needed.
11. Copy the built application from the builder stage into the runtime stage.
12. Create a non-root user (appuser) and set proper permissions for `/app`.
13. Expose the port used by the backend server. Don't assume the default, look for the port to use in the source code.
14. Use `CMD ["npm", "start"]` to start the application.

Ensure the Dockerfile follows best practices for containerization including proper layer caching and security.

When you're done, update the README.md with instructions on how to start the container using Docker, includng the port.

Refer to additional instruction files in this directory that start with `copilot-instructions-` for more scenario specific instructions.

# Copilot instructions for Auto Instrumentation using Azure Monitor Application Insights

This file contains instructions for creating an Instrumentation resource in Kubernetes. The intention here is to use the codeless auto-instrumentation feature without installing any SDKs, so don't attempt to install any additional packages or modify the application code.


For the !!~application_language~!!, the following platforms are supported. Detect the language and replace the value:
- NodeJs
- Java

You can get the connection string by asking @azure get the connection string of the contosoair-appinsights resource using azure resource graph.

Don't create additional folders. Look for where the Kubernetes *.yaml files are stored, likely under "manifests" and create the file there.

When creating an Instrumentation use the following template and replace the !!~PLACEHOLDERS~!!:

```
apiVersion: monitor.azure.com/v1
kind: Instrumentation
metadata:
  name: default # must be called default
  namespace: !!~namespace_name~!!
spec:
  settings:
    autoInstrumentationPlatforms: # required
      - !!~application_language~!!
  destination: 
    applicationInsightsConnectionString: "!!~connection_string~!!"
```

# Copilot Instructions for Workload Identity

This project uses Workload Identity for authentication to Azure services. Follow these instructions when generating code or configuration related to Workload Identity:

1. Important: Don't use IMDS endpoint, this is deprecated. Use Azure Workload Identity.
2. Use the `@azure/identity` library for Node.js
3. Ensure the app uses these environment variables AZURE_TENANT_ID, AZURE_CLIENT_SECRET
4. Use the DefaultAzureCredential when retrieving credentials

Ensure all generated code and configurations follow best practices for security and scalability.

# Copilot instructions for ServiceMonitor for Azure Monitor managed service for Prometheus

This file contains instructions for creating a ServiceMonitor resource in Kubernetes. The ServiceMonitor resource is used to monitor the health and performance of a service in a Kubernetes cluster.

Don't create additional folders. Look for where the Kubernetes *.yaml files are stored, likely under "manifests" and create the file there.

When creating a Service Monitor use the following template and replace the !!~PLACEHOLDERS~!!:

```
apiVersion: azmonitoring.coreos.com/v1
kind: ServiceMonitor

metadata:
  name: !!~name_of_service_monitor~!!
spec:
  labelLimit: 63
  labelNameLengthLimit: 511
  labelValueLengthLimit: 1023

  # The selector filters endpoints by service labels.
  selector:
    matchLabels:
      !!~matching_label_for_target_service~!!

  # Multiple endpoints can be specified. Port requires a named port.
  endpoints:
  - port: !!~named_port_on_service~!!
    interval: 30s
    path: !!~metrics_path~!!
    scheme: http
```
