const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;

const GROUP_MAP = {
  // 2026 Events
  'shepparton-2026':     '171114678583297819',
  'inverloch-2026':      '151632092665480549',
  'vineyards-2026':      '163844274205492740',
  'lakes-entrance-2026': '190871426412054300',
  // 2027 Events
  'shepparton-2027':     '190871428090824244',
  'inverloch-2027':      '190871429755963026',
  'vineyards-2027':      '190871431687439733',
  'lakes-entrance-2027': '190871433323218340',
};

// Parse application/x-www-form-urlencoded body
function parseFormBody(body) {
  const params = {};
  const pairs = body.split('&');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, ' '));
    const val = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
    params[key] = val;
  }
  return params;
}

exports.handler = async (event) => {

  console.log('=== INCOMING REQUEST ===');
  console.log('Method:', event.httpMethod);
  console.log('Query params:', JSON.stringify(event.queryStringParameters));
  console.log('Content-Type:', event.headers['content-type']);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!MAILERLITE_API_KEY) {
    console.error('MAILERLITE_API_KEY env var is not set!');
    return { statusCode: 500, body: 'Server misconfiguration: missing MailerLite API key' };
  }

  const params = event.queryStringParameters || {};
  const eventSlug = params.event;

  if (!eventSlug) {
    console.error('Missing ?event= query parameter');
    return { statusCode: 400, body: 'Missing ?event= query parameter' };
  }

  const groupId = GROUP_MAP[eventSlug];
  if (!groupId) {
    console.error(`Unknown event slug: ${eventSlug}`);
    return { statusCode: 400, body: `Unknown event slug: ${eventSlug}` };
  }

  console.log(`Event slug: ${eventSlug} → Group ID: ${groupId}`);

  // Parse form-encoded body (Race Roster sends application/x-www-form-urlencoded)
  let data;
  try {
    data = parseFormBody(event.body);
    console.log('Parsed payload:', JSON.stringify(data));
  } catch (err) {
    console.error('Failed to parse body:', err.message);
    return { statusCode: 400, body: 'Failed to parse request body' };
  }

  const email     = data.email || data.participant_email;
  const firstName = data.first_name || data.firstname || '';
  const lastName  = data.last_name  || data.lastname  || '';
  const phone     = data.phone || data.phone_number || '';
  const city      = data.city || '';
  const country   = data.country || '';
  const gender    = data.sex || data.gender || '';
  const distance  = data.distance_of_sub_event || data.sub_event || '';

  console.log(`Extracted → email: ${email}, name: ${firstName} ${lastName}, distance: ${distance}`);

  if (!email) {
    console.error('No email found in payload');
    return { statusCode: 400, body: 'No email found in payload' };
  }

  const subscriberPayload = {
    email,
    fields: {
      name:      firstName,
      last_name: lastName,
      ...(phone    && { phone }),
      ...(city     && { city }),
      ...(country  && { country }),
      ...(gender   && { gender }),
    },
    groups: [groupId],
    status: 'active',
  };

  console.log('Sending to MailerLite:', JSON.stringify(subscriberPayload));

  try {
    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAILERLITE_API_KEY}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(subscriberPayload),
    });

    const result = await mlRes.json();
    console.log('MailerLite response status:', mlRes.status);
    console.log('MailerLite response body:', JSON.stringify(result));

    if (!mlRes.ok) {
      console.error('MailerLite rejected the request:', JSON.stringify(result));
      return { statusCode: 502, body: `MailerLite error: ${JSON.stringify(result)}` };
    }

    console.log(`SUCCESS: Synced ${email} → ${eventSlug} (${groupId})`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, email, group: eventSlug }),
    };

  } catch (err) {
    console.error('Fetch to MailerLite failed:', err.message);
    return { statusCode: 500, body: `Internal error: ${err.message}` };
  }
};
