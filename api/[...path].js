/**
 * Catch-all Serverless Function route for Vercel: /api/*
 * Forwards all dynamic subpaths (/api/drafts/..., /api/health, /api/state) to api/index.js
 */
const handler = require("./index.js");

module.exports = (req, res) => {
  return handler(req, res);
};
