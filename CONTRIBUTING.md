# Contributing

Issues and PRs are welcome.

## Setup

```sh
npm install
npm run build
cd example && npm install
npm run open:ios     # or open:android
```

## Before opening a PR

```sh
npm run lint
npx tsc --noEmit
```

Native changes (Swift/Kotlin) can't be verified by CI alone, so please note in the PR description
whether you've tested on a real device (the Secure Enclave doesn't exist in the iOS Simulator; an
Android emulator needs a "Fingerprint" sensor configured in its AVD settings to test biometric
prompts at all).

## Reporting a security issue

Please email the maintainer directly (see `package.json`) rather than opening a public issue.
