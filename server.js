/**
 * CICT Code Forum - simple shared database server
 * Zero dependencies (Node.js built-in modules only).
 *
 * Run:  node server.js
 * Open: http://localhost:3000/index1.html
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const STATIC_DIR = fs.existsSync(path.join(__dirname, "public"))
    ? path.join(__dirname, "public")
    : path.join(__dirname, "..");

/**
 * One device per account.
 * sessions[username] = { id, lastSeen }. The signed-in device pings every ~20s.
 * A second device is refused while the first one has pinged in the last SESSION_TIMEOUT_MS.
 * Kept in memory on purpose: after a server restart devices simply re-claim their session.
 */
const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS) || 90 * 1000;
const sessions = Object.create(null);

function newSessionId() {
    return crypto.randomBytes(16).toString("hex");
}

function isFresh(session) {
    return !!session && Date.now() - session.lastSeen < SESSION_TIMEOUT_MS;
}

function validName(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 100;
}

const DEFAULT_DB = {
    accounts: [],
    posts: [],
    cosmetics: [],
    reports: [],
    updatedAt: null
};

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8"
};

function ensureDb() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    }
}

function readDb() {
    ensureDb();
    try {
        const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        return {
            accounts: Array.isArray(data.accounts) ? data.accounts : [],
            posts: Array.isArray(data.posts) ? data.posts : [],
            cosmetics: Array.isArray(data.cosmetics) ? data.cosmetics : [],
            reports: Array.isArray(data.reports) ? data.reports : [],
            updatedAt: data.updatedAt || null
        };
    } catch (e) {
        console.error("DB read error:", e.message);
        return { ...DEFAULT_DB };
    }
}

function writeDb(data) {
    ensureDb();
    const payload = {
        accounts: data.accounts || [],
        posts: data.posts || [],
        cosmetics: data.cosmetics || [],
        reports: data.reports || [],
        updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(payload, null, 2));
    return payload;
}

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw) return resolve(null);
            try {
                resolve(JSON.parse(raw));
            } catch (e) {
                reject(e);
            }
        });
        req.on("error", reject);
    });
}

function safeJoin(base, reqPath) {
    const decoded = decodeURIComponent(reqPath.split("?")[0]);
    const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
    const full = path.join(base, cleaned);
    if (!full.startsWith(base)) return null;
    return full;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        return res.end();
    }

    try {
        if (pathname === "/api/health" && req.method === "GET") {
            return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
        }

        if (pathname === "/api/state" && req.method === "GET") {
            return sendJson(res, 200, readDb());
        }

        if (pathname === "/api/state" && req.method === "PUT") {
            const body = await readBody(req);
            const current = readDb();
            const next = writeDb({
                accounts: body && body.accounts !== undefined ? body.accounts : current.accounts,
                posts: body && body.posts !== undefined ? body.posts : current.posts,
                cosmetics: body && body.cosmetics !== undefined ? body.cosmetics : current.cosmetics,
                reports: body && body.reports !== undefined ? body.reports : current.reports
            });
            return sendJson(res, 200, next);
        }

        // ---------- one-device-per-account sessions ----------
        if (pathname.startsWith("/api/session/") && req.method === "POST") {
            const body = (await readBody(req)) || {};
            const username = body.username;
            const sid = typeof body.sessionId === "string" ? body.sessionId : "";
            if (!validName(username)) return sendJson(res, 400, { error: "username required" });
            const current = sessions[username];

            if (pathname === "/api/session/login") {
                if (isFresh(current) && current.id !== sid) {
                    return sendJson(res, 409, { error: "in_use" });
                }
                if (current && current.id === sid) {
                    current.lastSeen = Date.now();
                    return sendJson(res, 200, { ok: true, sessionId: sid });
                }
                const id = newSessionId();
                sessions[username] = { id, lastSeen: Date.now() };
                return sendJson(res, 200, { ok: true, sessionId: id });
            }

            if (pathname === "/api/session/ping") {
                if (!sid) return sendJson(res, 200, { ok: false });
                if (!current || current.id === sid || !isFresh(current)) {
                    sessions[username] = { id: sid, lastSeen: Date.now() };
                    return sendJson(res, 200, { ok: true });
                }
                return sendJson(res, 200, { ok: false });
            }

            if (pathname === "/api/session/logout") {
                if (current && current.id === sid) delete sessions[username];
                return sendJson(res, 200, { ok: true });
            }
        }

        const collections = ["accounts", "posts", "cosmetics", "reports"];
        for (const name of collections) {
            if (pathname === "/api/" + name && req.method === "GET") {
                const db = readDb();
                return sendJson(res, 200, db[name] || []);
            }
            if (pathname === "/api/" + name && req.method === "PUT") {
                const body = await readBody(req);
                if (!Array.isArray(body)) {
                    return sendJson(res, 400, { error: "Body must be an array" });
                }
                const db = readDb();
                db[name] = body;
                writeDb(db);
                return sendJson(res, 200, db[name]);
            }
        }

        if (pathname === "/") {
            res.writeHead(302, { Location: "/index1.html" });
            return res.end();
        }

        let filePath = safeJoin(STATIC_DIR, pathname);
        if (!filePath) {
            res.writeHead(403);
            return res.end("Forbidden");
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, "index1.html");
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end("Not found");
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || "application/octet-stream";
        const data = fs.readFileSync(filePath);
        res.writeHead(200, {
            "Content-Type": type,
            "Content-Length": data.length,
            "Access-Control-Allow-Origin": "*"
        });
        res.end(data);
    } catch (e) {
        console.error(e);
        sendJson(res, 500, { error: e.message || "Server error" });
    }
});

ensureDb();
server.listen(PORT, () => {
    console.log("");
    console.log("  CICT Code Forum server running");
    console.log("  Open: http://localhost:" + PORT + "/index1.html");
    console.log("  API:  http://localhost:" + PORT + "/api/state");
    console.log("  Data: " + DB_PATH);
    console.log("");
});
