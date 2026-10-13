// Jest entry point for `expo-secure-enclave/mock`, an in-memory stand-in for the package:
//   jest.mock('expo-secure-enclave', () => require('expo-secure-enclave/mock'));
// See src/mock.ts for what it does and how to drive it with `mockControls`.
module.exports = require('./build/mock');
