# better-auth-vetto

A [Better Auth](https://www.better-auth.com) plugin that rejects disposable sign-up emails **without any API call**, and doesn't punish privacy-conscious users.

- **Offline blocklist:** ~9,900 disposable domains from the CC0 [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) project, bundled. Subdomains match too (`x.mailinator.com`).
- **Privacy relays allowed:** Apple Hide My Email, DuckDuckGo, Firefox Relay, SimpleLogin, Proton Pass, addy.io and 33mail forward to an inbox the user reads, so they're let through even if you add a bigger blocklist. Some popular lists block them; see [the audit](https://github.com/yasaiiko/disposable-list-audit).
- **Dead domains (optional):** `checkMx: true` rejects domains that can't receive mail (NXDOMAIN, null MX, or no MX and no A/AAAA). DNS errors and timeouts let the signup through.
- **Gmail alias key:** `canonicalEmail()` folds `j.a.n.e+trial7@googlemail.com` to `jane@gmail.com`, so you can store a uniqueness key. Dots are only stripped for Gmail.

Step-by-step guide with the full setup: [Block disposable emails in Better Auth](https://usevetto.com/block-disposable-emails-better-auth).

## Install

```sh
npm install better-auth-vetto
```

```ts
import { betterAuth } from 'better-auth';
import { vetto } from 'better-auth-vetto';

export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  plugins: [
    vetto({
      checkMx: true, // Node runtimes only; skipped where node:dns isn't available
      allow: ['partner-company.com'],
      block: ['some-new-throwaway.com'],
    }),
  ],
});
```

A blocked request gets a `400` with a message you can show next to the email field.

## Options

| Option | Default | |
|---|---|---|
| `allow` | `[]` | Domains always accepted (checked first). |
| `block` | `[]` | Extra domains to reject. |
| `allowRelays` | `true` | Let privacy relays through. |
| `checkMx` | `false` | Reject domains that can't receive mail. Fails open. |
| `mxTimeoutMs` | `1500` | DNS timeout for `checkMx`. |
| `paths` | sign-up, change-email, magic-link, email-otp send | Endpoints the check runs on. |
| `message` | "Please use a permanent email address…" | Error for disposable domains. |
| `deadMessage` | "This email domain cannot receive mail…" | Error for dead domains. |

Helpers, usable without the plugin: `checkEmail(email, options)` → `'ok' | 'disposable' | 'dead'`, `canonicalEmail(email)`, `emailDomain(email)`, `domainAcceptsMail(domain)`.

## What it doesn't do

- It doesn't catch typos (`jane@gmial.com`), the same person's 7th Gmail alias across accounts (store `canonicalEmail()` with a unique index for that), bots or signup bursts. Those need the form and a shared history, which is what the hosted [Vetto](https://usevetto.com) script does. This plugin works on its own and doesn't depend on it.
- A list is never complete. Add domains you see with `block`, and update the package to get the latest list.

## Update the list

```sh
npm run update-domains
```

## License

MIT. The bundled domain list is CC0 1.0, from [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains).
