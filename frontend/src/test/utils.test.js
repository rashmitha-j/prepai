import { describe, expect, it } from 'vitest';
import { getErrorMessage, getFieldErrors, isAiUnavailable } from '../utils/errors';
import { formatScore, initials, scoreTone } from '../utils/format';

describe('format utils', () => {
  it('maps scores to tones', () => {
    expect(scoreTone(8)).toBe('good');
    expect(scoreTone(6)).toBe('mid');
    expect(scoreTone(3)).toBe('bad');
    expect(scoreTone(null)).toBe('neutral');
  });
  it('formats scores and initials', () => {
    expect(formatScore(7)).toBe('7.0');
    expect(formatScore(undefined)).toBe('—');
    expect(initials('Asha Rao Kumar')).toBe('AR');
  });
});

describe('error utils', () => {
  const apiError = (status, error) => ({ response: { status, data: { error } } });
  it('prefers the API message and first validation detail', () => {
    expect(getErrorMessage(apiError(409, { message: 'Email taken' }))).toBe('Email taken');
    expect(getErrorMessage(apiError(422, { message: 'Invalid', details: [{ field: 'body.email', message: 'Bad email' }] }))).toBe('Bad email');
    expect(getFieldErrors(apiError(422, { details: [{ field: 'body.email', message: 'Bad email' }] }))).toEqual({ email: 'Bad email' });
  });
  it('explains network problems', () => {
    expect(getErrorMessage({ request: {} })).toMatch(/Cannot reach/);
    expect(getErrorMessage({ code: 'ECONNABORTED' })).toMatch(/timed out/);
  });
  it('detects AI outages', () => {
    expect(isAiUnavailable(apiError(503, { code: 'AI_PROVIDER_UNAVAILABLE' }))).toBe(true);
    expect(isAiUnavailable(apiError(500, { code: 'INTERNAL_ERROR' }))).toBe(false);
  });
});
