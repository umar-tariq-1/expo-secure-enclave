# expo-secure-enclave example

A minimal Expo app that exercises the whole API on a real device: check availability, create a
key, sign a message with a biometric prompt, verify the signature (in the app or on a small local
server), and delete the key. Every call's result, including the error `reason` and the platform's
raw `message`, is appended to a log on screen, which is what [TEST_PLAN.md](./TEST_PLAN.md) uses.

## Run it

You need a physical device: the iOS Simulator has no Secure Enclave, and an Android emulator only
works with a fingerprint enrolled through its extended controls (and its keys aren't
hardware-backed).

```sh
# from the repository root
npm install
cd example
npm install
npx expo run:ios --device        # or: npx expo run:android --device
```

`npx expo run:*` runs `expo prebuild`, which applies the config plugin (the Face ID usage
description), builds, and installs the app.

## Verify on a server

`server/verify-server.mjs` is a dependency-free Node.js server with the same verification code as
the [server-side verification docs](../docs/server-verification.md):

```sh
npm run server     # listens on port 8787
```

In the app, set the server URL to your computer's LAN address (for example
`http://192.168.1.10:8787`), tap **Get challenge** to sign a server-issued challenge, then
**Verify on server**. The server prints `VALID` or `INVALID` for each request. This works in a
debug build, which already uses plain HTTP on your network to reach Metro.

## How the example uses the library

It uses the library from the parent folder rather than from npm: `metro.config.js` resolves
`expo-secure-enclave` to `..`, `package.json` points Expo's autolinking at `..`, and `app.json`
loads the config plugin as `../app.plugin.js`. In your own app, install the package and use
`"expo-secure-enclave"` as the plugin name instead.
