exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid request body' }) };
  }

  const { license_key } = body;
  if (!license_key) {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Missing license_key' }) };
  }

  try {
    const params = new URLSearchParams({
      product_id: 'giewkh',
      license_key: license_key,
      increment_uses_count: 'false'
    });

    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Verification failed: ' + err.message })
    };
  }
};
