# Contributing

Issues and pull requests are welcome.

## Setup

```sh
npm install          # also builds build/ through the `prepare` script
cd example && npm install
```

## Checks

```sh
npm run lint
npx tsc --noEmit
npx jest             # unit tests: error classification, Expo Go fallback, verify(), the Jest mock
npm run docs:check   # README.md and llms-full.txt match docs/
```

CI runs all of these.

## Documentation

`docs/*.md` is the single source for the documentation. The README sections between
`<!-- include docs/... -->` markers, and `llms-full.txt`, are generated from it: edit the page in
`docs/`, then run `npm run docs`. Keep code examples runnable, and keep every claim consistent with
what the code actually does.

## Native code

Swift and Kotlin changes aren't covered by the checks above. At minimum, compile both through the
example app:

```sh
cd example/android && ./gradlew :expo-secure-enclave:compileDebugKotlin
cd example/ios && xcodebuild -workspace exposecureenclaveexample.xcworkspace \
  -scheme ExpoSecureEnclave -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

(Run `npx expo prebuild` in `example/` first if the native folders don't exist yet.)

Behavior needs a physical device: the iOS Simulator has no Secure Enclave, and an Android emulator
needs a fingerprint enrolled through its extended controls before any biometric prompt works.
[`example/TEST_PLAN.md`](./example/TEST_PLAN.md) lists the device checks; please say in your pull
request which of them you ran, and on what.

## Reporting a security issue

Please don't open a public issue. Email the maintainer at the address in `package.json`.
