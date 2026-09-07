const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

function geminiKey() {
  return String(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      ""
  ).trim();
}

function extractText(data) {
  const cand = (data.candidates || [])[0];
  return ((cand && cand.content && cand.content.parts) || [])
    .map((p) => p.text || "")
    .join("");
}

async function generate(parts, key) {
  let lastErr = "Gemini request failed";
  const payload = {
    systemInstruction: {
      parts: [
        {
          text: "You are an exam-prep tutor. Produce original assessment items and valid JSON only.",
        },
      ],
    },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  for (const model of MODELS) {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(key);
    let res;
    let data;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    } catch (err) {
      lastErr = err.message || String(err);
      continue;
    }
    if (data.error) {
      lastErr = data.error.message || "Gemini request failed";
      const low = lastErr.toLowerCase();
      if (
        low.includes("api key") ||
        low.includes("permission denied") ||
        res.status === 403 ||
        res.status === 401
      ) {
        return { error: lastErr, status: res.status };
      }
      continue;
    }
    const text = extractText(data);
    if (!text) {
      const cand = (data.candidates || [])[0];
      const block =
        (data.promptFeedback && data.promptFeedback.blockReason) ||
        (cand && cand.finishReason);
      lastErr = block
        ? "Gemini blocked or stopped the response (" + block + "). Try different material or a shorter topic."
        : "Empty response from Gemini.";
      continue;
    }
    return { text };
  }
  return { error: lastErr, status: 502 };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    res.status(200).json({ configured: Boolean(geminiKey()) });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const key = geminiKey();
  if (!key) {
    res.status(500).json({
      error:
        "GEMINI_API_KEY is not set on the server. Add it in Vercel Project Settings → Environment Variables (Production), then redeploy.",
    });
    return;
  }
  const parts = req.body && req.body.parts;
  if (!Array.isArray(parts) || !parts.length) {
    res.status(400).json({ error: "Missing request parts." });
    return;
  }
  const result = await generate(parts, key);
  if (result.text) {
    res.status(200).json({ text: result.text });
    return;
  }
  res.status(result.status || 502).json({ error: result.error || "Gemini request failed" });
};

module.exports.config = { maxDuration: 60 };
