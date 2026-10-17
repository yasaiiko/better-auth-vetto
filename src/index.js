import { APIError, createAuthMiddleware } from 'better-auth/api';
import { DISPOSABLE } from './domains.js';
import { RELAYS } from './relays.js';

const DEFAULT_PATHS = ['/sign-up/email', '/change-email', '/sign-in/magic-link', '/email-otp/send-verification-otp'];
const DEFAULT_MESSAGE = 'Please use a permanent email address. Disposable or temporary inboxes are not accepted.';
const DEAD_MESSAGE = 'This email domain cannot receive mail. Please check the address.';

/** Lowercased domain of an address, or '' if it has none. */
export function emailDomain(email) {
  const at = String(email).lastIndexOf('@');
  return at < 0 ? '' : String(email).slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
}

/** The domain itself, then each parent: a.b.example.com, b.example.com, example.com. */
function* withParents(domain) {
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) yield parts.slice(i).join('.');
}

const inSet = (set, domain) => {
  for (const d of withParents(domain)) if (set.has(d)) return true;
  return false;
};

/**
 * Key that is the same for every alias of one Gmail inbox: lowercased, `+tag`
 * removed, and for gmail.com/googlemail.com dots removed and the domain folded
 * to gmail.com. Other providers keep their dots (Outlook and most others treat
 * them as significant). Use it as a uniqueness key; keep the original address
 * for sending mail.
 */
export function canonicalEmail(email) {
  const at = String(email).lastIndexOf('@');
  if (at < 0) return String(email).trim().toLowerCase();
  let local = String(email).slice(0, at).trim().toLowerCase();
  let domain = emailDomain(email);
  local = local.split('+')[0];
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/**
 * Whether the domain can receive mail: it has an MX record that is not the
 * RFC 7505 null MX, or (per RFC 5321) no MX but an A/AAAA record. Network
 * errors and timeouts count as "yes" so a DNS hiccup never blocks a signup.
 */
export async function domainAcceptsMail(domain, timeoutMs = 1500) {
  let dns;
  try {
    dns = await import('node:dns/promises');
  } catch {
    return true; // No DNS in this runtime: skip the check.
  }
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  const lookup = (async () => {
    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length === 0) return 'none';
      return mx.every((r) => r.exchange === '' || r.exchange === '.') ? 'dead' : 'ok';
    } catch (err) {
      if (err.code === 'ENOTFOUND') return 'dead';
      if (err.code !== 'ENODATA') return 'error';
      return 'none';
    }
  })();
  const mx = await Promise.race([lookup, timeout]);
  if (mx === 'ok' || mx === 'error' || mx === 'timeout') return true;
  if (mx === 'dead') return false;
  // No MX record: fall back to A/AAAA (implicit MX).
  const address = await Promise.race([
    Promise.any([dns.resolve4(domain), dns.resolve6(domain)]).then(
      () => true,
      (agg) => !agg.errors.every((e) => e.code === 'ENODATA' || e.code === 'ENOTFOUND'),
    ),
    timeout.then(() => true),
  ]);
  return address;
}

/**
 * Decide on one address without Better Auth: 'ok', 'disposable' or 'dead'.
 * Accepts the same options as the plugin.
 */
export async function checkEmail(email, options = {}) {
  const { allow = [], block = [], allowRelays = true, checkMx = false, mxTimeoutMs = 1500 } = options;
  const domain = emailDomain(email);
  if (!domain) return 'ok'; // Leave format errors to Better Auth's own validation.
  const allowSet = new Set(allow.map((d) => d.toLowerCase()));
  const blockSet = new Set(block.map((d) => d.toLowerCase()));
  if (inSet(allowSet, domain)) return 'ok';
  if (inSet(blockSet, domain)) return 'disposable';
  if (allowRelays && inSet(RELAYS, domain)) return 'ok';
  if (inSet(DISPOSABLE, domain)) return 'disposable';
  if (checkMx && !(await domainAcceptsMail(domain, mxTimeoutMs))) return 'dead';
  return 'ok';
}

/**
 * Better Auth plugin that rejects disposable and (optionally) dead email
 * domains before an account is created, while letting privacy relays through.
 */
export const vetto = (options = {}) => {
  const paths = new Set(options.paths ?? DEFAULT_PATHS);
  return {
    id: 'vetto',
    hooks: {
      before: [
        {
          matcher: (context) => paths.has(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const email = ctx.path === '/change-email' ? ctx.body?.newEmail : (ctx.body?.email ?? ctx.query?.email);
            if (typeof email !== 'string') return;
            const verdict = await checkEmail(email, options);
            if (verdict === 'disposable') {
              throw new APIError('BAD_REQUEST', { message: options.message ?? DEFAULT_MESSAGE });
            }
            if (verdict === 'dead') {
              throw new APIError('BAD_REQUEST', { message: options.deadMessage ?? DEAD_MESSAGE });
            }
          }),
        },
      ],
    },
  };
};

export default vetto;
