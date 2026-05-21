import crypto from "crypto";
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
const TRIAL_LIMIT = 25;
const PREFIX_PLAN: Record<string, LicensePlan> = { "MRXP": "pro", "MRXS": "studio", "MRXE": "enterprise" };
const PLAN_SEATS: Record<LicensePlan, number> = { trial:1, pro:1, studio:3, enterprise:10 };
export function validateLicenseKey(key: string): { valid: boolean; plan: LicensePlan; error?: string } {
  if (!key || typeof key !== "string") return { valid: false, plan: "trial", error: "No license key provided." };
  const trimmed = key.trim().toUpperCase();
  if (trimmed.length < 16) return { valid: false, plan: "trial", error: "License key is too short." };
  const prefix = trimmed.split("-")[0];
  const plan = PREFIX_PLAN[prefix];
  if (!plan) return { valid: false, plan: "trial", error: "Invalid license key prefix. Expected MRXP-, MRXS-, or MRXE-." };
  if (trimmed.split("-").length < 4) return { valid: false, plan: "trial", error: "License key format invalid." };
  return { valid: true, plan };
}
export function buildTrialLicense(trialJobsUsed = 0): LicenseInfo {
  return { status:"trial", plan:"trial", licenseKey:null, email:null, activatedAt:null, expiresAt:null, seats:1, trialJobsUsed, trialJobsLimit:TRIAL_LIMIT };
}
export function buildActiveLicense(key: string, plan: LicensePlan, email: string|null=null, expiresAt: string|null=null): LicenseInfo {
  return { status:"active", plan, licenseKey:key, email, activatedAt:new Date().toISOString(), expiresAt, seats:PLAN_SEATS[plan], trialJobsUsed:0, trialJobsLimit:TRIAL_LIMIT };
}
export function validateLicense(stored: Partial<LicenseInfo>|null): LicenseInfo {
  if (!stored || stored.status === "trial" || !stored.licenseKey) return buildTrialLicense(stored?.trialJobsUsed ?? 0);
  if (stored.status === "active") {
    if (stored.expiresAt && new Date(stored.expiresAt) < new Date()) return { ...buildTrialLicense(stored.trialJobsUsed??0), status:"expired", plan:stored.plan??"trial", licenseKey:stored.licenseKey, email:stored.email??null } as LicenseInfo;
    return stored as LicenseInfo;
  }
  return buildTrialLicense(stored?.trialJobsUsed ?? 0);
}
export function activateLicense(key: string, email: string|null, expiresAt: string|null=null): { success:boolean; license:LicenseInfo; error?:string } {
  const v = validateLicenseKey(key);
  if (!v.valid) return { success:false, license:buildTrialLicense(), error:v.error };
  return { success:true, license:buildActiveLicense(key, v.plan, email, expiresAt) };
}
export function deactivateLicense(): { success:boolean; license:LicenseInfo } {
  return { success:true, license:buildTrialLicense() };
}
export function generateLicenseKey(plan: LicensePlan): string {
  const m: Record<LicensePlan,string> = { trial:"MRXT", pro:"MRXP", studio:"MRXS", enterprise:"MRXE" };
  const seg = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${m[plan]??'MRXP'}-${seg()}-${seg()}-${seg()}`;
}
