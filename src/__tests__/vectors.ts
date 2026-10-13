// One P-256 key and message, signed once and stored in both the low-S and high-S DER encodings of
// the same signature: iOS and Android don't normalise S, so a verifier has to accept either.
export const VECTORS = {
  publicKey:
    'BB6aMpW+7SJL7GGj/UxFecBe9nNd8JXRo7+3snPn0jnQOPmiQq7i+pExAEZ+Y1ITykCQhXvpytrzqMssRLh2jhE=',
  message: 'approve:transfer:42:acct_123:nonce=8f2c',
  sigLowS:
    'MEQCIHLYuVXr5SwsXAlNmRDiZi2mZdsYSLT4qZ4523S2i4B0AiAS/YqcCNBiL7ocsEn6mUErMBXUE+EAHAntqpx6zDzUJQ==',
  sigHighS:
    'MEUCIHLYuVXr5SwsXAlNmRDiZi2mZdsYSLT4qZ4523S2i4B0AiEA7QJ1YvcvndFF40+2BWa+1IzRJpnGF4J7Bg8uSDAmUSw=',
  sigOtherMessage:
    'MEUCIAkhq8P7U3dtRRa+iQ/2sx9sLtACA1LuNNR88ESPWYw3AiEAkOIAi9YGgwmgZDa3Qs6Ats999LbsmBzDMWIeKCf6HZg=',
};
