import '@testing-library/jest-dom'

// jsdom does not provide a global fetch. Provide a no-op function so that
// tests can spy on / mock `global.fetch`. Individual tests override the
// implementation as needed.
if (typeof global.fetch !== 'function') {
  global.fetch = () => Promise.resolve({ ok: true, json: async () => ({}) })
}
