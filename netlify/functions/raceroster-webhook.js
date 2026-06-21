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

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Optional: validate Race Roster API key from Authorization header
  // Race Roster sends: Authorization: Basic <base64-encoded-api-key>
  const authHeader = event.headers['authorization'] || '';
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString('utf8');
    if (process.env.RACEROSTER_API_KEY && decoded !== process.env.RACEROSTER_API_KEY) {
      console.warn('Invalid Race Roster API key received');
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  // Get event slug from query param e.g. ?event=shepparton-2026
  const params = event.queryStringParameters || {};
  const eventSlug = params.event;

  if (!eventSlug) {
    return { statusCode: 400, body: 'Missing ?event= query parameter' };
  }

  const groupId = GROUP_MAP[eventSlug];
  if (!groupId) {
    return { statusCode: 400, body: `Unknown event slug: ${eventSlug}. Valid slugs: ${Object.keys(GROUP_MAP).join(', ')}` };
  }

  // Parse Race Roster payload
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON payload' };
  }

  // Extract fields from Race Roster data tags
  // Adjust these keys to match the tags you selected in Race Roster
  const email      = data.email || data.participant_email;
  const firstName  = data.first_name || data.firstname || data.first_name_official || '';
  const lastName   = data.last_name  || data.lastname  || data.last_name_official  || '';
  const phone      = data.phone || data.phone_number || '';
  const city       = data.city || '';
  const state      = data.state || data.province || '';
  const country    = data.country || '';
  const gender     = data.gender || '';
  const dob        = data.date_of_birth || data.dob || '';
  const distance   = data.distance || data.race_distance || data.event_distance || '';
  const regDate    = data.registration_date || data.registered_at || '';

  if (!email) {
    console.error('No email in payload:', JSON.stringify(data));
    return { statusCode: 400, body: 'No email found in payload' };
  }

  // Build MailerLite subscriber payload
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

    if (!mlRes.ok) {
      console.error('MailerLite error:', JSON.stringify(result));
      return { statusCode: 502, body: `MailerLite error: ${JSON.stringify(result)}` };
    }

    console.log(`Synced ${email} to group ${eventSlug} (${groupId})`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, email, group: eventSlug }),
    };

  } catch (err) {
    console.error('Fetch error:', err.message);
    return { statusCode: 500, body: `Internal error: ${err.message}` };
  }
};
