import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { DISPOSABLE } from './domains.js';
import { RELAYS } from './relays.js';

export interface VettoOptions {
  /** Extra domains to always accept (checked first; parent domains match too). */
  allow?: string[];
  /** Extra domains to always reject as disposable. */
  block?: string[];
  /** Let privacy relays (Apple Hide My Email, DuckDuckGo, Firefox Relay, SimpleLogin, Proton Pass, addy.io, 33mail) through. Default true. */
  allowRelays?: boolean;
  /** Reject domains that cannot receive mail (no MX and no A/AAAA, NXDOMAIN or null MX). Node runtimes only; fails open. Default false. */
  checkMx?: boolean;
  /** DNS timeout for checkMx, in ms. Default 1500. */
  mxTimeoutMs?: number;
  /** Endpoints to check. Default: /sign-up/email, /change-email, /sign-in/magic-link, /email-otp/send-verification-otp. */
  paths?: string[];
  /** Error message for disposable domains. */
  message?: string;
  /** Error message for domains that cannot receive mail. */
  deadMessage?: string;
}

export type Verdict = 'ok' | 'disposable' | 'dead';

const DEFAULT_PATHS = ['/sign-up/email', '/change-email', '/sign-in/magic-link', '/email-otp/send-verification-otp'];
const DEFAULT_MESSAGE = 'Please use a permanent email address. Disposable or temporary inboxes are not accepted.';
const DEAD_MESSAGE = 'This email domain cannot receive mail. Please check the address.';

/** Lowercased domain of an address, or '' if it has none. */
export function emailDomain(email: string): string {
  const at = String(email).lastIndexOf('@');
  return at < 0 ? '' : String(email).slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
}

/** The domain itself, then each parent: a.b.example.com, b.example.com, example.com. */
function* withParents(domain: string): Generator<string> {
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) yield parts.slice(i).join('.');
}

const inSet = (set: ReadonlySet<string>, domain: string): boolean => {
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
export function canonicalEmail(email: string): string {
  const at = String(email).lastIndexOf('@');
  if (at < 0) return String(email).trim().toLowerCase();
  let local = String(email).slice(0, at).trim().toLowerCase();
  let domain = emailDomain(email);
  local = local.split('+')[0];
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

const errorCode = (err: unknown): string | undefined => (err as { code?: string } | null)?.code;

/**
 * Whether the domain can receive mail: it has an MX record that is not the
 * RFC 7505 null MX, or (per RFC 5321) no MX but an A/AAAA record. Network
 * errors and timeouts count as "yes" so a DNS hiccup never blocks a signup.
 */
export async function domainAcceptsMail(domain: string, timeoutMs = 1500): Promise<boolean> {
  let dns: typeof import('node:dns/promises');
  try {
    dns = await import('node:dns/promises');
  } catch {
    return true; // No DNS in this runtime: skip the check.
  }
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  const lookup = (async (): Promise<'ok' | 'dead' | 'none' | 'error'> => {
    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length === 0) return 'none';
      return mx.every((r) => r.exchange === '' || r.exchange === '.') ? 'dead' : 'ok';
    } catch (err) {
      if (errorCode(err) === 'ENOTFOUND') return 'dead';
      if (errorCode(err) !== 'ENODATA') return 'error';
      return 'none';
    }
  })();
  const mx = await Promise.race([lookup, timeout]);
  if (mx === 'ok' || mx === 'error' || mx === 'timeout') return true;
  if (mx === 'dead') return false;
  // No MX record: fall back to A/AAAA (implicit MX).
  return Promise.race([
    Promise.any([dns.resolve4(domain), dns.resolve6(domain)]).then(
      () => true,
      (agg: AggregateError) => !agg.errors.every((e) => errorCode(e) === 'ENODATA' || errorCode(e) === 'ENOTFOUND'),
    ),
    timeout.then(() => true),
  ]);
}

/**
 * Decide on one address without Better Auth: 'ok', 'disposable' or 'dead'.
 * Accepts the same options as the plugin.
 */
export async function checkEmail(email: string, options: VettoOptions = {}): Promise<Verdict> {
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
export const vetto = (options: VettoOptions = {}) => {
  const paths = new Set(options.paths ?? DEFAULT_PATHS);
  return {
    id: 'vetto',
    hooks: {
      before: [
        {
          matcher: (context) => paths.has(context.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const email: unknown =
              ctx.path === '/change-email' ? ctx.body?.newEmail : (ctx.body?.email ?? ctx.query?.email);
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
  } satisfies BetterAuthPlugin;
};

export default vetto;
