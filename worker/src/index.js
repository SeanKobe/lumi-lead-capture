function base64url(input) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned =
    base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(claim));

  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = unsigned + "." + base64url(signature);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error("Google token error: " + res.status);
  return (await res.json()).access_token;
}

async function appendToSheet(env, lead) {
  const token = await getAccessToken(env);
  const url =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    env.SHEET_ID +
    "/values/Leads!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [
        [lead.timestamp, lead.name, lead.email, lead.phone, lead.answer, lead.source],
      ],
    }),
  });
  if (!res.ok) throw new Error("Sheets error: " + res.status);
}

async function notifyDiscord(env, lead) {
  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content:
        "🔔 New lead: " + lead.name + "\n" +
        "Email: " + lead.email + "\n" +
        "Phone: " + lead.phone + "\n" +
        "Answer: " + lead.answer + "\n" +
        "Source: " + lead.source,
    }),
  });
  if (!res.ok) throw new Error("Discord error: " + res.status);
}

function clean(value, fallback) {
  const text = String(value ?? "").trim().slice(0, 300);
  return text || fallback;
}

const worker = {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Send a POST request", { status: 405 });
    }

    const form = await request.formData();
    const lead = {
      timestamp: new Date().toISOString(),
      name: clean(form.get("name"), "(no name)"),
      email: clean(form.get("email"), "(no email)"),
      phone: clean(form.get("phone"), "(no phone)"),
      answer: clean(form.get("answer"), "(no answer)"),
      source: clean(form.get("source"), "landing-page"),
    };

    console.log("Lead received:", lead.name, lead.email);

    const fingerprint = (
      "lead:" +
      lead.email.toLowerCase() +
      "|" +
      lead.phone.replace(/\D/g, "")
    );
    const seen = await env.LEADS_SEEN.get(fingerprint);
    if (seen) {
      console.log("Duplicate skipped:", fingerprint);
      return new Response("Got it, " + lead.name + "!");
    }

    let sheetOk = false;
    let discordOk = false;

    try {
      await appendToSheet(env, lead);
      sheetOk = true;
      console.log("Sheet: OK");
    } catch (err) {
      console.error("Sheet FAILED:", err.message);
    }

    try {
      await notifyDiscord(env, lead);
      discordOk = true;
      console.log("Discord: OK");
    } catch (err) {
      console.error("Discord FAILED:", err.message);
    }

    if (sheetOk || discordOk) {
      await env.LEADS_SEEN.put(fingerprint, "seen", { expirationTtl: 86400 });
    }

    if (!sheetOk && !discordOk) {
      console.error("LEAD NOT SAVED ANYWHERE:", JSON.stringify(lead));
      return new Response("Something went wrong", { status: 500 });
    }

    return new Response("Got it, " + lead.name + "!");
  },
};

// CORS: lets the website (a different origin) read the Worker's response.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const res = await worker.fetch(request, env, ctx);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  },
};
