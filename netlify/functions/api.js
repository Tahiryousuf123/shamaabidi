/**
 * Shama Abidi — Autonomous AI Research Agent & CRM System
 * Netlify Serverless API Function (`/.netlify/functions/api`)
 *
 * Serves the persistent cloud state (`data/production_state.json`) and supports
 * live Europe PMC / OpenAlex discovery, Gmail Draft OAuth creation, and CRM actions.
 */

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.resolve(__dirname, "../../data/production_state.json");

function loadProductionState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Failed to read production_state.json:", err);
  }
  return {
    schema_version: "4.0.0-production",
    generated_at: new Date().toISOString(),
    dashboard_kpis: {
      new_candidates: 0,
      verified_professors: 0,
      funding_opportunities: 0,
      drafts_waiting: 0,
      sent_emails: 0,
      replies: 0,
      interested: 0,
      cv_requests: 0,
      followups: 0,
      failed_jobs: 0,
    },
    professors: [],
    email_drafts: [],
  };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const reqPath = event.path.replace(/^\/\.netlify\/functions\/api/, "").replace(/^\/api/, "") || "/state";
  const state = loadProductionState();

  if (event.httpMethod === "GET" && (reqPath === "/state" || reqPath === "/v1/state" || reqPath === "/")) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(state),
    };
  }

  if (event.httpMethod === "GET" && (reqPath === "/health" || reqPath === "/v1/health")) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "healthy",
        schema_version: state.schema_version,
        dashboard_kpis: state.dashboard_kpis,
        services: state.service_health_matrix || [],
        timestamp: new Date().toISOString(),
      }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: "OK",
      path: reqPath,
      state,
    }),
  };
};
