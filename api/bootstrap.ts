import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync } from "node:crypto";

const URL = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

function json(res: any, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required." } });
  }

  try {
    if (!URL || !KEY) {
      return json(res, 503, {
        success: false,
        error: {
          code: "CONFIG_MISSING",
          message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel.",
        },
      });
    }

    const sb = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (!process.env.BOOTSTRAP_SECRET || body.secret !== process.env.BOOTSTRAP_SECRET) {
      return json(res, 403, {
        success: false,
        error: { code: "FORBIDDEN", message: "Invalid bootstrap secret." },
      });
    }

    const adminPassword = String(body.omar_password || process.env.INITIAL_ADMIN_PASSWORD || "");
    if (adminPassword.length < 8) {
      return json(res, 400, {
        success: false,
        error: {
          code: "PASSWORD_REQUIRED",
          message: "INITIAL_ADMIN_PASSWORD must be at least 8 characters.",
        },
      });
    }

    const names = ["Anas", "Samma", "Youssef", "Ahmad", "Omar", "Bisher", "Abdullah", "Mikyle"];
    let created = 0;
    let skipped = 0;

    for (const name of names) {
      const normalized = name.toLowerCase();
      const { data: existing, error: lookupError } = await sb
        .from("village_users")
        .select("id")
        .eq("normalized_username", normalized)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existing) {
        skipped++;
        continue;
      }

      const usablePassword =
        name === "Omar"
          ? adminPassword
          : String(body.passwords?.[name] || randomBytes(32).toString("hex"));

      const { data: user, error: userError } = await sb
        .from("village_users")
        .insert({
          username: name,
          normalized_username: normalized,
          display_name: name,
          role: name === "Omar" ? "admin" : "user",
          status: "active",
          banking_status: "active",
          password_hash: hashPassword(usablePassword),
          must_change_password: name !== "Omar",
        })
        .select("id")
        .single();

      if (userError) throw userError;

      const { error: accountError } = await sb.from("village_accounts").insert({
        user_id: user.id,
        balance_cents: 0,
      });
      if (accountError) throw accountError;

      created++;
    }

    const { error: settingsError } = await sb
      .from("village_economy_settings")
      .upsert({ key: "diamond_rate", value: "1000" }, { onConflict: "key" });
    if (settingsError) throw settingsError;

    const { data: reserve, error: reserveLookupError } = await sb
      .from("village_diamond_reserves")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (reserveLookupError) throw reserveLookupError;

    if (!reserve) {
      const { error: reserveCreateError } = await sb
        .from("village_diamond_reserves")
        .insert({ diamond_count: 0 });
      if (reserveCreateError) throw reserveCreateError;
    }

    // Storage setup should never prevent the bank itself from bootstrapping.
    try {
      const { data: buckets } = await sb.storage.listBuckets();
      if (!(buckets || []).some((bucket: any) => bucket.name === "public-media")) {
        await sb.storage.createBucket("public-media", {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
        });
      }
    } catch (storageError) {
      console.warn("Storage bucket setup skipped:", storageError);
    }

    return json(res, 200, {
      success: true,
      data: {
        message: "Village Central initialized. Omar can now sign in.",
        created,
        skipped,
      },
    });
  } catch (error: any) {
    console.error("Bootstrap failed:", error);
    return json(res, 500, {
      success: false,
      error: {
        code: "BOOTSTRAP_FAILED",
        message: error?.message || "Bootstrap failed.",
      },
    });
  }
}
