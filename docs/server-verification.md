---
title: Server-side verification
nav_order: 5
description: "Verify expo-secure-enclave ECDSA P-256 signatures on your server with Node.js crypto, Web Crypto, jose, Python cryptography, Go, Java, or OpenSSL. Exact key and signature formats, and conversions to SPKI, PEM, and JWK."
---

# Server-side verification

The app sends your server two things: a public key once, at registration, and a signature each
time the user approves something. The server verifies the signature against the stored public key,
over exactly the bytes the app signed. Any standard ECDSA P-256 (secp256r1, prime256v1) library can
do this. Every snippet on this page was run against the [test vectors](#test-vectors) below.

## What you receive

| | Format |
|---|---|
| Public key, from `getOrCreatePublicKey()` | Standard base64 (with `=` padding) of the 65-byte uncompressed point `0x04 ‖ X(32) ‖ Y(32)`, the X9.63 / SEC 1 encoding. Not SPKI, not PEM. |
| Signature, from `sign()` | Standard base64 of the DER encoding `SEQUENCE { r INTEGER, s INTEGER }`, usually 70 to 72 bytes. ECDSA with SHA-256. Not the raw 64-byte `r ‖ s` form. |
| Signed bytes | The UTF-8 bytes of the string the app passed to `sign()`, or the exact `Uint8Array` it passed. The SHA-256 hash is computed by the signer; your verifier hashes the same bytes again itself. Don't hash the message before passing it to a verify function that hashes. |

iOS and Android produce identical formats.

### Converting the public key

- **To SPKI DER**: prepend the fixed 26-byte header
  `3059301306072a8648ce3d020106082a8648ce3d030107034200` (hex) to the 65 decoded bytes. Most
  libraries accept SPKI.
- **To PEM**: base64 the SPKI DER and wrap it in `-----BEGIN PUBLIC KEY-----` /
  `-----END PUBLIC KEY-----` lines.
- **To JWK**: `{ "kty": "EC", "crv": "P-256", "x": base64url(bytes 1 to 32), "y": base64url(bytes 33 to 64) }`.
- **To raw**: Web Crypto's `"raw"` format and Python's `from_encoded_point` take the 65 bytes as is.

### Low-S signatures

ECDSA signatures come in two equally valid forms, with a "low" or a "high" S value. The Secure
Enclave and Android Keystore don't normalize S, so roughly half of all signatures have a high S.
Some libraries reject high-S signatures by default, which looks like random verification failures.
Every verifier on this page accepts both. If yours doesn't, find its option for allowing high S
(for example, `@noble/curves` needs `lowS: false`, which this package's own `verify()` passes).

## Node.js

`node:crypto` only, no dependencies.

<!-- file: verify-node.mjs -->
```js
import { createPublicKey, verify } from 'node:crypto';

// DER header that wraps a raw 65-byte P-256 point into a SubjectPublicKeyInfo (SPKI) structure.
const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

export function verifySignature(publicKeyBase64, message, signatureBase64) {
  const publicKey = createPublicKey({
    key: Buffer.concat([P256_SPKI_PREFIX, Buffer.from(publicKeyBase64, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  // `message` must be what the app passed to sign(): a string there means its UTF-8 bytes.
  return verify('sha256', Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
}
```

`verify` throws on a malformed key or signature, so wrap it in `try`/`catch` when the inputs come
from a client (the [recipes](recipes.md#shared-pieces) do).

For JWTs verified with `jose`, see the [ES256 JWT recipe](recipes.md#es256-jwt-signed-by-the-device).

## Web Crypto

Cloudflare Workers, Deno, Bun, browsers, and Node.js 20 and later (`globalThis.crypto.subtle`). Web
Crypto expects the raw 64-byte `r ‖ s` signature, so convert from DER first.

<!-- file: verify-webcrypto.mjs -->
```js
function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Web Crypto expects ECDSA signatures as raw r || s (64 bytes), not DER.
function derToRaw(der) {
  let offset = 2;
  const readInteger = () => {
    const length = der[offset + 1];
    let value = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    while (value.length > 32 && value[0] === 0) value = value.subarray(1);
    const out = new Uint8Array(32);
    out.set(value, 32 - value.length);
    return out;
  };
  const raw = new Uint8Array(64);
  raw.set(readInteger(), 0);
  raw.set(readInteger(), 32);
  return raw;
}

export async function verifySignature(publicKeyBase64, message, signatureBase64) {
  const publicKey = await crypto.subtle.importKey(
    'raw', // the 65-byte X9.63 point is exactly Web Crypto's "raw" EC public key format
    base64ToBytes(publicKeyBase64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    derToRaw(base64ToBytes(signatureBase64)),
    new TextEncoder().encode(message)
  );
}
```

## Python

With [`cryptography`](https://cryptography.io/).

<!-- file: verify_signature.py -->
```python
import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec


def verify_signature(public_key_b64: str, message: bytes, signature_b64: str) -> bool:
    # from_encoded_point reads the 65-byte X9.63 point (0x04 || X || Y) directly.
    public_key = ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(), base64.b64decode(public_key_b64)
    )
    try:
        # DER signature, SHA-256 hashed internally: the same contract sign() uses.
        public_key.verify(base64.b64decode(signature_b64), message, ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False
```

Pass `message` as bytes: `"the signed string".encode("utf-8")`.

## Go

Standard library only. Needs Go 1.25 or later for `ecdsa.ParseUncompressedPublicKey`.

<!-- file: verify.go -->
```go
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
)

// VerifySignature checks a sign() result against a getOrCreatePublicKey() result.
func VerifySignature(publicKeyB64 string, message []byte, signatureB64 string) (bool, error) {
	rawKey, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil {
		return false, err
	}
	publicKey, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), rawKey)
	if err != nil {
		return false, err
	}
	signature, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return false, err
	}
	digest := sha256.Sum256(message)
	return ecdsa.VerifyASN1(publicKey, digest[:], signature), nil
}
```

## Java and Kotlin (JVM)

Standard library only (Java 17 or later, for `HexFormat`). The same calls work from Kotlin.

<!-- file: DeviceSignatures.java -->
```java
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;

public final class DeviceSignatures {
  // DER header that wraps a raw 65-byte P-256 point into a SubjectPublicKeyInfo (SPKI) structure.
  private static final byte[] P256_SPKI_PREFIX =
      HexFormat.of().parseHex("3059301306072a8648ce3d020106082a8648ce3d030107034200");

  public static boolean verify(String publicKeyBase64, String message, String signatureBase64)
      throws Exception {
    byte[] point = Base64.getDecoder().decode(publicKeyBase64);
    byte[] spki = new byte[P256_SPKI_PREFIX.length + point.length];
    System.arraycopy(P256_SPKI_PREFIX, 0, spki, 0, P256_SPKI_PREFIX.length);
    System.arraycopy(point, 0, spki, P256_SPKI_PREFIX.length, point.length);
    PublicKey publicKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(spki));

    Signature verifier = Signature.getInstance("SHA256withECDSA"); // expects DER, hashes internally
    verifier.initVerify(publicKey);
    verifier.update(message.getBytes(StandardCharsets.UTF_8));
    try {
      return verifier.verify(Base64.getDecoder().decode(signatureBase64));
    } catch (SignatureException malformed) {
      return false;
    }
  }
}
```

## OpenSSL command line

Handy for checking a signature by hand while debugging.

<!-- file: verify.sh -->
```sh
# PUBLIC_KEY, SIGNATURE and MESSAGE hold the values the app produced and signed.
( printf '3059301306072a8648ce3d020106082a8648ce3d030107034200' | xxd -r -p
  printf '%s' "$PUBLIC_KEY" | base64 -d ) > public.der
openssl pkey -pubin -inform DER -in public.der -out public.pem
printf '%s' "$SIGNATURE" | base64 -d > signature.der
printf '%s' "$MESSAGE" > message.txt
openssl dgst -sha256 -verify public.pem -signature signature.der message.txt   # "Verified OK"
```

## Test vectors

To check your own implementation: one P-256 key, one message, and the same signature in both its
low-S and high-S DER forms. Both signatures must verify, and a signature over any other message
must not.

```text
publicKey  BB6aMpW+7SJL7GGj/UxFecBe9nNd8JXRo7+3snPn0jnQOPmiQq7i+pExAEZ+Y1ITykCQhXvpytrzqMssRLh2jhE=
message    approve:transfer:42:acct_123:nonce=8f2c
sigLowS    MEQCIHLYuVXr5SwsXAlNmRDiZi2mZdsYSLT4qZ4523S2i4B0AiAS/YqcCNBiL7ocsEn6mUErMBXUE+EAHAntqpx6zDzUJQ==
sigHighS   MEUCIHLYuVXr5SwsXAlNmRDiZi2mZdsYSLT4qZ4523S2i4B0AiEA7QJ1YvcvndFF40+2BWa+1IzRJpnGF4J7Bg8uSDAmUSw=
```

## Common mistakes

- **Verifying different bytes than were signed.** Re-serializing JSON, trimming whitespace, or
  changing the encoding breaks the signature. Send the exact signed string alongside the
  signature, verify that string, then parse it.
- **Hashing twice.** `sign()` hashes the message with SHA-256 internally. Pass the original message
  to a verify function that also hashes (all of the above do), not a pre-computed hash.
- **DER versus raw.** JOSE and Web Crypto use the 64-byte `r ‖ s` form; most other libraries use
  DER. Convert as shown above.
- **base64 versus base64url.** This package uses standard base64 with padding.
- **Rejecting high S.** See [Low-S signatures](#low-s-signatures).
- **Trusting a public key just because it arrived.** Register keys only for authenticated users,
  and prove possession during registration, as in the
  [device registration recipe](recipes.md#register-a-device).
