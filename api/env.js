function geminiKey() {
  return String(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      ""
  ).trim();
}

module.exports = async function handler(req, res) {
  const js = "window.__ENV = " + JSON.stringify({ GEMINI_CONFIGURED: Boolean(geminiKey()) }) + ";\n";
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(js);
};
