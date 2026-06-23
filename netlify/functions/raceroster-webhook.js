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

exports.handler = async (event) => {

  // Log every incoming request for debugging
  console.log('=== INCOMING REQUEST ===');
  console.log('Method:', event.httpMethod);
  console.log('Query params:', JSON.stringify(event.queryStringParameters));
  console.log('Headers:', JSON.stringify(event.headers));
  console.log('Body:', event.body);

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    console.log('Rejected: not a POST');
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Check MailerLite API key is set
  if (!MAILERLITE_API_KEY) {
    console.error('MAILERLITE_API_KEY env var is not set!');
    return { statusCode: 500, body: 'Server misconfiguration: missing MailerLite API key' };
  }

  // Get event slug from query param e.g. ?event=shepparton-2026
  const params = event.queryStringParameters || {};
  const eventSlug = params.event;

  if (!eventSlug) {
    console.error('Missing ?event= query parameter');
    return { statusCode: 400, body: 'Missing ?event= query parameter' };
  }

  const groupId = GROUP_MAP[eventSlug];
  if (!groupId) {
    console.error(`Unknown event slug: ${eventSlug}`);
    return { statusCode: 400, body: `Unknown event slug: ${eventSlug}. Valid slugs: ${Object.keys(GROUP_MAP).join(', ')}` };
  }

  console.log(`Event slug: ${eventSlug} → Group ID: ${groupId}`);

  // Parse Race Roster payload
  let data;
  try {
    data = JSON.parse(event.body);
    console.log('Parsed payload:', JSON.stringify(data));
  } catch (err) {
    console.error('Failed to parse JSON body:', event.body);
    return { statusCode: 400, body: 'Invalid JSON payload' };
  }

  // Extract fields — log what we find
  const email     = data.email || data.participant_email;
  const firstName = data.first_name || data.firstname || data.first_name_official || '';
  const lastName  = data.last_name  || data.lastname  || data.last_name_official  || '';
  const phone     = data.phone || data.phone_number || '';
  const city      = data.city || '';
  const country   = data.country || '';
  const gender    = data.gender || '';

  console.log(`Extracted → email: ${email}, name: ${firstName} ${lastName}`);

  if (!email) {
    console.error('No email found in payload. Full payload was:', JSON.stringify(data));
    return { statusCode: 400, body: 'No email found in payload' };
  }

  // Build MailerLite subscriber payload
  const subscriberPayload = {
    email,
    fields: {
      name:      firstName,
      last_name: lastName,
      ...(phone   && { phone }),
      ...(city    && { city }),
      ...(country && { country }),
      ...(gender  && { gender }),
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

    console.log(`SUCCESS: Synced ${email} to group ${eventSlug} (${groupId})`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, email, group: eventSlug }),
    };

  } catch (err) {
    console.error('Fetch to MailerLite failed:', err.message);
    return { statusCode: 500, body: `Internal error: ${err.message}` };
  }
};
