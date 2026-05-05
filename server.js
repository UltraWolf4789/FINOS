const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = 8080;

const server = http.createServer((req, res) => {
  // Add CORS headers so browsers can use this as a CORS proxy too
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Expect requests like: http://localhost:8080/https://example.com/path
  const rawTarget = req.url.slice(1); // strip leading "/"

  if (!rawTarget) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h2>Web Proxy Running</h2>
      <p>Usage: <code>http://localhost:${PORT}/https://example.com</code></p>
      <form onsubmit="location.href='/${encodeURIComponent(document.getElementById('u').value)}';return false">
        <input id="u" style="width:400px" placeholder="https://example.com" />
        <button type="submit">Go</button>
      </form>
    `);
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(decodeURIComponent(rawTarget));
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad target URL. Usage: http://localhost:" + PORT + "/https://example.com");
    return;
  }

  const isHttps = targetUrl.protocol === "https:";
  const lib = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.hostname, // override host header
    },
  };

  // Remove proxy-specific headers
  delete options.headers["proxy-connection"];

  console.log(`[${req.method}] ${targetUrl.href}`);

  const proxyReq = lib.request(options, (proxyRes) => {
    // Copy headers and strip anything that blocks iframe embedding
    const proxyHeaders = { ...proxyRes.headers };
    delete proxyHeaders["x-frame-options"];
    delete proxyHeaders["content-security-policy"];
    delete proxyHeaders["content-security-policy-report-only"];
    proxyHeaders["access-control-allow-origin"] = "*";

    res.writeHead(proxyRes.statusCode, proxyHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy error: " + err.message);
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`Proxy running at http://localhost:${PORT}`);
  console.log(`Usage: http://localhost:${PORT}/https://example.com`);
});