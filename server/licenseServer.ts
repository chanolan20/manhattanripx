/**
 * Manhattan RIP X — License Server
 *
 * This build is FULLY UNLOCKED — all features enabled, no activation required.
 * All validation functions immediately return valid "pro" status.
 */

export interface LicenseValidationResult {
  valid: boolean;
  plan: "pro" | "studio" | "enterprise" | "trial";
  seats: number;
  annual: boolean;
  expiresAt: string | null;
  activationId: string | null;
  error?: string;
}

const UNLOCKED: LicenseValidationResult = {
  valid: true,
  plan: "pro",
  seats: 999,
  annual: false,
  expiresAt: null,
  activationId: "mrx-unlocked",
};

export async function activateLicense(
  _licenseKey: string,
  _instanceName: string
): Promise<LicenseValidationResult> {
  return UNLOCKED;
}

export async function deactivateLicense(
  _licenseKey: string,
  _instanceId: string
): Promise<boolean> {
  return true;
}

export async function validateLicense(
  _licenseKey: string,
  _instanceId: string
): Promise<LicenseValidationResult> {
  return UNLOCKED;
}
