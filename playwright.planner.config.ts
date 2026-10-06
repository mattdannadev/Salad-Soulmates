import config from './playwright.config';

// Isolated vendor-runtime checks require no application or database server.
export default { ...config, webServer: [] };
