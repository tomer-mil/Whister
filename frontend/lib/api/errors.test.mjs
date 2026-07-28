// Run with:  node --experimental-strip-types --test frontend/lib/api/errors.test.mjs
//
// Payloads below are verbatim captures from the running backend, not invented
// shapes -- FastAPI's 422 `detail` is an array of objects, while the app's own
// handled errors return a plain string `message`.
import { test } from 'node:test';
import assert from 'node:assert';
import { extractErrorMessage } from './errors.ts';

const VALIDATION_422 = JSON.stringify({
  detail: [
    {
      type: 'value_error',
      loc: ['body', 'password'],
      msg: 'Value error, Password must contain at least one uppercase letter',
      input: 'password',
    },
  ],
});

const TWO_ERRORS_422 = JSON.stringify({
  detail: [
    { type: 'missing', loc: ['body', 'password'], msg: 'Field required' },
    { type: 'value_error', loc: ['body', 'email'], msg: 'value is not a valid email address' },
  ],
});

const DUPLICATE_409 = JSON.stringify({
  error: 'AUTH_1008',
  message: 'Email already registered',
  request_id: '24d480ee',
});

const BAD_CREDS_401 = JSON.stringify({
  error: 'AUTH_1001',
  message: 'Invalid email or password',
  request_id: '3dbab694',
});

test('never returns the string [object Object]', () => {
  for (const [name, body] of [
    ['single validation error', VALIDATION_422],
    ['two validation errors', TWO_ERRORS_422],
  ]) {
    const msg = extractErrorMessage(body, 422);
    // Coerce exactly the way `new Error(msg).message` would: an array here
    // would otherwise pass this check via Array.prototype.includes, which
    // compares elements rather than substrings.
    assert.ok(
      !String(msg).includes('[object Object]'),
      `${name}: got unreadable message ${JSON.stringify(String(msg))}`,
    );
  }
});

test('surfaces the actual validation reason to the player', () => {
  const msg = extractErrorMessage(VALIDATION_422, 422);
  assert.match(msg, /uppercase letter/);
});

test('joins multiple validation errors readably', () => {
  const msg = extractErrorMessage(TWO_ERRORS_422, 422);
  assert.match(msg, /Field required/);
  assert.match(msg, /valid email address/);
});

test('still passes through plain string messages', () => {
  assert.equal(extractErrorMessage(DUPLICATE_409, 409), 'Email already registered');
  assert.equal(extractErrorMessage(BAD_CREDS_401, 401), 'Invalid email or password');
});

test('handles a string detail and non-JSON bodies', () => {
  assert.equal(extractErrorMessage(JSON.stringify({ detail: 'Not found' }), 404), 'Not found');
  assert.equal(extractErrorMessage('<html>502</html>', 502), 'Request failed: 502');
  assert.equal(extractErrorMessage('', 500), 'Request failed: 500');
});

test('always returns a string', () => {
  for (const body of [VALIDATION_422, TWO_ERRORS_422, DUPLICATE_409, '', 'null']) {
    assert.equal(typeof extractErrorMessage(body, 400), 'string');
  }
});
