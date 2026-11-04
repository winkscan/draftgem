// Local development only. The deployed worker's CORS answer doesn't allow the browser's JSON-RPC calls
// (web3.js sends a `solana-client` header and /rpc has no Access-Control-Allow-Origin), so the web build,
// run locally, talks to this proxy, which forwards everything to the real worker and adds permissive CORS.
//   node scripts/web-dev-proxy.js   (listens on :8787)
//   EXPO_PUBLIC_WORKER_URL=http://localhost:8787 npx expo start --web
// Before the web app goes live on its own domain, the worker itself must send these headers (see the
// "web CORS" note in the repo history); this proxy is then not needed.
const http = require("http");

const TARGET = process.env.TARGET || "https://draftgem-mainnet.swapkings.workers.dev";
const PORT = Number(process.env.PORT || 8787);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = {};
      if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
      const upstream = await fetch(TARGET + req.url, { method: req.method, headers, body: req.method === "GET" ? undefined : body });
      const out = { ...CORS };
      const ct = upstream.headers.get("content-type");
      if (ct) out["content-type"] = ct;
      res.writeHead(upstream.status, out);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, CORS);
      res.end(String(e));
    }
  })
  .listen(PORT, () => console.log(`web-dev-proxy: http://localhost:${PORT} -> ${TARGET}`));
