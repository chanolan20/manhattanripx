/**
 * LemonSqueezy License Validation
 *
 * Docs: https://docs.lemonsqueezy.com/help/licensing/license-api
 *
 * Set env var: LEMONSQUEEZY_API_KEY=your_api_key_here
 * (In Electron, set this in main.js before spawning the server process)
 *
 * Product variant IDs — set these after creating products on LemonSqueezy:
 *   LEMONSQUEEZY_VARIANT_PRO_ANNUAL=123456
 *   LEMONSQUEEZY_VARIANT_PRO_LIFETIME=123457
 *   LEMONSQUEEZY_VARIANT_STUDIO=123458
 */

const LS_API = "https://api.lemonsqueezy.com/v1";
const LS_LICENSE_API = "https://api.lemonsqueezy.com/v1/licenses";

// Plan names keyed by LemonSqueezy variant ID
// Fill these in after creating your products
const VARIANT_PLAN_MAP: Record<string, { plan: string; seats: number; annual: boolean }> = {
  [process.env.LEMONSQUEEZY_VARIANT_PRO_ANNUAL   || "UNSET_1"]: { plan: "pro",    seats: 1, annual: true  },
  [process.env.LEMONSQUEEZY_VARIANT_PRO_LIFETIME  || "UNSET_2"]: { plan: "pro",    seats: 1, annual: false },
  [process.env.LEMONSQUEEZY_VARIANT_STUDIO        || "UNSET_3"]: { plan: "studio", seats: 3, annual: true  },
};

export interface LicenseValidationResult {
  valid: boolean;
  plan: "pro" | "studio" | "trial";
  seats: number;
  annual: boolean;
  expiresAt: string | null;
  activationId: string | null;
  error?: string;
}

/**
 * Activate a license key against LemonSqueezy.
 * Call this when user enters their key in the License screen.
 * instanceName = machine identifier (hostname or UUID).
 */
export async function activateLicense(
  licenseKey: string,
  instanceName: string
): Promise<LicenseValidationResult> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;

  // ── OFFLINE FALLBACK: no API key set (dev / trial mode) ─────────────────
  if (!apiKey || apiKey === "your_api_key_here") {
    console.warn("[license] LEMONSQUEEZY_API_KEY not set — running in offline validation mode");
    return offlineValidate(licenseKey);
  }

  try {
    const body = new URLSearchParams({
      license_key: licenseKey,
      instance_name: instanceName,
    });

    const resp = await fetch(`${LS_LICENSE_API}/activate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await resp.json() as any;

    if (!resp.ok || !data.activated) {
      return {
        valid: false,
        plan: "trial",
        seats: 0,
        annual: false,
        expiresAt: null,
        activationId: null,
        error: data.error || data.message || "Activation failed",
      };
    }

    const variantId = String(data.meta?.variant_id || "");
    const variantInfo = VARIANT_PLAN_MAP[variantId] || { plan: "pro", seats: 1, annual: true };

    // Expiry: annual plans expire 1 yr from now; lifetime never expire
    let expiresAt: string | null = null;
    if (variantInfo.annual) {
      const exp = new Date();
      exp.setFullYear(exp.getFullYear() + 1);
      expiresAt = exp.toISOString();
    }

    return {
      valid: true,
      plan: variantInfo.plan as "pro" | "studio",
      seats: variantInfo.seats,
      annual: variantInfo.annual,
      expiresAt,
      activationId: data.instance?.id || null,
    };
  } catch (err: any) {
    console.error("[license] LemonSqueezy API error:", err);
    return {
      valid: false,
      plan: "trial",
      seats: 0,
      annual: false,
      expiresAt: null,
      activationId: null,
      error: "Could not reach license server. Check your internet connection.",
    };
  }
}

/**
 * Deactivate a license instance (called on uninstall / seat transfer).
 */
export async function deactivateLicense(
  licenseKey: string,
  instanceId: string
): Promise<boolean> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") return true; // offline mode

  try {
    const body = new URLSearchParams({
      license_key: licenseKey,
      instance_id: instanceId,
    });
    const resp = await fetch(`${LS_LICENSE_API}/deactivate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await resp.json() as any;
    return data.deactivated === true;
  } catch {
    return false;
  }
}

/**
 * Validate an already-activated license (call on app launch to check expiry).
 */
export async function validateLicense(
  licenseKey: string,
  instanceId: string
): Promise<LicenseValidationResult> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") return offlineValidate(licenseKey);

  try {
    const body = new URLSearchParams({
      license_key: licenseKey,
      instance_id: instanceId,
    });
    const resp = await fetch(`${LS_LICENSE_API}/validate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await resp.json() as any;

    if (!resp.ok || !data.valid) {
      return {
        valid: false,
        plan: "trial",
        seats: 0,
        annual: false,
        expiresAt: null,
        activationId: null,
        error: data.error || "License no longer valid",
      };
    }

    const variantId = String(data.meta?.variant_id || "");
    const variantInfo = VARIANT_PLAN_MAP[variantId] || { plan: "pro", seats: 1, annual: true };

    return {
      valid: true,
      plan: variantInfo.plan as "pro" | "studio",
      seats: variantInfo.seats,
      annual: variantInfo.annual,
      expiresAt: data.license_key?.expires_at || null,
      activationId: instanceId,
    };
  } catch (err: any) {
    // Network error — be lenient, allow offline use for 7 days
    console.warn("[license] Validation network error — allowing offline grace period");
    return offlineValidate(licenseKey);
  }
}

/**
 * Offline validation fallback.
 * Used in dev, or when no API key is configured.
 * Accepts any key starting with MRXP (Pro), MRXS (Studio), or DEMO.
 */
function offlineValidate(licenseKey: string): LicenseValidationResult {
  const clean = licenseKey.replace(/-/g, "").toUpperCase();
  const prefix = clean.slice(0, 4);

  if (prefix === "MRXS" && clean.length >= 12) {
    return { valid: true, plan: "studio", seats: 3, annual: true, expiresAt: null, activationId: "offline" };
  }
  if ((prefix === "MRXP" || prefix === "DEMO") && clean.length >= 4) {
    return { valid: true, plan: "pro", seats: 1, annual: true, expiresAt: null, activationId: "offline" };
  }
  return { valid: false, plan: "trial", seats: 0, annual: false, expiresAt: null, activationId: null, error: "Invalid key" };
}
