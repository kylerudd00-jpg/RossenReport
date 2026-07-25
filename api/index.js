// Vercel entry point. server.js exports the Express app rather than binding a
// port, so the whole app runs as a single serverless function and every existing
// route keeps working unchanged.
module.exports = require('../server.js');
