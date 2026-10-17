// Privacy-relay domains: they forward to an inbox the user reads, so they are
// let through even when a blocklist contains them.
// Same list as github.com/yasaiiko/disposable-list-audit (relays.json).
export const RELAYS = new Set([
  'privaterelay.appleid.com', // Apple Hide My Email
  'duck.com', // DuckDuckGo Email Protection
  'mozmail.com', // Firefox Relay
  'relay.firefox.com',
  'simplelogin.com', // SimpleLogin
  'simplelogin.co',
  'slmail.me',
  'aleeas.com',
  'passmail.net', // Proton Pass
  'passinbox.com',
  'addy.io', // addy.io (AnonAddy)
  'anonaddy.com',
  'anonaddy.me',
  '33mail.com', // 33mail
]);
