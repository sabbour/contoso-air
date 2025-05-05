<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a Vite + React project. Please ensure that suggestions align with the React framework and Vite's build tool capabilities.

Dockerfile generation:
* Use the latest stable Node.js image as the base image for building based on the node engine spec in the package.json
* Use a smaller image for the runtime stage in multi-stage builds
* Generate .dockerignore to exclude unnecessary files from the build context but be careful not exclude important files.
* DO NOT CHANGE my .dockerignore.
* If there are multiple package.json files, prioritize the one in the root. Don't build individual package.json files. Assume the root package.json file knows how to build the app.
* Use `npm run build` for building, and `npm start` for running the app
* Use `npm install` to install dependencies
* Don't use nginx to serve the application, assume the app is self hosted
* Use multi-stage builds to reduce image size (builder → runtime)
* Avoid running the application as root; create a non-root user (appuser) and set proper permissions
* Leverage caching by copying and installing package.json and package-lock.json before copying the rest of the code
* For the runtime stage, install only production dependencies using `npm install --only=production`
* Confirm that you can build the image successfully by outputting the docker build command
* Confirm that you can run the image successfully by outputting the docker run command
* Create runnable commands as much as you can so that I can test them by clicking a button
* If this is a web app, output the URL the user can use to test
* Expose the port that is running the Express server in the backend from index.js
* The npm build process already copies the Vite build results from the frontend. There's no need to copy `/app/dist` to `./dist`, just copy `/app` to `./`.
