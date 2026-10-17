import type { BetterAuthPlugin } from 'better-auth';

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

export declare function vetto(options?: VettoOptions): BetterAuthPlugin;
export default vetto;

export declare function checkEmail(email: string, options?: VettoOptions): Promise<'ok' | 'disposable' | 'dead'>;
export declare function canonicalEmail(email: string): string;
export declare function emailDomain(email: string): string;
export declare function domainAcceptsMail(domain: string, timeoutMs?: number): Promise<boolean>;
