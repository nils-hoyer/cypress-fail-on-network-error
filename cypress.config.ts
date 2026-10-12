import { defineConfig } from 'cypress';

export default defineConfig({
    screenshotOnRunFailure: false,
    video: false,
    // npm run build:be serves the test pages on port 3000; the integration
    // tests start their own server on a free port and override baseUrl
    e2e: { baseUrl: 'http://localhost:3000' },
});
