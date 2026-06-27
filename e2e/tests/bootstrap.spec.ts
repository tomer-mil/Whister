import { expect, test } from '@playwright/test';
import {
  assertWhisterServiceUrls,
  isWhisterBackendIdentity,
  isWhisterFrontendIdentity,
} from '../helpers/services';

test('bootstrap accepts only Whister host ports', () => {
  expect(() =>
    assertWhisterServiceUrls(
      'http://localhost:8001',
      'http://localhost:3001',
    ),
  ).not.toThrow();

  expect(() =>
    assertWhisterServiceUrls(
      'http://localhost:8000',
      'http://localhost:3001',
    ),
  ).toThrow(/localhost:8001/);

  expect(() =>
    assertWhisterServiceUrls(
      'http://localhost:8001',
      'http://localhost:3000',
    ),
  ).toThrow(/localhost:3001/);

  expect(() =>
    assertWhisterServiceUrls(
      'https://example.com:8001',
      'http://localhost:3001',
    ),
  ).toThrow(/localhost:8001/);
});

test('bootstrap recognizes Whister backend identity and rejects another app', () => {
  expect(
    isWhisterBackendIdentity({
      name: 'Whist Score Keeper',
      version: '1.0.0',
      status: 'ready',
    }),
  ).toBe(true);

  expect(
    isWhisterBackendIdentity({
      name: 'Cookoo',
      version: '1.0.0',
      status: 'ready',
    }),
  ).toBe(false);
});

test('bootstrap recognizes Whister frontend manifest and rejects another app', () => {
  expect(
    isWhisterFrontendIdentity({
      name: 'Whister',
      short_name: 'Whist',
    }),
  ).toBe(true);
  expect(isWhisterFrontendIdentity({ name: 'Open WebUI' })).toBe(false);
});
