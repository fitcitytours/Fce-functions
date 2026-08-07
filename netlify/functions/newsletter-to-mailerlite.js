// Netlify Function: relays fitcity.tours newsletter signups to MailerLite.
//
// Trigger: fitcity.tours' Netlify site should call this on every "newsletter"
// form submission, via Forms → Notifications → Outgoing webhook, pointed at:
//   https://<this-project's-domain>/.netlify/functions/newsletter-to-mailerlite
//
// Required environment variable on THIS Netlify project (fitcityfunctions):
//   MAILERLITE_API_KEY   — a MailerLite API token with subscriber write access
//   MAILERLITE_GROUP_ID  — the numeric ID of the "Fit City Tours - General" group
//
// Netlify's form-submission webhook payload looks like:
//   { "payload": { "data": { "email": "...", "form-name": "newsletter", ... } } }
// This handles that shape, and also a plain { "email": "..." } body as a fallback
// in case the site's own JS ever posts directly to this function instead.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const API_KEY = process.env.MAILERLITE_API_KEY;
  const GROUP_ID = process.env.MAILERLITE_GROUP_ID;

  if (!API_KEY || !GROUP_ID) {
    console.error("Missing MAILERLITE_API_KEY or MAILERLITE_GROUP_ID environment variable");
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Netlify's outgoing form-notification webhook nests the submitted fields
  // under payload.data. Support both that shape and a flat body.
  const data = (body.payload && body.payload.data) || body;
  const email = data.email;

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing email" }) };
  }

  try {
    const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        email: email,
        groups: [GROUP_ID],
        status: "active",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("MailerLite API error:", response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: "MailerLite API error" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("Relay failed:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Relay failed" }) };
  }
};
