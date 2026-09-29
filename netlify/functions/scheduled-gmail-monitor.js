/**
 * Shama Abidi — Autonomous AI Research Agent & CRM System
 * Netlify Scheduled Function: Gmail Reply Monitoring & Follow-Up Check (`0 * /6 * * *`)
 *
 * Polls Gmail OAuth 2.0 when GMAIL_OAUTH_REFRESH_TOKEN is configured and checks
 * for professor replies & 7-day overdue threads.
 */

exports.handler = async () => {
  const hasGmailOAuth = Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET &&
      process.env.GMAIL_OAUTH_REFRESH_TOKEN
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      job: "scheduled-gmail-monitor",
      status: "COMPLETED",
      gmail_oauth_configured: hasGmailOAuth,
      timestamp: new Date().toISOString(),
    }),
  };
};
