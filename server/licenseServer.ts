/**
 * Manhattan RIP X — License Server
 * PERSONAL FULLY UNLOCKED BUILD — v2.1.0-PERSONAL
 * No trial gate. No activation required. All features enabled.
 */

export type LicensePlan = "trial" | "pro" | "studio" | "enterprise";

export interface LicenseInfo {
  status: "trial" | "active" | "expired" | "invalid";
  plan: LicensePlan;
  licenseKey: string | null;
  email: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  seats: number;
  trialJobsUsed: number;
  trialJobsLimit: number;
}

const PERSONAL_LICENSE: LicenseInfo = {
  status: "active",
  plan: "enterprise",
  licenseKey: "MRXE-PERSONAL-UNLOCKED-2026",
  email: "gomezfrankg@gmail.com",
  activatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,           // never expires
  seats: 10,
  trialJobsUsed: 0,
  trialJobsLimit: 999999,
};

export function validateLicenseKey(_key: string): { valid: boolean; plan: LicensePlan; error?: string } {
  return { valid: true, plan: "enterprise" };
}

export function buildTrialLicense(_trialJobsUsed = 0): LicenseInfo {
  return { ...PERSONAL_LICENSE };
}

export function buildActiveLicense(_key: string, _plan: LicensePlan, _email: string | null = null, _expiresAt: string | null = null): LicenseInfo {
  return { ...PERSONAL_LICENSE };
}

export function validateLicense(_stored: Partial<LicenseInfo> | null): LicenseInfo {
  return { ...PERSONAL_LICENSE };
}

export function activateLicense(_key: string, _email: string | null, _expiresAt: string | null = null): { success: boolean; license: LicenseInfo; error?: string } {
  return { success: true, license: { ...PERSONAL_LICENSE } };
}

export function deactivateLicense(): { success: boolean; license: LicenseInfo } {
  return { success: true, license: { ...PERSONAL_LICENSE } };
}

export function generateLicenseKey(_plan: LicensePlan): string {
  return "MRXE-PERSONAL-UNLOCKED-2026";
}
