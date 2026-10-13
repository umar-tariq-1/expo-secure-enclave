// A minimal backend for the example app, using only Node's standard library (Node 20+):
//
//   GET  /challenge  -> { challenge }  a fresh random value for the app to sign
//   POST /verify     <- { publicKey, message, signature }  -> { valid }
//
// Run it with `npm run server`, then point the app at http://<your computer's LAN IP>:8787.
// A real backend would also remember which challenges it issued and accept each one only once;
// this one only demonstrates the signature check itself.
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);

// DER header that wraps a raw 65-byte P-256 point into a SubjectPublicKeyInfo (SPKI) structure.
const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

function verifySignature(publicKeyBase64, message, signatureBase64) {
  const publicKey = createPublicKey({
    key: Buffer.concat([P256_SPKI_PREFIX, Buffer.from(publicKeyBase64, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  return verify('sha256', Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
}

// Whether S is in the upper half of the curve order. Both forms are valid; this only records how
// often a device produces each (see TEST_PLAN.md, G5).
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
function sForm(signatureBase64) {
  try {
    const der = Buffer.from(signatureBase64, 'base64');
    const rLength = der[3];
    const sLength = der[5 + rLength];
    const s = BigInt(`0x${der.subarray(6 + rLength, 6 + rLength + sLength).toString('hex')}`);
    return s > P256_ORDER / 2n ? 'high S' : 'low S';
  } catch {
    return 'unparsable';
  }
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/challenge') {
    return send(response, 200, { challenge: `login:${randomBytes(16).toString('hex')}:${Date.now()}` });
  }
  if (request.method === 'POST' && request.url === '/verify') {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const { publicKey, message, signature } = JSON.parse(body);
      const valid = verifySignature(publicKey, message, signature);
      console.log(`verify: ${valid ? 'VALID' : 'INVALID'} (${sForm(signature)}) for ${JSON.stringify(message)}`);
      return send(response, 200, { valid });
    } catch (error) {
      return send(response, 400, { error: String(error) });
    }
  }
  send(response, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`expo-secure-enclave example server on port ${PORT}`);
});
