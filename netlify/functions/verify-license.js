const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ success: false }) };
  }

  const { license_key } = body;
  if (!license_key) {
    return { statusCode: 400, body: JSON.stringify({ success: false }) };
  }

  const postData = new URLSearchParams({
    product_id: 'giewkh',
    license_key: license_key,
    increment_uses_count: 'false'
  }).toString();

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.gumroad.com',
      path: '/v2/licenses/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ success: false, message: err.message })
      });
    });

    req.write(postData);
    req.end();
  });
};
