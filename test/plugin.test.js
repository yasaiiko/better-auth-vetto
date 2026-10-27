import assert from 'node:assert/strict';
import { test } from 'node:test';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { canonicalEmail, checkEmail, vetto } from '../dist/index.js';

function makeAuth(options) {
  return betterAuth({
    secret: 'test-secret-test-secret-test-secret-123',
    baseURL: 'http://localhost:3000',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    plugins: [vetto(options)],
  });
}

const signUp = (auth, email) =>
  auth.api.signUpEmail({ body: { email, password: 'correct-horse-battery', name: 'Test' } });

test('blocks a disposable domain on sign-up', async () => {
  const auth = makeAuth();
  await assert.rejects(signUp(auth, 'x@mailinator.com'), (err) => {
    assert.match(err.message, /permanent email/);
    return true;
  });
});

test('blocks subdomains of a disposable domain', async () => {
  assert.equal(await checkEmail('x@abc.mailinator.com'), 'disposable');
});

test('lets normal and relay addresses sign up', async () => {
  const auth = makeAuth();
  for (const email of ['jane@gmail.com', 'me@privaterelay.appleid.com', 'a1b2@duck.com', 'x@mozmail.com']) {
    const res = await signUp(auth, email);
    assert.equal(res.user.email, email);
  }
});

test('allowRelays: false falls back to the blocklist only', async () => {
  // Relays are not in the CC0 list, so they still pass; block them explicitly if you want to.
  assert.equal(await checkEmail('x@duck.com', { allowRelays: false, block: ['duck.com'] }), 'disposable');
  assert.equal(await checkEmail('x@duck.com', { block: ['duck.com'] }), 'disposable');
});

test('allow overrides the blocklist, block adds to it', async () => {
  assert.equal(await checkEmail('x@mailinator.com', { allow: ['mailinator.com'] }), 'ok');
  assert.equal(await checkEmail('x@example-spam.test', { block: ['example-spam.test'] }), 'disposable');
});

test('custom message', async () => {
  const auth = makeAuth({ message: 'Nope.' });
  await assert.rejects(signUp(auth, 'x@mailinator.com'), /Nope\./);
});

test('checkMx flags a domain that does not exist', async () => {
  assert.equal(await checkEmail('x@this-domain-does-not-exist-vetto-test.com', { checkMx: true }), 'dead');
  assert.equal(await checkEmail('x@gmail.com', { checkMx: true }), 'ok');
});

test('canonicalEmail folds Gmail aliases only', () => {
  assert.equal(canonicalEmail('J.a.n.e+trial7@GoogleMail.com'), 'jane@gmail.com');
  assert.equal(canonicalEmail('jane.doe+x@outlook.com'), 'jane.doe@outlook.com');
});
