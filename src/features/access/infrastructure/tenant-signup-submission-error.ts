export default class TenantSignupSubmissionError extends Error {
  constructor(
    public readonly reason: 'duplicate' | 'rate_limited' | 'unavailable' | 'unexpected',
    options?: ErrorOptions,
  ) {
    super('Tenant signup request failed.', options);
    this.name = 'TenantSignupSubmissionError';
  }
}
