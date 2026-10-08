/* =========================================
   CICT CODE FORUM (v2)
   Shared database via server API when available.
   Falls back to localStorage if the server is offline.
========================================= */

const STORAGE = {
    accounts: "cict1_accounts",
    posts: "cict1_posts",
    cosmetics: "cict1_cosmetics",
    loggedInUser: "cict1_loggedInUser",
    userRole: "cict1_userRole",
    reports: "cict1_reports"
};

// Same-origin when site is served by the Node server.
// Change this only if API is hosted on another URL.
const API_BASE = "https://cict-forum-db.onrender.com";

const SERVER_KEY = {
    [STORAGE.accounts]: "accounts",
    [STORAGE.posts]: "posts",
    [STORAGE.cosmetics]: "cosmetics",
    [STORAGE.reports]: "reports"
};

const memoryCache = {
    accounts: null,
    posts: null,
    cosmetics: null,
    reports: null
};

let cloudEnabled = false;
let cloudSaveTimer = null;
let cloudReady = false;

function readLocal(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function writeLocal(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("localStorage write failed", e);
    }
}

function getStore(key, fallback) {
    const serverKey = SERVER_KEY[key];
    if (serverKey && memoryCache[serverKey] !== null && memoryCache[serverKey] !== undefined) {
        return memoryCache[serverKey];
    }
    return readLocal(key, fallback);
}

function setStore(key, value) {
    const serverKey = SERVER_KEY[key];
    if (serverKey) {
        memoryCache[serverKey] = value;
    }
    writeLocal(key, value);
    if (serverKey && cloudEnabled) {
        scheduleCloudSave();
    }
}

function scheduleCloudSave() {
    if (!cloudEnabled) return;
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
        saveToCloud().catch(err => console.warn("Cloud save failed:", err));
    }, 250);
}

async function saveToCloud() {
    if (!cloudEnabled) return;
    const body = {
        accounts: memoryCache.accounts !== null ? memoryCache.accounts : readLocal(STORAGE.accounts, []),
        posts: memoryCache.posts !== null ? memoryCache.posts : readLocal(STORAGE.posts, []),
        cosmetics: memoryCache.cosmetics !== null ? memoryCache.cosmetics : readLocal(STORAGE.cosmetics, []),
        reports: memoryCache.reports !== null ? memoryCache.reports : readLocal(STORAGE.reports, [])
    };
    const res = await fetch(API_BASE + "/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Save failed: " + res.status);
}

async function loadFromCloud() {
    try {
        const res = await fetch(API_BASE + "/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error("health failed");
        const stateRes = await fetch(API_BASE + "/api/state", { cache: "no-store" });
        if (!stateRes.ok) throw new Error("state failed");
        const data = await stateRes.json();

        memoryCache.accounts = Array.isArray(data.accounts) ? data.accounts : [];
        memoryCache.posts = Array.isArray(data.posts) ? data.posts : [];
        memoryCache.cosmetics = Array.isArray(data.cosmetics) ? data.cosmetics : [];
        memoryCache.reports = Array.isArray(data.reports) ? data.reports : [];

        // Keep a local backup
        writeLocal(STORAGE.accounts, memoryCache.accounts);
        writeLocal(STORAGE.posts, memoryCache.posts);
        writeLocal(STORAGE.cosmetics, memoryCache.cosmetics);
        writeLocal(STORAGE.reports, memoryCache.reports);

        cloudEnabled = true;
        cloudReady = true;
        console.log("Connected to shared database.");
        return true;
    } catch (e) {
        // Offline / opened as file:// — use localStorage only
        cloudEnabled = false;
        cloudReady = true;
        memoryCache.accounts = readLocal(STORAGE.accounts, []);
        memoryCache.posts = readLocal(STORAGE.posts, []);
        memoryCache.cosmetics = readLocal(STORAGE.cosmetics, []);
        memoryCache.reports = readLocal(STORAGE.reports, []);
        console.warn("Shared database unavailable — using local-only mode.", e.message || e);
        return false;
    }
}

/* =========================================
   SMALL HELPERS
========================================= */

function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text === null || text === undefined ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function idsMatch(a, b) {
    return String(a) === String(b);
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

/**
 * Builds a safe click hook:  <button ${act("deletePost", 12)}>
 * Arguments travel as escaped JSON in a data attribute, so usernames or text
 * can never break out into JavaScript (the old inline onclick="fn('name')" could).
 */
function act(fnName, ...args) {
    return `data-action="${escapeAttr(fnName)}" data-args="${escapeAttr(JSON.stringify(args))}"`;
}

document.addEventListener("click", function (event) {
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const fn = window[el.dataset.action];
    if (typeof fn !== "function") return;
    let args = [];
    try {
        args = JSON.parse(el.dataset.args || "[]");
    } catch (e) {
        args = [];
    }
    fn.apply(null, args);
});

/* =========================================
   TOASTS + FLASH MESSAGES (replace alert())
========================================= */

function toast(message, type, duration) {
    type = type || "info";
    duration = duration || 3600;
    let host = document.getElementById("toastHost");
    if (!host) {
        host = document.createElement("div");
        host.id = "toastHost";
        host.className = "toast-host";
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
        el.classList.remove("is-visible");
        setTimeout(() => el.remove(), 250);
    }, duration);
}

const FLASH_KEY = "cict1_flash";

/** Show a message on the NEXT page (used right before redirects). */
function flash(message, type) {
    try {
        sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type: type || "info" }));
    } catch (e) { /* ignore */ }
}

function showFlash() {
    try {
        const raw = sessionStorage.getItem(FLASH_KEY);
        if (!raw) return;
        sessionStorage.removeItem(FLASH_KEY);
        const data = JSON.parse(raw);
        if (data && data.message) toast(data.message, data.type);
    } catch (e) { /* ignore */ }
}

/* =========================================
   DIALOGS (replace prompt() / confirm())
========================================= */

/**
 * Generic modal form.
 * fields: [{ name, label, type, placeholder, value, required, note, options:[{value,label}] }]
 * Resolves with an object of values, or null if cancelled.
 */
function formDialog(opts) {
    opts = opts || {};
    const fields = opts.fields || [];
    const dismissible = opts.dismissible !== false;

    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";

        const fieldsHTML = fields.map(f => {
            const id = "mf-" + f.name;
            const req = f.required ? "required" : "";
            let control;
            if (f.type === "select") {
                control = `<select id="${id}" name="${escapeAttr(f.name)}" ${req}>` +
                    (f.options || []).map(o =>
                        `<option value="${escapeAttr(o.value)}"${idsMatch(o.value, f.value) ? " selected" : ""}>${escapeHtml(o.label)}</option>`
                    ).join("") + `</select>`;
            } else if (f.type === "textarea") {
                control = `<textarea id="${id}" name="${escapeAttr(f.name)}" rows="${f.rows || 4}" maxlength="${f.maxlength || 500}" placeholder="${escapeAttr(f.placeholder || "")}" ${req}>${escapeHtml(f.value || "")}</textarea>`;
            } else {
                control = `<input id="${id}" name="${escapeAttr(f.name)}" type="${escapeAttr(f.type || "text")}" value="${escapeAttr(f.value || "")}" placeholder="${escapeAttr(f.placeholder || "")}" autocomplete="${escapeAttr(f.autocomplete || "off")}" ${req}>`;
            }
            return `<label for="${id}">${escapeHtml(f.label)}</label>${control}` +
                (f.note ? `<p class="form-note">${escapeHtml(f.note)}</p>` : "");
        }).join("");

        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
                <form class="modal-form" novalidate>
                    <h3 id="modalTitle">${escapeHtml(opts.title || "")}</h3>
                    ${opts.description ? `<p class="modal-desc">${escapeHtml(opts.description)}</p>` : ""}
                    ${opts.html || ""}
                    ${fieldsHTML}
                    <p class="modal-error" role="alert" hidden></p>
                    <div class="modal-actions">
                        ${dismissible ? `<button type="button" class="btn-secondary" data-modal-cancel>${escapeHtml(opts.cancelLabel || "Cancel")}</button>` : ""}
                        <button type="submit" class="${opts.danger ? "btn-danger" : "btn-primary"}">${escapeHtml(opts.submitLabel || "OK")}</button>
                    </div>
                </form>
            </div>`;

        document.body.appendChild(overlay);
        document.body.classList.add("no-scroll");

        const form = overlay.querySelector("form");
        const errorEl = overlay.querySelector(".modal-error");

        function close(result) {
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            if (!document.querySelector(".modal-overlay, .lightbox:not([hidden])")) {
                document.body.classList.remove("no-scroll");
            }
            if (previousFocus && previousFocus.focus) previousFocus.focus();
            resolve(result);
        }

        function onKey(e) {
            if (e.key === "Escape" && dismissible) {
                e.stopPropagation();
                close(null);
            }
        }
        document.addEventListener("keydown", onKey, true);

        overlay.addEventListener("mousedown", e => {
            if (e.target === overlay && dismissible) close(null);
        });
        const cancelBtn = overlay.querySelector("[data-modal-cancel]");
        if (cancelBtn) cancelBtn.addEventListener("click", () => close(null));

        form.addEventListener("submit", e => {
            e.preventDefault();
            const values = {};
            for (const f of fields) {
                const el = form.elements[f.name];
                values[f.name] = el ? el.value : "";
                if (f.required && !String(values[f.name]).trim()) {
                    errorEl.textContent = (f.label || "This field") + " is required.";
                    errorEl.hidden = false;
                    el.focus();
                    return;
                }
            }
            if (typeof opts.validate === "function") {
                const problem = opts.validate(values);
                if (problem) {
                    errorEl.textContent = problem;
                    errorEl.hidden = false;
                    return;
                }
            }
            close(values);
        });

        const first = form.querySelector("input, textarea, select") || form.querySelector("button[type=submit]");
        if (first) setTimeout(() => first.focus(), 20);
    });
}

async function confirmDialog(message, opts) {
    opts = opts || {};
    const result = await formDialog({
        title: opts.title || "Please confirm",
        description: message,
        submitLabel: opts.confirmText || "Confirm",
        danger: !!opts.danger
    });
    return !!result;
}

/** Shows a value the person needs to copy (e.g. a temporary password). */
function infoDialog(title, message, copyText) {
    return formDialog({
        title,
        description: message,
        html: copyText ? `<div class="copy-box"><code>${escapeHtml(copyText)}</code></div>` : "",
        submitLabel: "Done",
        dismissible: false
    });
}

const REPORT_REASONS = [
    { value: "spam", label: "Spam or advertising" },
    { value: "harassment", label: "Harassment or bullying" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "other", label: "Something else" }
];

async function reportDialog(what) {
    const result = await formDialog({
        title: "Report " + what,
        description: "An admin will review your report. Reports are not shown to the author.",
        fields: [
            { name: "reason", label: "Reason", type: "select", options: REPORT_REASONS, value: "spam" },
            { name: "details", label: "Details (optional)", type: "textarea", rows: 3, maxlength: 300, placeholder: "Tell the admin what's wrong." }
        ],
        submitLabel: "Send report"
    });
    if (!result) return null;
    const label = (REPORT_REASONS.find(r => r.value === result.reason) || {}).label || result.reason;
    const details = (result.details || "").trim();
    return details ? label + " - " + details : label;
}

/* =========================================
   IMAGE ZOOM (lightbox)
   wheel / pinch / buttons / double-click, drag to pan
========================================= */

const lightboxState = { scale: 1, x: 0, y: 0, pointers: new Map(), pinchDist: 0, moved: false };
let lightboxEl = null;

function ensureLightbox() {
    if (lightboxEl) return lightboxEl;
    const el = document.createElement("div");
    el.className = "lightbox";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Image viewer");
    el.innerHTML = `
        <div class="lightbox-toolbar">
            <button type="button" data-lb="out" aria-label="Zoom out">&minus;</button>
            <span class="lightbox-level" aria-live="polite">100%</span>
            <button type="button" data-lb="in" aria-label="Zoom in">+</button>
            <button type="button" data-lb="reset">Reset</button>
            <button type="button" data-lb="close" aria-label="Close viewer">Close</button>
        </div>
        <div class="lightbox-stage"><img alt="" draggable="false"></div>
        <p class="lightbox-hint">Scroll or pinch to zoom, drag to move, double-click to toggle zoom.</p>`;
    document.body.appendChild(el);
    lightboxEl = el;

    const stage = el.querySelector(".lightbox-stage");
    const img = el.querySelector("img");

    el.querySelector(".lightbox-toolbar").addEventListener("click", e => {
        const btn = e.target.closest("[data-lb]");
        if (!btn) return;
        const action = btn.dataset.lb;
        if (action === "close") closeLightbox();
        if (action === "in") zoomLightbox(1.35);
        if (action === "out") zoomLightbox(1 / 1.35);
        if (action === "reset") resetLightbox();
    });

    stage.addEventListener("wheel", e => {
        e.preventDefault();
        zoomLightbox(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    }, { passive: false });

    stage.addEventListener("dblclick", e => {
        if (lightboxState.scale > 1.05) resetLightbox();
        else zoomLightbox(2.5, e.clientX, e.clientY);
    });

    stage.addEventListener("pointerdown", e => {
        stage.setPointerCapture(e.pointerId);
        lightboxState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        lightboxState.moved = false;
        if (lightboxState.pointers.size === 2) {
            const [a, b] = Array.from(lightboxState.pointers.values());
            lightboxState.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        }
    });

    stage.addEventListener("pointermove", e => {
        const prev = lightboxState.pointers.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        lightboxState.pointers.set(e.pointerId, cur);

        if (lightboxState.pointers.size === 2) {
            const [a, b] = Array.from(lightboxState.pointers.values());
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (lightboxState.pinchDist > 0) {
                zoomLightbox(dist / lightboxState.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
            }
            lightboxState.pinchDist = dist;
            lightboxState.moved = true;
        } else if (lightboxState.pointers.size === 1 && lightboxState.scale > 1) {
            lightboxState.x += cur.x - prev.x;
            lightboxState.y += cur.y - prev.y;
            lightboxState.moved = true;
            applyLightbox();
        }
    });

    function endPointer(e) {
        lightboxState.pointers.delete(e.pointerId);
        lightboxState.pinchDist = 0;
    }
    stage.addEventListener("pointerup", e => {
        endPointer(e);
        // A plain click on the dark background (not the image) closes the viewer.
        if (!lightboxState.moved && e.target === stage) closeLightbox();
    });
    stage.addEventListener("pointercancel", endPointer);

    document.addEventListener("keydown", e => {
        if (lightboxEl.hidden) return;
        if (e.key === "Escape") closeLightbox();
        if (e.key === "+" || e.key === "=") zoomLightbox(1.35);
        if (e.key === "-") zoomLightbox(1 / 1.35);
        if (e.key === "0") resetLightbox();
    });

    img.addEventListener("load", resetLightbox);
    return el;
}

function applyLightbox() {
    const img = lightboxEl.querySelector("img");
    img.style.transform = `translate(${lightboxState.x}px, ${lightboxState.y}px) scale(${lightboxState.scale})`;
    lightboxEl.querySelector(".lightbox-level").textContent = Math.round(lightboxState.scale * 100) + "%";
    lightboxEl.querySelector(".lightbox-stage").classList.toggle("is-zoomed", lightboxState.scale > 1);
}

function zoomLightbox(factor, clientX, clientY) {
    const stage = lightboxEl.querySelector(".lightbox-stage");
    const rect = stage.getBoundingClientRect();
    const px = (clientX === undefined ? rect.left + rect.width / 2 : clientX) - (rect.left + rect.width / 2);
    const py = (clientY === undefined ? rect.top + rect.height / 2 : clientY) - (rect.top + rect.height / 2);

    const oldScale = lightboxState.scale;
    const newScale = Math.min(8, Math.max(1, oldScale * factor));
    const ratio = newScale / oldScale;

    // Keep the point under the cursor fixed while zooming.
    lightboxState.x = px - (px - lightboxState.x) * ratio;
    lightboxState.y = py - (py - lightboxState.y) * ratio;
    lightboxState.scale = newScale;
    if (newScale === 1) {
        lightboxState.x = 0;
        lightboxState.y = 0;
    }
    applyLightbox();
}

function resetLightbox() {
    lightboxState.scale = 1;
    lightboxState.x = 0;
    lightboxState.y = 0;
    applyLightbox();
}

function openLightbox(src, alt) {
    const el = ensureLightbox();
    const img = el.querySelector("img");
    img.alt = alt || "";
    img.src = src;
    el.hidden = false;
    document.body.classList.add("no-scroll");
    resetLightbox();
    const closeBtn = el.querySelector('[data-lb="close"]');
    if (closeBtn) closeBtn.focus();
}

function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.hidden = true;
    lightboxState.pointers.clear();
    if (!document.querySelector(".modal-overlay")) {
        document.body.classList.remove("no-scroll");
    }
}

document.addEventListener("click", function (event) {
    const img = event.target.closest("img.zoomable");
    if (!img) return;
    event.preventDefault();
    openLightbox(img.currentSrc || img.src, img.alt);
});

/* =========================================
   SESSION / ACCOUNT HELPERS
========================================= */

const currentPage = window.location.pathname.split("/").pop() || "index1.html";
const userRole = localStorage.getItem(STORAGE.userRole);
const RESERVED_USERNAMES = ["admin", "designer"];

function getCurrentUsername() {
    return localStorage.getItem(STORAGE.loggedInUser);
}

function isStaffUsername(username) {
    return username === "admin" || username === "designer";
}

function isAdminUser() {
    return localStorage.getItem(STORAGE.userRole) === "admin";
}

function findAccount(username) {
    return getStore(STORAGE.accounts, []).find(a => a.username === username);
}

function roleBadgeHTML(role) {
    if (role === "teacher") return '<span class="role-badge teacher">Teacher</span>';
    if (role === "admin") return '<span class="role-badge admin">Admin</span>';
    if (role === "designer") return '<span class="role-badge designer">Designer</span>';
    return '<span class="role-badge student">Student</span>';
}

function goTo(url) {
    window.location.href = url;
}

/** Shrinks big photos so they fit in browser storage and sync quickly. */
function compressImageFile(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("That file is not a readable image."));
            img.onload = () => {
                const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * ratio);
                canvas.height = Math.round(img.height * ratio);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

/* =========================================
   PAGE ACCESS PROTECTION
========================================= */

const ALL_ROLES = ["student", "teacher", "admin", "designer"];
const PAGE_ACCESS = {
    "admin1.html": ["admin"],
    "designer1.html": ["admin", "designer"],
    "forum1.html": ALL_ROLES,
    "cosmetics1.html": ALL_ROLES,
    "profile1.html": ALL_ROLES
};

let accessBlocked = false;
(function guardPage() {
    const allowed = PAGE_ACCESS[currentPage];
    if (!allowed || allowed.includes(userRole)) return;
    accessBlocked = true;
    flash(userRole ? "You don't have permission to open that page." : "Please log in first.", "error");
    window.location.replace("login1.html");
})();

/* =========================================
   SIGN UP
========================================= */

const signupForm = document.getElementById("signupForm");

if (signupForm) {
    const roleSelect = document.getElementById("role");
    if (roleSelect) {
        roleSelect.addEventListener("change", function () {
            const role = this.value;
            const idLabel = document.getElementById("idLabel");
            const sectionLabel = document.getElementById("sectionLabel");
            const coeLabel = document.getElementById("coeLabel");
            const coeNote = document.getElementById("coeNote");
            if (role === "teacher") {
                if (idLabel) idLabel.textContent = "Employee / Faculty ID";
                if (sectionLabel) sectionLabel.textContent = "Department";
                if (coeLabel) coeLabel.textContent = "Faculty / Employee ID photo";
                if (coeNote) coeNote.textContent = "Upload a clear photo of your Faculty or Employee ID for admin verification.";
            } else {
                if (idLabel) idLabel.textContent = "Student ID number";
                if (sectionLabel) sectionLabel.textContent = "Section";
                if (coeLabel) coeLabel.textContent = "Certificate of Enrollment";
                if (coeNote) coeNote.textContent = "Upload a clear photo of your Certificate of Enrollment for admin verification.";
            }
        });
    }

    signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const role = document.getElementById("role").value;
        const fullname = document.getElementById("fullname").value.trim();
        const studentID = document.getElementById("studentID").value.trim();
        const section = document.getElementById("section").value.trim();
        const email = document.getElementById("email").value.trim();
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const coeFile = document.getElementById("coe").files[0];

        if (!role) return toast("Choose whether you are a student or a teacher.", "error");
        if (RESERVED_USERNAMES.includes(username.toLowerCase())) return toast("That username is reserved. Please pick another.", "error");
        if (password.length < 6) return toast("Use a password with at least 6 characters.", "error");
        if (password !== confirmPassword) return toast("Passwords do not match.", "error");
        if (!coeFile) return toast("Upload your verification document.", "error");

        const accounts = getStore(STORAGE.accounts, []);
        if (accounts.some(a => String(a.username).toLowerCase() === username.toLowerCase())) {
            return toast("That username is already taken.", "error");
        }
        if (accounts.some(a => a.studentID === studentID)) {
            return toast("An account with that ID already exists.", "error");
        }

        let coe;
        try {
            coe = await compressImageFile(coeFile, 1200, 0.8);
        } catch (e) {
            return toast(e.message, "error");
        }

        accounts.push({
            fullname,
            studentID,
            section,
            email,
            username,
            password,
            role,
            status: "pending",
            coe,
            points: 200,
            inventory: [],
            equipped: {},
            equippedTheme: null
        });
        setStore(STORAGE.accounts, accounts);
        flash("Registration submitted. You can log in once an admin approves your account.", "success");
        goTo("login1.html");
    });
}

/* =========================================
   LOGIN + PASSWORD RESET REQUEST
========================================= */

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;

        if (username === "admin" && password === "Admin@123") {
            localStorage.setItem(STORAGE.loggedInUser, "admin");
            localStorage.setItem(STORAGE.userRole, "admin");
            flash("Signed in as admin.", "success");
            goTo("admin1.html");
            return;
        }

        if (username === "designer" && password === "Designer@123") {
            localStorage.setItem(STORAGE.loggedInUser, "designer");
            localStorage.setItem(STORAGE.userRole, "designer");
            flash("Signed in as designer.", "success");
            goTo("designer1.html");
            return;
        }

        const accounts = getStore(STORAGE.accounts, []);
        const account = accounts.find(u => u.username === username && u.password === password);

        if (!account) return toast("Incorrect username or password.", "error");
        if (account.status === "pending") return toast("Your account is still waiting for admin approval.", "info");
        if (account.status === "rejected") return toast("Your registration was rejected by an admin.", "error");

        if (account.status === "approved") {
            localStorage.setItem(STORAGE.loggedInUser, account.username);
            localStorage.setItem(STORAGE.userRole, account.role || "student");
            flash(account.mustChangePassword ? "Signed in. Please choose a new password." : "Welcome back, " + (account.fullname || account.username) + ".", "success");
            goTo("forum1.html");
        }
    });

    const forgotLink = document.getElementById("forgotPasswordLink");
    if (forgotLink) {
        forgotLink.addEventListener("click", function (event) {
            event.preventDefault();
            openPasswordResetRequest();
        });
    }
}

async function openPasswordResetRequest() {
    const values = await formDialog({
        title: "Request a password reset",
        description: "Enter the username and email you registered with. An admin will verify your request and give you a temporary password.",
        fields: [
            { name: "username", label: "Username", required: true, placeholder: "Your username", autocomplete: "username" },
            { name: "email", label: "Email", type: "email", required: true, placeholder: "The email you signed up with", autocomplete: "email" }
        ],
        submitLabel: "Send request"
    });
    if (!values) return;

    const username = values.username.trim();
    const email = values.email.trim().toLowerCase();
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(a =>
        a.username === username &&
        String(a.email || "").trim().toLowerCase() === email &&
        a.status !== "rejected"
    );

    if (account && !(account.resetRequest && account.resetRequest.status === "open")) {
        account.resetRequest = {
            status: "open",
            requestedAt: Date.now(),
            date: new Date().toLocaleString()
        };
        setStore(STORAGE.accounts, accounts);
    }

    // Same answer whether or not the details matched, so nobody can probe for valid usernames.
    toast("Request sent. If those details match an account, an admin will review it.", "success", 5500);
}

function generateTempPassword() {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    const bytes = new Uint32Array(8);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    bytes.forEach(n => { out += alphabet[n % alphabet.length]; });
    return out;
}

function loadPasswordResets() {
    const container = document.getElementById("passwordResets");
    if (!container) return;

    const accounts = getStore(STORAGE.accounts, []);
    const open = accounts.filter(a => a.resetRequest && a.resetRequest.status === "open");
    container.innerHTML = "";

    if (open.length === 0) {
        container.innerHTML = "<p class='empty-state'>No password reset requests.</p>";
        return;
    }

    open.forEach(account => {
        const box = document.createElement("div");
        box.className = "admin-card";
        box.innerHTML = `
            <h3>${escapeHtml(account.fullname)} ${roleBadgeHTML(account.role)}</h3>
            <dl class="detail-list">
                <div><dt>Username</dt><dd>${escapeHtml(account.username)}</dd></div>
                <div><dt>Email</dt><dd>${escapeHtml(account.email)}</dd></div>
                <div><dt>ID</dt><dd>${escapeHtml(account.studentID)}</dd></div>
                <div><dt>Section / Dept</dt><dd>${escapeHtml(account.section)}</dd></div>
                <div><dt>Requested</dt><dd>${escapeHtml(account.resetRequest.date || "")}</dd></div>
            </dl>
            <p class="form-note">Confirm the person's identity (for example by their ID) before issuing a temporary password.</p>
            <div class="admin-actions">
                <button type="button" class="btn-approve" ${act("issueTempPassword", account.username)}>Issue temporary password</button>
                <button type="button" class="btn-reject" ${act("denyPasswordReset", account.username)}>Deny</button>
            </div>`;
        container.appendChild(box);
    });
}

async function issueTempPassword(username) {
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(a => a.username === username);
    if (!account) return;

    const temp = generateTempPassword();
    const ok = await confirmDialog(
        "Set a temporary password for " + account.fullname + " (@" + account.username + ")? They will be asked to choose a new one at their next login.",
        { title: "Issue temporary password", confirmText: "Set password" }
    );
    if (!ok) return;

    account.password = temp;
    account.mustChangePassword = true;
    account.resetRequest = Object.assign({}, account.resetRequest, { status: "issued", resolvedAt: Date.now() });
    setStore(STORAGE.accounts, accounts);
    loadAdminDashboard();

    await infoDialog(
        "Temporary password ready",
        "Give this password to " + account.fullname + " in person or through a trusted channel. It will not be shown again.",
        temp
    );
}

async function denyPasswordReset(username) {
    const ok = await confirmDialog("Deny this password reset request?", { title: "Deny request", confirmText: "Deny", danger: true });
    if (!ok) return;
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(a => a.username === username);
    if (!account) return;
    account.resetRequest = Object.assign({}, account.resetRequest, { status: "denied", resolvedAt: Date.now() });
    setStore(STORAGE.accounts, accounts);
    toast("Request denied.", "info");
    loadAdminDashboard();
}

/** After an admin issues a temporary password, the user must replace it. */
async function enforcePasswordChange() {
    const username = getCurrentUsername();
    if (!username || isStaffUsername(username)) return;
    const account = findAccount(username);
    if (!account || !account.mustChangePassword) return;

    const values = await formDialog({
        title: "Choose a new password",
        description: "You signed in with a temporary password. Set your own password to continue.",
        fields: [
            { name: "password", label: "New password", type: "password", required: true, autocomplete: "new-password" },
            { name: "confirm", label: "Confirm new password", type: "password", required: true, autocomplete: "new-password" }
        ],
        submitLabel: "Save password",
        dismissible: false,
        validate: v => {
            if (v.password.length < 6) return "Use at least 6 characters.";
            if (v.password === account.password) return "Choose a password different from the temporary one.";
            if (v.password !== v.confirm) return "Passwords do not match.";
            return "";
        }
    });
    if (!values) return;

    const accounts = getStore(STORAGE.accounts, []);
    const fresh = accounts.find(a => a.username === username);
    if (!fresh) return;
    fresh.password = values.password;
    fresh.mustChangePassword = false;
    if (fresh.resetRequest) fresh.resetRequest.status = "completed";
    setStore(STORAGE.accounts, accounts);
    toast("Password updated.", "success");
}

/* =========================================
   LOGOUT
========================================= */

function logoutUser() {
    localStorage.removeItem(STORAGE.loggedInUser);
    localStorage.removeItem(STORAGE.userRole);
    flash("You have been logged out.", "info");
    goTo("index1.html");
}

/* =========================================
   POINTS & USER INFO
========================================= */

function addPoints(username, amount) {
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.points = (account.points || 0) + amount;
    setStore(STORAGE.accounts, accounts);
}

function loadUserInfo() {
    const username = getCurrentUsername();
    if (!username) return;

    const currentUser = document.getElementById("currentUser");
    const userPoints = document.getElementById("userPoints");
    const shopPoints = document.getElementById("shopPoints");
    const badge = document.getElementById("userRoleBadge");

    if (isStaffUsername(username)) {
        if (currentUser) currentUser.textContent = username === "admin" ? "Administrator" : "Designer";
        if (userPoints) userPoints.textContent = "\u221E";
        if (shopPoints) shopPoints.textContent = "\u221E";
        if (badge) {
            badge.textContent = username === "admin" ? "Admin" : "Designer";
            badge.className = "role-badge " + username;
        }
        return;
    }

    const account = findAccount(username);
    if (!account) return;

    if (currentUser) currentUser.textContent = account.fullname;
    if (userPoints) userPoints.textContent = account.points || 0;
    if (shopPoints) shopPoints.textContent = account.points || 0;
    if (badge) {
        const isTeacher = account.role === "teacher";
        badge.textContent = isTeacher ? "Teacher" : "Student";
        badge.className = "role-badge " + (isTeacher ? "teacher" : "student");
    }
}

/* =========================================
   FORUM - POST CREATION
========================================= */

const postForm = document.getElementById("postForm");
const postMediaInput = document.getElementById("postMedia");

if (postMediaInput) {
    postMediaInput.addEventListener("change", function () {
        const nameEl = document.getElementById("mediaFileName");
        if (nameEl) nameEl.textContent = this.files[0] ? this.files[0].name : "";
    });
}

if (postForm) {
    postForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const content = document.getElementById("postContent").value.trim();
        const anonymous = document.getElementById("anonymousPost").checked;
        const mediaFile = document.getElementById("postMedia") ? document.getElementById("postMedia").files[0] : null;

        if (!content && !mediaFile) return toast("Write something or attach a file first.", "error");

        const username = getCurrentUsername();
        if (!username) {
            flash("Please log in first.", "error");
            return goTo("login1.html");
        }

        const role = localStorage.getItem(STORAGE.userRole) || "student";
        const postStatus = (role === "teacher" || role === "admin" || role === "designer") ? "approved" : "pending";

        const createPost = (mediaData, mediaType, mediaName) => {
            const posts = getStore(STORAGE.posts, []);
            posts.push({
                id: Date.now(),
                username,
                content: content || "",
                anonymous,
                reactionsBy: {},
                points: 3,
                date: new Date().toLocaleString(),
                status: postStatus,
                comments: [],
                media: mediaData || null,
                mediaType: mediaType || null,
                mediaName: mediaName || null
            });
            setStore(STORAGE.posts, posts);

            if (postStatus === "approved") addPoints(username, 3);

            postForm.reset();
            const nameEl = document.getElementById("mediaFileName");
            if (nameEl) nameEl.textContent = "";

            toast(postStatus === "pending"
                ? "Post submitted. It will appear once an admin approves it."
                : "Post published.", "success");

            loadUserInfo();
            refreshPostViews();
        };

        if (mediaFile) {
            if (mediaFile.size > 4 * 1024 * 1024) return toast("That file is over 4 MB. Please choose a smaller one.", "error");
            const reader = new FileReader();
            reader.onload = function () {
                const type = mediaFile.type.startsWith("image/") ? "image" :
                             mediaFile.type.startsWith("video/") ? "video" : "file";
                createPost(reader.result, type, mediaFile.name);
            };
            reader.readAsDataURL(mediaFile);
        } else {
            createPost();
        }
    });
}

/* =========================================
   REACTIONS (one per account, per post)
========================================= */

const REACTIONS = [
    { key: "like", emoji: "\uD83D\uDC4D", label: "Like" },
    { key: "heart", emoji: "\u2764\uFE0F", label: "Heart" },
    { key: "laugh", emoji: "\uD83D\uDE02", label: "Laugh" },
    { key: "dislike", emoji: "\uD83D\uDC4E", label: "Dislike" }
];

function countReactions(post) {
    const counts = { like: 0, heart: 0, laugh: 0, dislike: 0 };
    const by = post.reactionsBy || {};
    Object.keys(by).forEach(user => {
        if (counts[by[user]] !== undefined) counts[by[user]] += 1;
    });
    return counts;
}

function reactionBarHTML(post, username) {
    const counts = countReactions(post);
    const mine = (post.reactionsBy || {})[username];
    return REACTIONS.map(r => `
        <button type="button" class="react-btn${mine === r.key ? " is-active" : ""}"
            ${act("reactToPost", post.id, r.key)}
            aria-pressed="${mine === r.key}" aria-label="${r.label} (${counts[r.key]})" title="${r.label}">
            <span class="react-emoji" aria-hidden="true">${r.emoji}</span>
            <span class="react-count">${counts[r.key]}</span>
        </button>`).join("");
}

function updateReactionBar(postId) {
    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;
    const username = getCurrentUsername();
    document.querySelectorAll(`.reaction-bar[data-post-id="${postId}"]`).forEach(bar => {
        bar.innerHTML = reactionBarHTML(post, username);
    });
}

function reactToPost(postId, type) {
    const username = getCurrentUsername();
    if (!username) {
        flash("Please log in first.", "error");
        return goTo("login1.html");
    }
    if (!REACTIONS.some(r => r.key === type)) return;

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;

    if (!post.reactionsBy || typeof post.reactionsBy !== "object") post.reactionsBy = {};

    // One reaction per account: same button again removes it, another button switches it.
    if (post.reactionsBy[username] === type) {
        delete post.reactionsBy[username];
    } else {
        post.reactionsBy[username] = type;
    }

    setStore(STORAGE.posts, posts);
    updateReactionBar(postId);
}

/* =========================================
   POST CARDS
========================================= */

function getAuthorBadgeHTML(post, account) {
    if (post.anonymous) return "";
    if (account) return roleBadgeHTML(account.role);
    if (isStaffUsername(post.username)) return roleBadgeHTML(post.username);
    return "";
}

function renderMedia(post) {
    if (!post.media) return "";
    if (post.mediaType === "image") {
        return `<div class="post-media"><img src="${escapeAttr(post.media)}" alt="${escapeAttr(post.mediaName || "Attached image")}" class="post-image zoomable" title="Click to zoom"></div>`;
    }
    if (post.mediaType === "video") {
        return `<div class="post-media"><video controls class="post-video" src="${escapeAttr(post.media)}"></video></div>`;
    }
    return `<div class="post-media file-attachment">
        <a href="${escapeAttr(post.media)}" download="${escapeAttr(post.mediaName || "file")}" class="file-link">
            ${escapeHtml(post.mediaName || "Download file")}
        </a>
    </div>`;
}

function buildPostCard(post, accounts, currentUser) {
    const postCard = document.createElement("article");
    postCard.className = "post";
    postCard.dataset.postId = post.id;

    const authorAccount = accounts.find(a => a.username === post.username);
    const authorBadge = getAuthorBadgeHTML(post, authorAccount);
    const canReport = currentUser && post.username !== currentUser;
    const canDelete = currentUser && (post.username === currentUser || isAdminUser());
    const authorHTML = post.anonymous
        ? `<strong class="post-author">Anonymous</strong>`
        : `<a class="author-link" href="profile1.html?user=${encodeURIComponent(post.username)}"><strong class="post-author">${escapeHtml(post.username)}</strong></a>`;
    const commentCount = countVisibleComments(post.comments);

    postCard.innerHTML = `
        <div class="post-character">${createCharacter(post.anonymous ? null : post.username)}</div>
        <div class="post-main">
            <div class="speech-bubble">
                <div class="post-head">
                    ${authorHTML} ${authorBadge}
                    <small class="post-date">${escapeHtml(post.date || "")}</small>
                </div>
                <p class="post-text">${escapeHtml(post.content)}</p>
                ${renderMedia(post)}
            </div>
            <div class="post-actions">
                <div class="reaction-bar" data-post-id="${post.id}" role="group" aria-label="Reactions">
                    ${reactionBarHTML(post, currentUser)}
                </div>
                <div class="post-actions-right">
                    <button type="button" class="btn-ghost btn-comments" ${act("toggleComments", post.id)}>Comments (${commentCount})</button>
                    ${canReport ? `<button type="button" class="btn-ghost btn-report" ${act("reportPost", post.id)}>Report</button>` : ""}
                    ${canDelete ? `<button type="button" class="btn-ghost btn-danger-text" ${act("deletePost", post.id)}>Delete</button>` : ""}
                </div>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display:none;">
                <div class="comments-list" id="comments-list-${post.id}"></div>
                <div class="comment-form">
                    <textarea id="comment-input-${post.id}" placeholder="Write a comment..." maxlength="500" aria-label="Write a comment"></textarea>
                    <button type="button" class="btn-primary" ${act("addComment", post.id)}>Add comment</button>
                </div>
            </div>
        </div>
    `;
    return postCard;
}

function appendPostsToContainer(container, postsList) {
    const currentUser = getCurrentUsername();
    const accounts = getStore(STORAGE.accounts, []);
    container.innerHTML = "";
    if (!postsList.length) return false;

    postsList.forEach(post => {
        container.appendChild(buildPostCard(post, accounts, currentUser));
        renderComments(post.id);
    });
    return true;
}

function loadForum() {
    const container = document.getElementById("postContainer");
    if (!container) return;

    const posts = getStore(STORAGE.posts, []);
    const approvedPosts = posts.filter(p => p.status === "approved" || !p.status);

    if (!approvedPosts.length) {
        container.innerHTML = "<p class='empty-state'>No posts yet. Be the first to share something.</p>";
        return;
    }
    appendPostsToContainer(container, approvedPosts.slice().reverse());
}

function refreshPostViews() {
    loadForum();
    if (document.getElementById("profilePosts")) loadProfilePage();
}

function refreshEverything() {
    refreshPostViews();
    if (typeof loadAdminDashboard === "function") loadAdminDashboard();
}

async function deletePost(postId) {
    const username = getCurrentUsername();
    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;

    if (post.username !== username && !isAdminUser()) {
        return toast("You can only delete your own posts.", "error");
    }

    const ok = await confirmDialog("This will permanently remove the post and its comments.", {
        title: "Delete this post?", confirmText: "Delete post", danger: true
    });
    if (!ok) return;

    setStore(STORAGE.posts, posts.filter(p => !idsMatch(p.id, postId)));
    closeReportsFor(postId);
    toast("Post deleted.", "success");
    refreshEverything();
}

// Kept so older markup that calls adminDeletePost() still works.
function adminDeletePost(postId) {
    return deletePost(postId);
}

function closeReportsFor(postId, commentId) {
    const reports = getStore(STORAGE.reports, []);
    let changed = false;
    reports.forEach(r => {
        if (r.status !== "open" || !idsMatch(r.postId, postId)) return;
        if (commentId !== undefined && !(r.type === "comment" && idsMatch(r.commentId, commentId))) return;
        r.status = "removed";
        changed = true;
    });
    if (changed) setStore(STORAGE.reports, reports);
}

/* =========================================
   COMMENTS (threaded replies, edit, delete, report)
========================================= */

function countVisibleComments(comments) {
    return (comments || []).filter(c => !c.deleted).length;
}

function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    section.style.display = section.style.display === "none" ? "block" : "none";
}

function getReplies(comments, parentId) {
    return (comments || []).filter(c => {
        if (parentId === null || parentId === undefined) {
            return c.parentId === null || c.parentId === undefined;
        }
        return idsMatch(c.parentId, parentId);
    });
}

function buildCommentNode(postId, post, comment, allComments, depth, currentUser) {
    const maxDepth = 4;
    const replies = getReplies(allComments, comment.id);
    const wrapper = document.createElement("div");
    wrapper.className = "comment-thread" + (depth > 0 ? " is-reply" : "");
    wrapper.dataset.commentId = comment.id;
    const indent = Math.min(depth, maxDepth) * 18;

    if (comment.deleted) {
        wrapper.innerHTML = `
            <div class="comment is-deleted" style="margin-left:${indent}px">
                <p class="comment-deleted">This comment was deleted.</p>
            </div>`;
    } else {
        const isOwn = comment.author === currentUser;
        const canDelete = currentUser && (isOwn || post.username === currentUser || isAdminUser());
        const canReport = currentUser && !isOwn;
        const key = `${postId}-${comment.id}`;
        const replyToLabel = comment.replyToAuthor
            ? `<span class="reply-to">replying to @${escapeHtml(comment.replyToAuthor)}</span>`
            : "";

        wrapper.innerHTML = `
            <div class="comment" style="margin-left:${indent}px">
                <div class="comment-header">
                    <a class="author-link" href="profile1.html?user=${encodeURIComponent(comment.author)}"><strong>${escapeHtml(comment.author)}</strong></a>
                    ${replyToLabel}
                    <span class="comment-date">${escapeHtml(comment.date || "")}${comment.edited ? ' <span class="comment-edited">(edited)</span>' : ""}</span>
                </div>
                <div class="comment-body" id="comment-body-${key}">
                    <p>${escapeHtml(comment.text)}</p>
                </div>
                <div class="comment-edit" id="comment-edit-${key}" hidden>
                    <textarea id="edit-input-${key}" maxlength="500" aria-label="Edit comment">${escapeHtml(comment.text)}</textarea>
                    <div class="reply-form-actions">
                        <button type="button" class="btn-primary" ${act("saveCommentEdit", postId, comment.id)}>Save</button>
                        <button type="button" class="btn-cancel" ${act("cancelCommentEdit", postId, comment.id)}>Cancel</button>
                    </div>
                </div>
                <div class="comment-actions">
                    <button type="button" class="comment-reply-btn" ${act("toggleReplyForm", postId, comment.id, comment.author)}>Reply</button>
                    ${isOwn ? `<button type="button" class="comment-reply-btn" ${act("startEditComment", postId, comment.id)}>Edit</button>` : ""}
                    ${canDelete ? `<button type="button" class="comment-reply-btn is-danger" ${act("deleteComment", postId, comment.id)}>Delete</button>` : ""}
                    ${canReport ? `<button type="button" class="comment-reply-btn" ${act("reportComment", postId, comment.id)}>Report</button>` : ""}
                </div>
                <div class="reply-form" id="reply-form-${key}" style="display:none;">
                    <textarea id="reply-input-${key}" placeholder="Reply to ${escapeAttr(comment.author)}..." maxlength="500" aria-label="Reply"></textarea>
                    <div class="reply-form-actions">
                        <button type="button" class="btn-primary" ${act("addComment", postId, comment.id, comment.author)}>Post reply</button>
                        <button type="button" class="btn-cancel" ${act("toggleReplyForm", postId, comment.id)}>Cancel</button>
                    </div>
                </div>
            </div>`;
    }

    const repliesBox = document.createElement("div");
    repliesBox.className = "comment-replies";
    replies.forEach(reply => {
        repliesBox.appendChild(buildCommentNode(postId, post, reply, allComments, depth + 1, currentUser));
    });
    wrapper.appendChild(repliesBox);
    return wrapper;
}

function renderComments(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;

    const currentUser = getCurrentUsername();
    const comments = post.comments || [];
    list.innerHTML = "";

    if (countVisibleComments(comments) === 0) {
        list.innerHTML = "<p class='empty-state small'>No comments yet. Start the conversation.</p>";
        updateCommentCountButton(postId, 0);
        return;
    }

    const roots = getReplies(comments, null);
    roots.forEach(c => list.appendChild(buildCommentNode(postId, post, c, comments, 0, currentUser)));

    // Replies whose parent is missing still show at the top level.
    const shown = new Set();
    (function mark(nodes) {
        nodes.forEach(n => {
            shown.add(String(n.id));
            mark(getReplies(comments, n.id));
        });
    })(roots);
    comments.forEach(c => {
        if (!shown.has(String(c.id))) list.appendChild(buildCommentNode(postId, post, c, comments, 0, currentUser));
    });

    updateCommentCountButton(postId, countVisibleComments(comments));
}

function updateCommentCountButton(postId, count) {
    document.querySelectorAll(`.post[data-post-id="${postId}"] .btn-comments`).forEach(b => {
        b.textContent = `Comments (${count})`;
    });
}

function toggleReplyForm(postId, commentId, author) {
    const form = document.getElementById(`reply-form-${postId}-${commentId}`);
    if (!form) return;
    const isHidden = form.style.display === "none" || !form.style.display;
    form.style.display = isHidden ? "block" : "none";
    if (isHidden) {
        const input = document.getElementById(`reply-input-${postId}-${commentId}`);
        if (input) {
            input.focus();
            if (author) input.placeholder = `Reply to ${author}...`;
        }
    }
}

function addComment(postId, parentId, replyToAuthor) {
    const isReply = parentId !== undefined && parentId !== null;
    const input = isReply
        ? document.getElementById(`reply-input-${postId}-${parentId}`)
        : document.getElementById(`comment-input-${postId}`);
    if (!input) return;

    const text = input.value.trim();
    if (!text) return toast(isReply ? "Write a reply first." : "Write a comment first.", "error");

    const username = getCurrentUsername();
    if (!username) {
        flash("Please log in first.", "error");
        return goTo("login1.html");
    }

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;
    if (!post.comments) post.comments = [];

    post.comments.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        parentId: isReply ? parentId : null,
        replyToAuthor: isReply ? (replyToAuthor || null) : null,
        author: username,
        text,
        date: new Date().toLocaleString()
    });

    setStore(STORAGE.posts, posts);
    input.value = "";
    renderComments(postId);
}

function startEditComment(postId, commentId) {
    const key = `${postId}-${commentId}`;
    const body = document.getElementById(`comment-body-${key}`);
    const edit = document.getElementById(`comment-edit-${key}`);
    if (!body || !edit) return;
    body.hidden = true;
    edit.hidden = false;
    const input = document.getElementById(`edit-input-${key}`);
    if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

function cancelCommentEdit(postId, commentId) {
    renderComments(postId);
}

function saveCommentEdit(postId, commentId) {
    const input = document.getElementById(`edit-input-${postId}-${commentId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return toast("A comment can't be empty. Delete it instead.", "error");

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    const comment = post && (post.comments || []).find(c => idsMatch(c.id, commentId));
    if (!comment) return;
    if (comment.author !== getCurrentUsername()) return toast("You can only edit your own comments.", "error");

    if (comment.text !== text) {
        comment.text = text;
        comment.edited = true;
        comment.editedAt = Date.now();
        setStore(STORAGE.posts, posts);
        toast("Comment updated.", "success");
    }
    renderComments(postId);
}

/**
 * Removes a comment from a post object.
 * If other replies hang under it, it becomes "This comment was deleted." so the thread still reads properly.
 */
function removeCommentFromPost(post, commentId) {
    const comments = post.comments || [];
    const target = comments.find(c => idsMatch(c.id, commentId));
    if (!target) return;

    const hasReplies = comments.some(c => idsMatch(c.parentId, commentId) && c.parentId !== null && c.parentId !== undefined);
    if (hasReplies) {
        target.deleted = true;
        target.text = "";
        return;
    }

    let current = target;
    while (current) {
        const parentId = current.parentId;
        post.comments = post.comments.filter(c => !idsMatch(c.id, current.id));
        const parent = (parentId === null || parentId === undefined)
            ? null
            : post.comments.find(c => idsMatch(c.id, parentId));
        const parentHasOthers = parent && post.comments.some(c => idsMatch(c.parentId, parent.id));
        current = parent && parent.deleted && !parentHasOthers ? parent : null;
    }
}

async function deleteComment(postId, commentId) {
    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    const comment = post && (post.comments || []).find(c => idsMatch(c.id, commentId));
    if (!comment) return;

    const username = getCurrentUsername();
    if (comment.author !== username && post.username !== username && !isAdminUser()) {
        return toast("You can't delete this comment.", "error");
    }

    const ok = await confirmDialog("This comment will be removed.", {
        title: "Delete comment?", confirmText: "Delete", danger: true
    });
    if (!ok) return;

    removeCommentFromPost(post, commentId);
    setStore(STORAGE.posts, posts);
    closeReportsFor(postId, commentId);
    toast("Comment deleted.", "success");
    renderComments(postId);
    if (typeof loadReports === "function") loadReports();
}

/* =========================================
   REPORTS (posts and comments)
========================================= */

async function reportPost(postId) {
    const username = getCurrentUsername();
    if (!username) return toast("Please log in first.", "error");

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return toast("That post no longer exists.", "error");

    const reports = getStore(STORAGE.reports, []);
    if (reports.some(r => (r.type || "post") === "post" && idsMatch(r.postId, postId) && r.reportedBy === username && r.status === "open")) {
        return toast("You already reported this post.", "info");
    }

    const reason = await reportDialog("post");
    if (!reason) return;

    reports.push({
        id: Date.now(),
        type: "post",
        postId: post.id,
        postContent: post.content,
        postAuthor: post.username,
        reportedBy: username,
        reason,
        date: new Date().toLocaleString(),
        status: "open"
    });
    setStore(STORAGE.reports, reports);
    toast("Report sent. An admin will review it.", "success");
}

async function reportComment(postId, commentId) {
    const username = getCurrentUsername();
    if (!username) return toast("Please log in first.", "error");

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    const comment = post && (post.comments || []).find(c => idsMatch(c.id, commentId));
    if (!comment || comment.deleted) return toast("That comment no longer exists.", "error");
    if (comment.author === username) return toast("You can't report your own comment.", "info");

    const reports = getStore(STORAGE.reports, []);
    if (reports.some(r => r.type === "comment" && idsMatch(r.commentId, commentId) && r.reportedBy === username && r.status === "open")) {
        return toast("You already reported this comment.", "info");
    }

    const reason = await reportDialog("comment");
    if (!reason) return;

    reports.push({
        id: Date.now(),
        type: "comment",
        postId: post.id,
        commentId: comment.id,
        commentText: comment.text,
        commentAuthor: comment.author,
        postContent: post.content,
        postAuthor: post.username,
        reportedBy: username,
        reason,
        date: new Date().toLocaleString(),
        status: "open"
    });
    setStore(STORAGE.reports, reports);
    toast("Report sent. An admin will review it.", "success");
}

/* =========================================
   ADMIN DASHBOARD
========================================= */

function isRealAccount(account) {
    return !account.staff && account.role !== "admin" && account.role !== "designer";
}

function accountCardHTML(account, extra) {
    return `
        <h3>${escapeHtml(account.fullname)} ${roleBadgeHTML(account.role)}</h3>
        <dl class="detail-list">
            <div><dt>ID</dt><dd>${escapeHtml(account.studentID)}</dd></div>
            <div><dt>Section / Dept</dt><dd>${escapeHtml(account.section)}</dd></div>
            ${extra || ""}
            <div><dt>Username</dt><dd>${escapeHtml(account.username)}</dd></div>
        </dl>`;
}

function loadAdminDashboard() {
    const pendingContainer = document.getElementById("pendingAccounts");
    const approvedContainer = document.getElementById("approvedAccounts");
    const postsContainer = document.getElementById("adminPosts");
    const pendingPostsContainer = document.getElementById("pendingPosts");
    const reportedContainer = document.getElementById("reportedPosts");
    const resetsContainer = document.getElementById("passwordResets");

    if (!pendingContainer && !approvedContainer && !postsContainer && !pendingPostsContainer && !reportedContainer && !resetsContainer) return;

    const accounts = getStore(STORAGE.accounts, []).filter(isRealAccount);

    if (pendingContainer) {
        pendingContainer.innerHTML = "";
        const pendingAccounts = accounts.filter(a => a.status === "pending");

        if (pendingAccounts.length === 0) {
            pendingContainer.innerHTML = "<p class='empty-state'>No pending registrations.</p>";
        } else {
            pendingAccounts.forEach(account => {
                const box = document.createElement("div");
                box.className = "admin-card";
                box.innerHTML = `
                    ${accountCardHTML(account, `<div><dt>Email</dt><dd>${escapeHtml(account.email)}</dd></div>`)}
                    <img class="verification-img zoomable" src="${escapeAttr(account.coe)}" alt="Verification document for ${escapeAttr(account.fullname)}" title="Click to zoom">
                    <div class="admin-actions">
                        <button type="button" class="btn-approve" ${act("approveAccount", account.username)}>Approve</button>
                        <button type="button" class="btn-reject" ${act("rejectAccount", account.username)}>Reject</button>
                    </div>`;
                pendingContainer.appendChild(box);
            });
        }
    }

    if (approvedContainer) {
        approvedContainer.innerHTML = "";
        const approved = accounts.filter(a => a.status === "approved");

        if (approved.length === 0) {
            approvedContainer.innerHTML = "<p class='empty-state'>No approved accounts.</p>";
        } else {
            approved.forEach(account => {
                const box = document.createElement("div");
                box.className = "admin-card";
                box.innerHTML = `
                    ${accountCardHTML(account, `<div><dt>Points</dt><dd>${Number(account.points) || 0}</dd></div>`)}
                    <div class="admin-actions">
                        <button type="button" class="btn-danger" ${act("deleteAccount", account.username)}>Delete account</button>
                    </div>`;
                approvedContainer.appendChild(box);
            });
        }
    }

    if (resetsContainer) loadPasswordResets();
    if (pendingPostsContainer) loadPendingPosts();
    if (postsContainer) loadAdminPosts();
    if (reportedContainer) loadReports();
}

function approveAccount(username) {
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.status = "approved";
    setStore(STORAGE.accounts, accounts);
    toast(account.fullname + " approved.", "success");
    loadAdminDashboard();
}

async function rejectAccount(username) {
    const ok = await confirmDialog("The person will not be able to log in.", { title: "Reject registration?", confirmText: "Reject", danger: true });
    if (!ok) return;
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.status = "rejected";
    setStore(STORAGE.accounts, accounts);
    toast("Registration rejected.", "info");
    loadAdminDashboard();
}

async function deleteAccount(username) {
    const ok = await confirmDialog("This removes the account and all of its posts.", {
        title: "Delete this account?", confirmText: "Delete account", danger: true
    });
    if (!ok) return;

    setStore(STORAGE.accounts, getStore(STORAGE.accounts, []).filter(a => a.username !== username));
    setStore(STORAGE.posts, getStore(STORAGE.posts, []).filter(p => p.username !== username));

    toast("Account deleted.", "success");
    loadAdminDashboard();
}

/* ---------- Pending + all posts ---------- */

function loadPendingPosts() {
    const container = document.getElementById("pendingPosts");
    if (!container) return;

    const posts = getStore(STORAGE.posts, []);
    const pending = posts.filter(p => p.status === "pending");
    container.innerHTML = "";

    if (pending.length === 0) {
        container.innerHTML = "<p class='empty-state'>No posts waiting for approval.</p>";
        return;
    }

    const accounts = getStore(STORAGE.accounts, []);

    pending.slice().reverse().forEach(post => {
        const account = accounts.find(u => u.username === post.username);
        const box = document.createElement("div");
        box.className = "admin-card";
        box.innerHTML = `
            <p class="admin-post-text">${escapeHtml(post.content)}</p>
            ${renderMedia(post)}
            <dl class="detail-list">
                <div><dt>Posted by</dt><dd>${account ? escapeHtml(account.fullname) : escapeHtml(post.username)}</dd></div>
                <div><dt>Username</dt><dd>${escapeHtml(post.username)}</dd></div>
                <div><dt>Anonymous</dt><dd>${post.anonymous ? "Yes" : "No"}</dd></div>
                <div><dt>Date</dt><dd>${escapeHtml(post.date || "")}</dd></div>
            </dl>
            <div class="admin-actions">
                <button type="button" class="btn-approve" ${act("approvePost", post.id)}>Approve</button>
                <button type="button" class="btn-reject" ${act("rejectPost", post.id)}>Reject</button>
            </div>`;
        container.appendChild(box);
    });
}

function loadAdminPosts() {
    const container = document.getElementById("adminPosts");
    if (!container) return;

    const posts = getStore(STORAGE.posts, []);
    const accounts = getStore(STORAGE.accounts, []);
    container.innerHTML = "";

    if (posts.length === 0) {
        container.innerHTML = "<p class='empty-state'>No forum posts.</p>";
        return;
    }

    posts.slice().reverse().forEach(post => {
        const account = accounts.find(u => u.username === post.username);
        const counts = countReactions(post);
        const statusBadge = post.status === "pending" ? '<span class="status-badge pending">Pending</span>' :
                            post.status === "rejected" ? '<span class="status-badge rejected">Rejected</span>' :
                            '<span class="status-badge approved">Approved</span>';
        const box = document.createElement("div");
        box.className = "admin-card";
        box.innerHTML = `
            <p class="admin-post-text">${escapeHtml(post.content)} ${statusBadge}</p>
            ${renderMedia(post)}
            <dl class="detail-list">
                <div><dt>Posted by</dt><dd>${account ? escapeHtml(account.fullname) : escapeHtml(post.username)} (@${escapeHtml(post.username)})</dd></div>
                <div><dt>Anonymous</dt><dd>${post.anonymous ? "Yes" : "No"}</dd></div>
                <div><dt>Reactions</dt><dd>\uD83D\uDC4D ${counts.like} &nbsp; \u2764\uFE0F ${counts.heart} &nbsp; \uD83D\uDE02 ${counts.laugh} &nbsp; \uD83D\uDC4E ${counts.dislike}</dd></div>
                <div><dt>Comments</dt><dd>${countVisibleComments(post.comments)}</dd></div>
            </dl>
            <div class="admin-actions">
                <button type="button" class="btn-danger" ${act("deletePost", post.id)}>Delete post</button>
            </div>`;
        container.appendChild(box);
    });
}

function approvePost(postId) {
    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;
    post.status = "approved";
    setStore(STORAGE.posts, posts);
    addPoints(post.username, 3);
    toast("Post approved.", "success");
    loadAdminDashboard();
}

async function rejectPost(postId) {
    const ok = await confirmDialog("The author will not see this post on the forum.", { title: "Reject this post?", confirmText: "Reject", danger: true });
    if (!ok) return;
    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => idsMatch(p.id, postId));
    if (!post) return;
    post.status = "rejected";
    setStore(STORAGE.posts, posts);
    toast("Post rejected.", "info");
    loadAdminDashboard();
}

/* ---------- Reports ---------- */

function loadReports() {
    const container = document.getElementById("reportedPosts");
    if (!container) return;

    const openReports = getStore(STORAGE.reports, []).filter(r => r.status === "open");
    container.innerHTML = "";

    if (openReports.length === 0) {
        container.innerHTML = "<p class='empty-state'>No open reports.</p>";
        return;
    }

    openReports.slice().reverse().forEach(report => {
        const isComment = report.type === "comment";
        const box = document.createElement("div");
        box.className = "admin-card report-card";
        box.innerHTML = `
            <p class="report-kind">${isComment ? "Reported comment" : "Reported post"}</p>
            <p class="admin-post-text">${escapeHtml(isComment ? report.commentText : (report.postContent || "(no text)"))}</p>
            <dl class="detail-list">
                <div><dt>Author</dt><dd>${escapeHtml(isComment ? report.commentAuthor : report.postAuthor)}</dd></div>
                ${isComment ? `<div><dt>On post</dt><dd>${escapeHtml((report.postContent || "").slice(0, 80))}${(report.postContent || "").length > 80 ? "..." : ""}</dd></div>` : ""}
                <div><dt>Reported by</dt><dd>${escapeHtml(report.reportedBy)}</dd></div>
                <div><dt>Reason</dt><dd>${escapeHtml(report.reason)}</dd></div>
                <div><dt>Date</dt><dd>${escapeHtml(report.date || "")}</dd></div>
            </dl>
            <div class="admin-actions">
                <button type="button" class="btn-danger" ${act("resolveReport", report.id, true)}>${isComment ? "Delete comment" : "Delete post"}</button>
                <button type="button" class="btn-approve" ${act("resolveReport", report.id, false)}>Dismiss report</button>
            </div>`;
        container.appendChild(box);
    });
}

// Old name, kept for compatibility.
function loadReportedPosts() {
    loadReports();
}

async function resolveReport(reportId, removeContent) {
    const reports = getStore(STORAGE.reports, []);
    const report = reports.find(r => idsMatch(r.id, reportId));
    if (!report) return;
    const isComment = report.type === "comment";

    const ok = removeContent
        ? await confirmDialog(isComment ? "The comment will be removed and the report closed." : "The post will be removed and the report closed.",
            { title: isComment ? "Delete reported comment?" : "Delete reported post?", confirmText: "Delete", danger: true })
        : await confirmDialog("The content stays up and this report is closed.", { title: "Dismiss report?", confirmText: "Dismiss" });
    if (!ok) return;

    if (removeContent) {
        const posts = getStore(STORAGE.posts, []);
        if (isComment) {
            const post = posts.find(p => idsMatch(p.id, report.postId));
            if (post) {
                removeCommentFromPost(post, report.commentId);
                setStore(STORAGE.posts, posts);
            }
            closeReportsFor(report.postId, report.commentId);
        } else {
            setStore(STORAGE.posts, posts.filter(p => !idsMatch(p.id, report.postId)));
            closeReportsFor(report.postId);
        }
    } else {
        const fresh = getStore(STORAGE.reports, []);
        const target = fresh.find(r => idsMatch(r.id, reportId));
        if (target) target.status = "dismissed";
        setStore(STORAGE.reports, fresh);
    }

    toast(removeContent ? "Content deleted and report closed." : "Report dismissed.", "success");
    loadAdminDashboard();
}

/* ---------- Test data ---------- */

const clearDataButton = document.getElementById("clearDataButton");
if (clearDataButton) {
    clearDataButton.addEventListener("click", async function () {
        const ok = await confirmDialog(
            "This deletes ALL accounts, posts, reports and custom cosmetics" +
            (cloudEnabled ? " from the shared database, for everyone." : " stored in this browser."),
            { title: "Clear test data?", confirmText: "Clear everything", danger: true }
        );
        if (!ok) return;

        // Write empty lists through setStore so the shared database is cleared too.
        setStore(STORAGE.accounts, []);
        setStore(STORAGE.posts, []);
        setStore(STORAGE.cosmetics, []);
        setStore(STORAGE.reports, []);
        ensureStarterCosmetics();
        toast("All test data has been cleared.", "success");
        loadAdminDashboard();
    });
}

/* =========================================
   CHARACTER RENDERER
   One renderer is used by the shop, the profile page and forum posts,
   so a character always looks the same everywhere.
========================================= */

const LAYER_ORDER = ["skin", "ears", "eyes", "eyebrows", "eyelashes", "nose", "mouth", "tops", "pants", "shoes", "hats"];
const FACE_CATEGORIES = ["eyes", "mouth", "nose", "ears", "eyebrows", "eyelashes", "skin"];
const CHARACTER_STATE_CLASSES = ["has-mouth-cosmetic", "has-eyes-cosmetic", "has-skin-cosmetic"];

function baseFigureHTML() {
    return `
        <div class="char-figure">
            <div class="char-head">
                <div class="char-eye left"></div>
                <div class="char-eye right"></div>
                <div class="char-mouth"></div>
            </div>
            <div class="char-body"></div>
            <div class="char-arm left"></div>
            <div class="char-arm right"></div>
            <div class="char-leg left"></div>
            <div class="char-leg right"></div>
        </div>`;
}

function getBaseCharacterHTML() {
    return `<div class="character-layer character-base">${baseFigureHTML()}</div>`;
}

function safeColor(value) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value || "")) ? value : "";
}

/**
 * Works out what a character wears.
 * `previewItems` ({ category: cosmeticId }) temporarily replaces equipped items (shop preview).
 */
function getLoadout(account, previewItems) {
    const cosmetics = getStore(STORAGE.cosmetics, []);
    const chosen = Object.assign({}, (account && account.equipped) || {}, previewItems || {});
    const items = [];

    Object.keys(chosen).forEach(category => {
        if (category === "themes") return;
        const cosmetic = cosmetics.find(c => idsMatch(c.id, chosen[category]));
        if (cosmetic && cosmetic.image) items.push({ category: cosmetic.category || category, cosmetic });
    });

    items.sort((a, b) => {
        const ia = LAYER_ORDER.indexOf(a.category);
        const ib = LAYER_ORDER.indexOf(b.category);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const classes = [];
    let tone = "";
    items.forEach(item => {
        if (item.category === "mouth") classes.push("has-mouth-cosmetic");
        if (item.category === "eyes") classes.push("has-eyes-cosmetic");
        if (item.category === "skin") {
            classes.push("has-skin-cosmetic");
            tone = safeColor(item.cosmetic.tone);
        }
    });

    return { items, classes, tone };
}

function layersHTML(loadout) {
    return loadout.items.map(item =>
        `<div class="character-layer layer-${escapeAttr(item.category)}"><img class="cosmetic-layer-img" src="${escapeAttr(item.cosmetic.image)}" alt="" draggable="false"></div>`
    ).join("");
}

/** Draws a loadout into an existing 300x400 stage element. */
function applyLoadout(stage, layersBox, loadout) {
    if (!stage || !layersBox) return;

    let base = stage.querySelector(".character-base");
    if (!base) {
        stage.insertAdjacentHTML("afterbegin", getBaseCharacterHTML());
    } else if (!base.querySelector(".char-figure")) {
        base.innerHTML = baseFigureHTML();
    }

    stage.classList.remove(...CHARACTER_STATE_CLASSES);
    loadout.classes.forEach(c => stage.classList.add(c));
    if (loadout.tone) stage.style.setProperty("--skin", loadout.tone);
    else stage.style.removeProperty("--skin");

    layersBox.innerHTML = layersHTML(loadout);
}

/** Small character used on forum posts. Anonymous posts get a plain, unrevealing character. */
function createCharacter(username) {
    const account = username ? findAccount(username) : null;
    const loadout = getLoadout(account);
    const cls = ["forum-character-body"].concat(loadout.classes).join(" ");
    const style = loadout.tone ? ` style="--skin:${loadout.tone}"` : "";
    return `
        <div class="forum-character">
            <div class="${cls}"${style}>
                ${getBaseCharacterHTML()}
                ${layersHTML(loadout)}
            </div>
        </div>`;
}

function getThemeImage(account, previewThemeId) {
    const themeId = previewThemeId || (account && account.equippedTheme);
    if (!themeId) return "";
    const theme = getStore(STORAGE.cosmetics, []).find(c => idsMatch(c.id, themeId) && c.category === "themes");
    return theme && theme.image ? theme.image : "";
}

function applyTheme(area, imageUrl) {
    if (!area) return;
    if (imageUrl) {
        area.style.backgroundImage = `url("${String(imageUrl).replace(/"/g, "%22")}")`;
        area.style.backgroundSize = "cover";
        area.style.backgroundPosition = "center";
    } else {
        area.style.backgroundImage = ""; // back to the default stage background
        area.style.backgroundSize = "";
        area.style.backgroundPosition = "";
    }
}

/* =========================================
   ACCOUNT HELPERS FOR COSMETICS
========================================= */

function makeStaffAccount(username) {
    const role = username === "admin" ? "admin" : "designer";
    return {
        fullname: username === "admin" ? "Administrator" : "Designer",
        studentID: "staff-" + username,
        section: "Staff",
        email: username + "@cict.local",
        username,
        password: "",
        role,
        staff: true,
        status: "approved",
        points: 0,
        inventory: [],
        equipped: {},
        equippedTheme: null
    };
}

/** Admin and designer logins are not registered accounts, so create a wardrobe for them on demand. */
function ensurePlayableAccount(username) {
    const accounts = getStore(STORAGE.accounts, []);
    let account = accounts.find(u => u.username === username);
    if (account) return { accounts, account };
    if (!isStaffUsername(username)) return { accounts, account: null };

    account = makeStaffAccount(username);
    accounts.push(account);
    setStore(STORAGE.accounts, accounts);
    return { accounts, account };
}

function currentWardrobeAccount() {
    const username = getCurrentUsername();
    if (!username) return null;
    return findAccount(username) || (isStaffUsername(username) ? makeStaffAccount(username) : null);
}

function ownsCosmetic(account, cosmeticId) {
    return !!(account && (account.inventory || []).some(id => idsMatch(id, cosmeticId)));
}

function isCosmeticEquipped(account, cosmetic) {
    if (!account) return false;
    if (cosmetic.category === "themes") return !!account.equippedTheme && idsMatch(account.equippedTheme, cosmetic.id);
    return !!(account.equipped && account.equipped[cosmetic.category] !== undefined && idsMatch(account.equipped[cosmetic.category], cosmetic.id));
}

const SEASON_LABELS = { halloween: "Halloween", christmas: "Christmas", limited: "Limited edition" };

function seasonBadgeHTML(season) {
    return SEASON_LABELS[season] ? `<span class="season-badge season-${escapeAttr(season)}">${SEASON_LABELS[season]}</span>` : "";
}

function priceLabel(price) {
    const n = Number(price) || 0;
    return n === 0 ? "Free" : n + " pts";
}

/* =========================================
   COSMETICS DESIGNER
========================================= */

const cosmeticForm = document.getElementById("cosmeticForm");

/** Resizes uploads to the 300x400 stage. Themes are cropped to fill; items are centered. */
function normalizeCosmeticImage(file, category) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that image."));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("That file is not a readable PNG."));
            img.onload = () => {
                const W = 300, H = 400;
                const canvas = document.createElement("canvas");
                canvas.width = W;
                canvas.height = H;
                const ctx = canvas.getContext("2d");
                ctx.imageSmoothingQuality = "high";
                const scale = category === "themes"
                    ? Math.max(W / img.width, H / img.height)
                    : Math.min(W / img.width, H / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
                resolve({
                    dataUrl: canvas.toDataURL("image/png"),
                    resized: img.width !== W || img.height !== H,
                    original: img.width + " x " + img.height
                });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

if (cosmeticForm) {
    const fileInput = document.getElementById("cosmeticImage");
    const previewBox = document.getElementById("uploadPreview");

    if (fileInput && previewBox) {
        fileInput.addEventListener("change", async function () {
            previewBox.innerHTML = "";
            const file = this.files[0];
            if (!file) return;
            if (file.type !== "image/png") {
                previewBox.innerHTML = "<p class='form-note error-text'>Please choose a PNG image.</p>";
                return;
            }
            try {
                const category = document.getElementById("cosmeticCategory").value;
                const result = await normalizeCosmeticImage(file, category);
                previewBox.innerHTML = `
                    <img src="${escapeAttr(result.dataUrl)}" alt="Upload preview" class="upload-preview-img">
                    <p class="form-note">${result.resized
                        ? "Your image is " + escapeHtml(result.original) + " px and will be fitted to 300 x 400."
                        : "Image size is correct (300 x 400)."}</p>`;
            } catch (e) {
                previewBox.innerHTML = `<p class='form-note error-text'>${escapeHtml(e.message)}</p>`;
            }
        });
    }

    cosmeticForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const name = document.getElementById("cosmeticName").value.trim();
        const category = document.getElementById("cosmeticCategory").value;
        const price = Math.max(0, Math.floor(Number(document.getElementById("cosmeticPrice").value) || 0));
        const season = document.getElementById("cosmeticSeason").value;
        const imageFile = fileInput.files[0];

        if (!name || !category) return toast("Enter a name and choose a category.", "error");
        if (!imageFile) return toast("Choose a cosmetic image.", "error");
        if (imageFile.type !== "image/png") return toast("Only PNG images are supported.", "error");

        let result;
        try {
            result = await normalizeCosmeticImage(imageFile, category);
        } catch (e) {
            return toast(e.message, "error");
        }

        const cosmetics = getStore(STORAGE.cosmetics, []);
        cosmetics.push({ id: Date.now(), name, category, price, season, image: result.dataUrl });
        setStore(STORAGE.cosmetics, cosmetics);

        toast(name + " added to the shop.", "success");
        cosmeticForm.reset();
        if (previewBox) previewBox.innerHTML = "";
        loadDesignerCosmetics();
    });
}

function loadDesignerCosmetics() {
    const container = document.getElementById("designerCosmetics");
    if (!container) return;
    const cosmetics = getStore(STORAGE.cosmetics, []);
    container.innerHTML = "";
    if (cosmetics.length === 0) {
        container.innerHTML = "<p class='empty-state'>No cosmetics added yet.</p>";
        return;
    }
    cosmetics.slice().reverse().forEach(cosmetic => {
        const card = document.createElement("div");
        card.className = "admin-card designer-card" + (cosmetic.hidden ? " is-hidden" : "");
        card.innerHTML = `
            <div class="designer-thumb"><img class="zoomable" src="${escapeAttr(cosmetic.image)}" alt="${escapeAttr(cosmetic.name)}"></div>
            <h3>${escapeHtml(cosmetic.name)} ${cosmetic.hidden ? '<span class="status-badge rejected">Hidden</span>' : ""}</h3>
            <dl class="detail-list">
                <div><dt>Category</dt><dd>${escapeHtml(cosmetic.category)}</dd></div>
                <div><dt>Price</dt><dd>${priceLabel(cosmetic.price)}</dd></div>
                <div><dt>Season</dt><dd>${escapeHtml(cosmetic.season || "normal")}</dd></div>
            </dl>
            <div class="admin-actions">
                ${cosmetic.hidden
                    ? `<button type="button" class="btn-approve" ${act("restoreCosmetic", cosmetic.id)}>Restore to shop</button>`
                    : `<button type="button" class="btn-danger" ${act("deleteCosmetic", cosmetic.id)}>${cosmetic.builtin ? "Hide from shop" : "Delete"}</button>`}
            </div>`;
        container.appendChild(card);
    });
}

async function deleteCosmetic(cosmeticId) {
    const cosmetics = getStore(STORAGE.cosmetics, []);
    const cosmetic = cosmetics.find(c => idsMatch(c.id, cosmeticId));
    if (!cosmetic) return;

    if (cosmetic.builtin) {
        const ok = await confirmDialog(
            "Built-in items are hidden instead of deleted. People who already own it keep it.",
            { title: "Hide " + cosmetic.name + "?", confirmText: "Hide from shop", danger: true });
        if (!ok) return;
        cosmetic.hidden = true;
        setStore(STORAGE.cosmetics, cosmetics);
        toast(cosmetic.name + " is now hidden from the shop.", "success");
    } else {
        const ok = await confirmDialog(
            "This removes it from the shop and from everyone who owns or wears it. Points are not refunded.",
            { title: "Delete " + cosmetic.name + "?", confirmText: "Delete", danger: true });
        if (!ok) return;

        setStore(STORAGE.cosmetics, cosmetics.filter(c => !idsMatch(c.id, cosmeticId)));

        // Clean up so nobody is left with a missing item.
        const accounts = getStore(STORAGE.accounts, []);
        accounts.forEach(acc => {
            acc.inventory = (acc.inventory || []).filter(id => !idsMatch(id, cosmeticId));
            Object.keys(acc.equipped || {}).forEach(cat => {
                if (idsMatch(acc.equipped[cat], cosmeticId)) delete acc.equipped[cat];
            });
            if (acc.equippedTheme && idsMatch(acc.equippedTheme, cosmeticId)) acc.equippedTheme = null;
        });
        setStore(STORAGE.accounts, accounts);
        toast(cosmetic.name + " deleted.", "success");
    }
    loadDesignerCosmetics();
}

function restoreCosmetic(cosmeticId) {
    const cosmetics = getStore(STORAGE.cosmetics, []);
    const cosmetic = cosmetics.find(c => idsMatch(c.id, cosmeticId));
    if (!cosmetic) return;
    delete cosmetic.hidden;
    setStore(STORAGE.cosmetics, cosmetics);
    toast(cosmetic.name + " is back in the shop.", "success");
    loadDesignerCosmetics();
}

/* =========================================
   COSMETICS SHOP (with preview)
========================================= */

const shopState = { category: "hats", items: {}, theme: null };
const cosmeticsContainer = document.getElementById("cosmeticsContainer");
const categoryButtons = document.querySelectorAll(".category-button");

if (cosmeticsContainer) {
    categoryButtons.forEach(button => {
        button.addEventListener("click", function () {
            loadShopCosmetics(button.dataset.category);
        });
    });
}

function previewedCosmetics() {
    const cosmetics = getStore(STORAGE.cosmetics, []);
    const ids = Object.keys(shopState.items).map(cat => shopState.items[cat]);
    if (shopState.theme) ids.push(shopState.theme);
    return ids.map(id => cosmetics.find(c => idsMatch(c.id, id))).filter(Boolean);
}

function isPreviewing(cosmetic) {
    if (cosmetic.category === "themes") return !!shopState.theme && idsMatch(shopState.theme, cosmetic.id);
    return shopState.items[cosmetic.category] !== undefined && idsMatch(shopState.items[cosmetic.category], cosmetic.id);
}

function togglePreview(cosmeticId) {
    const cosmetic = getStore(STORAGE.cosmetics, []).find(c => idsMatch(c.id, cosmeticId));
    if (!cosmetic) return;

    if (isPreviewing(cosmetic)) {
        if (cosmetic.category === "themes") shopState.theme = null;
        else delete shopState.items[cosmetic.category];
    } else if (cosmetic.category === "themes") {
        shopState.theme = cosmetic.id;
    } else {
        shopState.items[cosmetic.category] = cosmetic.id;
    }
    refreshShopPreview();
    loadShopCosmetics(shopState.category);
}

function clearPreview() {
    shopState.items = {};
    shopState.theme = null;
    refreshShopPreview();
    loadShopCosmetics(shopState.category);
}

function renderPreviewBar() {
    const bar = document.getElementById("previewBar");
    if (!bar) return;

    const list = previewedCosmetics();
    if (list.length === 0) {
        bar.hidden = true;
        bar.innerHTML = "";
        return;
    }

    const account = currentWardrobeAccount();
    const staff = isStaffUsername(getCurrentUsername());
    const unowned = list.filter(c => !ownsCosmetic(account, c.id));
    const total = unowned.reduce((sum, c) => sum + (Number(c.price) || 0), 0);

    bar.hidden = false;
    bar.innerHTML = `
        <p class="preview-title">Trying on</p>
        <ul class="preview-chips">
            ${list.map(c => `
                <li>
                    <span>${escapeHtml(c.name)}${ownsCosmetic(account, c.id) ? " (owned)" : ""}</span>
                    <button type="button" aria-label="Stop previewing ${escapeAttr(c.name)}" ${act("togglePreview", c.id)}>&times;</button>
                </li>`).join("")}
        </ul>
        <div class="preview-actions">
            ${unowned.length
                ? `<button type="button" class="btn-primary" ${act("buyPreviewed")}>Buy ${unowned.length} ${unowned.length === 1 ? "item" : "items"}${staff ? "" : " for " + total + " pts"}</button>`
                : `<span class="form-note">You already own everything you're trying on.</span>`}
            <button type="button" class="btn-secondary" ${act("clearPreview")}>Clear preview</button>
        </div>`;
}

function refreshShopPreview() {
    const layers = document.getElementById("characterLayers");
    if (!layers) return;
    const stage = layers.parentElement;
    const area = stage ? stage.closest(".character-area") : null;
    const account = currentWardrobeAccount();

    applyLoadout(stage, layers, getLoadout(account, shopState.items));
    applyTheme(area, getThemeImage(account, shopState.theme));
    renderPreviewBar();
}

// Older names, kept so any markup calling them still works.
function loadCharacter() { refreshShopPreview(); }
function loadCharacterTheme() { refreshShopPreview(); }

function wardrobeActionHTML(account, cosmetic) {
    if (!ownsCosmetic(account, cosmetic.id)) {
        return `<button type="button" class="btn-primary" ${act("buyCosmetic", cosmetic.id)}>Buy</button>`;
    }
    const isTheme = cosmetic.category === "themes";
    if (isCosmeticEquipped(account, cosmetic)) {
        return `<button type="button" class="btn-secondary" ${act(isTheme ? "unequipTheme" : "unequipCosmetic", cosmetic.id)}>Unequip</button>`;
    }
    return `<button type="button" class="btn-primary" ${act(isTheme ? "equipTheme" : "equipCosmetic", cosmetic.id)}>Equip</button>`;
}

function loadShopCosmetics(category) {
    const container = document.getElementById("cosmeticsContainer");
    if (!container) return;
    category = category || shopState.category;
    shopState.category = category;

    document.querySelectorAll(".category-button").forEach(btn => {
        const active = btn.dataset.category === category;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const title = document.getElementById("categoryTitle");
    if (title) {
        title.textContent = category === "face" ? "Face" : category.charAt(0).toUpperCase() + category.slice(1);
    }

    const account = currentWardrobeAccount();
    const cosmetics = getStore(STORAGE.cosmetics, []).filter(c => !c.hidden);
    const list = category === "face"
        ? cosmetics.filter(c => FACE_CATEGORIES.includes(c.category))
        : cosmetics.filter(c => c.category === category);

    container.innerHTML = "";
    if (list.length === 0) {
        container.innerHTML = "<p class='empty-state'>Nothing in this category yet.</p>";
        return;
    }

    list.forEach(cosmetic => {
        const previewing = isPreviewing(cosmetic);
        const card = document.createElement("div");
        card.className = "cosmetic-card" + (previewing ? " is-previewing" : "");
        card.innerHTML = `
            <div class="cosmetic-thumb"><img class="zoomable" src="${escapeAttr(cosmetic.image)}" alt="${escapeAttr(cosmetic.name)}" title="Click to enlarge"></div>
            <h3>${escapeHtml(cosmetic.name)}</h3>
            <p class="cosmetic-meta">
                <span class="price">${priceLabel(cosmetic.price)}</span>
                ${category === "face" ? `<span class="chip">${escapeHtml(cosmetic.category)}</span>` : ""}
                ${seasonBadgeHTML(cosmetic.season)}
            </p>
            <div class="cosmetic-actions">
                <button type="button" class="btn-secondary${previewing ? " is-on" : ""}" aria-pressed="${previewing}" ${act("togglePreview", cosmetic.id)}>${previewing ? "Stop preview" : "Preview"}</button>
                ${wardrobeActionHTML(account, cosmetic)}
            </div>`;
        container.appendChild(card);
    });
}

function refreshWardrobe() {
    loadUserInfo();
    loadShopCosmetics(shopState.category);
    loadInventory();
    refreshShopPreview();
}

let purchaseInFlight = false;

async function purchaseItems(ids) {
    const username = getCurrentUsername();
    if (!username) {
        flash("Please log in first.", "error");
        return goTo("login1.html");
    }
    if (purchaseInFlight) return;
    purchaseInFlight = true;

    try {
        const staff = isStaffUsername(username);
        if (staff) ensurePlayableAccount(username);

        const cosmetics = getStore(STORAGE.cosmetics, []);
        let accounts = getStore(STORAGE.accounts, []);
        let account = accounts.find(u => u.username === username);
        if (!account) return toast("Account not found.", "error");

        const wanted = ids
            .map(id => cosmetics.find(c => idsMatch(c.id, id)))
            .filter(c => c && !ownsCosmetic(account, c.id));
        if (wanted.length === 0) return toast("You already own that.", "info");

        const total = wanted.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
        const points = Number(account.points) || 0;

        if (!staff && points < total) {
            return toast("Not enough points. You have " + points + " and this costs " + total + ". Posting on the forum earns points.", "error", 5500);
        }

        if (total > 0) {
            const names = wanted.map(c => c.name).join(", ");
            const left = staff ? "" : " You will have " + (points - total) + " points left.";
            const ok = await confirmDialog(names + " for " + total + " points." + left, { title: "Confirm purchase", confirmText: "Buy" });
            if (!ok) return;
        }

        // Read again after the dialog, in case anything changed while it was open.
        accounts = getStore(STORAGE.accounts, []);
        account = accounts.find(u => u.username === username);
        if (!account) return;
        if (!account.inventory) account.inventory = [];
        const stillWanted = wanted.filter(c => !ownsCosmetic(account, c.id));
        if (stillWanted.length === 0) return;
        const finalTotal = stillWanted.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
        if (!staff && (Number(account.points) || 0) < finalTotal) return toast("Not enough points.", "error");

        if (!staff) account.points = (Number(account.points) || 0) - finalTotal;
        stillWanted.forEach(c => account.inventory.push(c.id));
        setStore(STORAGE.accounts, accounts);

        stillWanted.forEach(c => {
            if (c.category === "themes") {
                if (shopState.theme && idsMatch(shopState.theme, c.id)) shopState.theme = null;
            } else if (shopState.items[c.category] !== undefined && idsMatch(shopState.items[c.category], c.id)) {
                delete shopState.items[c.category];
            }
        });

        toast(stillWanted.length === 1 ? stillWanted[0].name + " added to your inventory." : stillWanted.length + " items added to your inventory.", "success");
        refreshWardrobe();
    } finally {
        purchaseInFlight = false;
    }
}

function buyCosmetic(cosmeticId) { return purchaseItems([cosmeticId]); }
function buyTheme(themeId) { return purchaseItems([themeId]); }
function buyPreviewed() { return purchaseItems(previewedCosmetics().map(c => c.id)); }

/* =========================================
   INVENTORY / EQUIP
========================================= */

function loadInventory() {
    const container = document.getElementById("equippedItems");
    if (!container) return;

    const account = currentWardrobeAccount();
    if (!account) return;

    const cosmetics = getStore(STORAGE.cosmetics, []);
    container.innerHTML = "";

    const owned = (account.inventory || [])
        .map(id => cosmetics.find(c => idsMatch(c.id, id)))
        .filter(Boolean);

    if (owned.length === 0) {
        container.innerHTML = "<p class='empty-state'>You don't own any cosmetics yet. Preview items in the shop and buy the ones you like.</p>";
        return;
    }

    owned.forEach(cosmetic => {
        const equipped = isCosmeticEquipped(account, cosmetic);
        const card = document.createElement("div");
        card.className = "cosmetic-card" + (equipped ? " is-equipped" : "");
        card.innerHTML = `
            <div class="cosmetic-thumb"><img class="zoomable" src="${escapeAttr(cosmetic.image)}" alt="${escapeAttr(cosmetic.name)}"></div>
            <h3>${escapeHtml(cosmetic.name)}</h3>
            <p class="cosmetic-meta">
                <span class="chip">${cosmetic.category === "themes" ? "theme" : escapeHtml(cosmetic.category)}</span>
                ${equipped ? '<span class="chip chip-on">Equipped</span>' : ""}
            </p>
            <div class="cosmetic-actions">${wardrobeActionHTML(account, cosmetic)}</div>`;
        container.appendChild(card);
    });
}

function equipCosmetic(cosmeticId) {
    const username = getCurrentUsername();
    if (!username) {
        flash("Please log in first.", "error");
        return goTo("login1.html");
    }
    if (isStaffUsername(username)) ensurePlayableAccount(username);

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;

    const cosmetic = getStore(STORAGE.cosmetics, []).find(c => idsMatch(c.id, cosmeticId));
    if (!cosmetic) return toast("That item no longer exists.", "error");
    if (!ownsCosmetic(account, cosmetic.id)) return toast("You don't own this item yet.", "error");

    if (cosmetic.category === "themes") return equipTheme(cosmeticId);

    if (!account.equipped) account.equipped = {};
    account.equipped[cosmetic.category] = cosmetic.id;
    setStore(STORAGE.accounts, accounts);

    delete shopState.items[cosmetic.category]; // now worn for real, no need to preview it
    toast(cosmetic.name + " equipped.", "success");
    refreshWardrobe();
}

function unequipCosmetic(cosmeticId) {
    const username = getCurrentUsername();
    if (!username) return;

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    const cosmetic = getStore(STORAGE.cosmetics, []).find(c => idsMatch(c.id, cosmeticId));
    if (!account || !account.equipped || !cosmetic) return;

    if (!isCosmeticEquipped(account, cosmetic)) return toast("This item isn't equipped.", "info");

    delete account.equipped[cosmetic.category];
    setStore(STORAGE.accounts, accounts);
    toast(cosmetic.name + " removed.", "info");
    refreshWardrobe();
}

function equipTheme(themeId) {
    const username = getCurrentUsername();
    if (!username) {
        flash("Please log in first.", "error");
        return goTo("login1.html");
    }
    if (isStaffUsername(username)) ensurePlayableAccount(username);

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    if (!ownsCosmetic(account, themeId)) return toast("You don't own this theme yet.", "error");

    const theme = getStore(STORAGE.cosmetics, []).find(c => idsMatch(c.id, themeId) && c.category === "themes");
    if (!theme) return;

    account.equippedTheme = theme.id;
    setStore(STORAGE.accounts, accounts);
    if (shopState.theme && idsMatch(shopState.theme, theme.id)) shopState.theme = null;
    toast(theme.name + " theme equipped.", "success");
    refreshWardrobe();
}

function unequipTheme() {
    const username = getCurrentUsername();
    if (!username) return;
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.equippedTheme = null;
    setStore(STORAGE.accounts, accounts);
    toast("Theme removed.", "info");
    refreshWardrobe();
}

function applySiteTheme() {
    document.body.classList.add("theme-purple-orca");
}

/* =========================================
   USER PROFILE PAGE
========================================= */

function loadProfilePage() {
    const infoBox = document.getElementById("profileInfo");
    const postsBox = document.getElementById("profilePosts");
    if (!infoBox || !postsBox) return;

    const username = getQueryParam("user");
    if (!username) {
        infoBox.innerHTML = "<p class='empty-state'>No user selected.</p>";
        postsBox.innerHTML = "";
        return;
    }

    let account = findAccount(username);
    if (!account && isStaffUsername(username)) account = makeStaffAccount(username);

    if (!account) {
        infoBox.innerHTML = "<p class='empty-state'>User not found.</p>";
        postsBox.innerHTML = "";
        return;
    }

    const viewer = getCurrentUsername();
    const canSeePrivate = isAdminUser() || viewer === account.username;
    const staff = !!account.staff || account.role === "admin" || account.role === "designer";

    infoBox.innerHTML = `
        <h2 class="profile-name">${escapeHtml(account.fullname || account.username)} ${roleBadgeHTML(account.role || "student")}</h2>
        <p class="profile-username">@${escapeHtml(account.username)}</p>
        <div class="profile-meta">
            <div><span>Section / Dept</span><strong>${escapeHtml(account.section || "-")}</strong></div>
            ${canSeePrivate ? `<div><span>ID</span><strong>${escapeHtml(account.studentID || "-")}</strong></div>` : ""}
            <div><span>Points</span><strong>${staff ? "\u221E" : escapeHtml(Number(account.points) || 0)}</strong></div>
        </div>`;

    const title = document.getElementById("profilePostsTitle");
    if (title) title.textContent = account.fullname || account.username;

    renderProfileAvatar(account);

    const posts = getStore(STORAGE.posts, []);
    const userPosts = posts
        .filter(p => p.username === username && (p.status === "approved" || !p.status))
        // Anonymous posts stay anonymous: they never show up on the author's profile.
        .filter(p => !p.anonymous || viewer === username)
        .slice()
        .reverse();

    if (userPosts.length === 0) {
        postsBox.innerHTML = "<p class='empty-state'>This user has not posted anything yet.</p>";
        return;
    }
    appendPostsToContainer(postsBox, userPosts);
}

function renderProfileAvatar(account) {
    const themeArea = document.getElementById("profileThemeArea");
    const layersBox = document.getElementById("profileCharacterLayers");
    const stage = document.getElementById("profileCharacterStage");
    if (!themeArea || !layersBox || !stage) return;

    applyLoadout(stage, layersBox, getLoadout(account));
    applyTheme(themeArea, getThemeImage(account));
}
function svgDataUrl(svg) {
    // Base64 is more reliable than URL-encoded SVG for CSS/img in all browsers
    const clean = svg.trim().replace(/\s+/g, " ");
    try {
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(clean)));
    } catch (e) {
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(clean);
    }
}

function ensureStarterCosmetics() {
    let cosmetics = getStore(STORAGE.cosmetics, []);
    const existingIds = new Set(cosmetics.map(c => String(c.id)));

    // All art is 300×400, transparent, aligned to the base character stage.
    const starters = [
        // --- HATS (sit on head top ~ y 20–90) ---
        {
            id: "hat-red-cap",
            name: "Red Cap",
            category: "hats",
            price: 40,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M95 95 C95 55 205 55 205 95 L220 95 L220 110 L80 110 L80 95 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/>
                <ellipse cx="150" cy="95" rx="55" ry="18" fill="#b91c1c"/>
                <path d="M205 100 L245 108 L205 112 Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "hat-wizard",
            name: "Wizard Hat",
            category: "hats",
            price: 80,
            season: "limited",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M150 10 L210 105 L90 105 Z" fill="#4c1d95" stroke="#1e1b4b" stroke-width="3"/>
                <ellipse cx="150" cy="105" rx="70" ry="14" fill="#5b21b6" stroke="#1e1b4b" stroke-width="2"/>
                <circle cx="150" cy="55" r="8" fill="#fbbf24"/>
                <path d="M130 70 L140 85 L120 85 Z" fill="#fde68a"/>
            </svg>`)
        },
        {
            id: "hat-party",
            name: "Party Hat",
            category: "hats",
            price: 35,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M150 18 L195 100 L105 100 Z" fill="#f59e0b" stroke="#b45309" stroke-width="3"/>
                <circle cx="150" cy="18" r="8" fill="#ef4444"/>
                <path d="M120 70 L180 70" stroke="#fff" stroke-width="4" stroke-dasharray="6 4"/>
            </svg>`)
        },

        // --- EYES (on face ~ y 85–100) ---
        {
            id: "eyes-happy",
            name: "Happy Eyes",
            category: "eyes",
            price: 25,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <ellipse cx="120" cy="92" rx="12" ry="16" fill="#111827"/>
                <ellipse cx="180" cy="92" rx="12" ry="16" fill="#111827"/>
                <circle cx="124" cy="88" r="4" fill="#fff"/>
                <circle cx="184" cy="88" r="4" fill="#fff"/>
            </svg>`)
        },
        {
            id: "eyes-shades",
            name: "Cool Shades",
            category: "eyes",
            price: 55,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="100" y="82" width="40" height="24" rx="8" fill="#0f172a" stroke="#334155" stroke-width="2"/>
                <rect x="160" y="82" width="40" height="24" rx="8" fill="#0f172a" stroke="#334155" stroke-width="2"/>
                <path d="M140 92 H160" stroke="#334155" stroke-width="3"/>
                <path d="M100 90 H88" stroke="#334155" stroke-width="3"/>
                <path d="M200 90 H212" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },
        {
            id: "eyes-star",
            name: "Star Eyes",
            category: "eyes",
            price: 60,
            season: "limited",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <polygon points="120,78 124,88 135,88 126,95 129,106 120,99 111,106 114,95 105,88 116,88" fill="#fbbf24" stroke="#b45309" stroke-width="1"/>
                <polygon points="180,78 184,88 195,88 186,95 189,106 180,99 171,106 174,95 165,88 176,88" fill="#fbbf24" stroke="#b45309" stroke-width="1"/>
            </svg>`)
        },

        // --- MOUTH (lower face ~ y 130–155) ---
        {
            id: "mouth-smile",
            name: "Big Smile",
            category: "mouth",
            price: 20,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M125 140 Q150 165 175 140" fill="none" stroke="#7c2d12" stroke-width="5" stroke-linecap="round"/>
            </svg>`)
        },
        {
            id: "mouth-mustache",
            name: "Classic Mustache",
            category: "mouth",
            price: 45,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M110 138 C125 128 140 132 150 140 C160 132 175 128 190 138 C180 152 165 150 150 146 C135 150 120 152 110 138 Z" fill="#1c1917" stroke="#0c0a09" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "mouth-tongue",
            name: "Playful Tongue",
            category: "mouth",
            price: 30,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M128 138 Q150 158 172 138" fill="#7f1d1d" stroke="#450a0a" stroke-width="2"/>
                <ellipse cx="150" cy="155" rx="10" ry="14" fill="#f472b6" stroke="#9d174d" stroke-width="2"/>
            </svg>`)
        },

        // --- NOSE ---
        {
            id: "nose-round",
            name: "Round Nose",
            category: "nose",
            price: 15,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <ellipse cx="150" cy="120" rx="10" ry="12" fill="#e8a87c" stroke="#b45309" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "nose-button",
            name: "Button Nose",
            category: "nose",
            price: 15,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <circle cx="150" cy="118" r="8" fill="#fca5a5" stroke="#b91c1c" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "nose-clown",
            name: "Clown Nose",
            category: "nose",
            price: 25,
            season: "halloween",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <circle cx="150" cy="120" r="14" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>
                <circle cx="145" cy="115" r="4" fill="#fecaca"/>
            </svg>`)
        },

        // --- EARS ---
        {
            id: "ears-round",
            name: "Round Ears",
            category: "ears",
            price: 20,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <ellipse cx="78" cy="110" rx="14" ry="20" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
                <ellipse cx="222" cy="110" rx="14" ry="20" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },
        {
            id: "ears-pointy",
            name: "Pointy Ears",
            category: "ears",
            price: 35,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M85 130 L70 70 L95 115 Z" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
                <path d="M215 130 L230 70 L205 115 Z" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },
        {
            id: "ears-elf",
            name: "Elf Ears",
            category: "ears",
            price: 50,
            season: "limited",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M88 135 L55 55 L100 115 Z" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
                <path d="M212 135 L245 55 L200 115 Z" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },

        // --- EYEBROWS ---
        {
            id: "brows-thick",
            name: "Thick Brows",
            category: "eyebrows",
            price: 15,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M105 72 Q120 64 135 74" fill="none" stroke="#1c1917" stroke-width="5" stroke-linecap="round"/>
                <path d="M165 74 Q180 64 195 72" fill="none" stroke="#1c1917" stroke-width="5" stroke-linecap="round"/>
            </svg>`)
        },
        {
            id: "brows-surprised",
            name: "Surprised Brows",
            category: "eyebrows",
            price: 15,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M105 78 Q120 60 138 72" fill="none" stroke="#1c1917" stroke-width="4" stroke-linecap="round"/>
                <path d="M162 72 Q180 60 195 78" fill="none" stroke="#1c1917" stroke-width="4" stroke-linecap="round"/>
            </svg>`)
        },
        {
            id: "brows-angry",
            name: "Angry Brows",
            category: "eyebrows",
            price: 15,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M105 70 L138 80" fill="none" stroke="#1c1917" stroke-width="5" stroke-linecap="round"/>
                <path d="M195 70 L162 80" fill="none" stroke="#1c1917" stroke-width="5" stroke-linecap="round"/>
            </svg>`)
        },

        // --- EYELASHES ---
        {
            id: "lash-simple",
            name: "Simple Lashes",
            category: "eyelashes",
            price: 15,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M108 80 L104 72" stroke="#1c1917" stroke-width="2"/>
                <path d="M118 78 L118 70" stroke="#1c1917" stroke-width="2"/>
                <path d="M128 80 L132 72" stroke="#1c1917" stroke-width="2"/>
                <path d="M172 80 L168 72" stroke="#1c1917" stroke-width="2"/>
                <path d="M182 78 L182 70" stroke="#1c1917" stroke-width="2"/>
                <path d="M192 80 L196 72" stroke="#1c1917" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "lash-long",
            name: "Long Lashes",
            category: "eyelashes",
            price: 25,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M106 82 L98 68" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M118 78 L116 64" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M130 82 L136 68" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M170 82 L164 68" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M182 78 L184 64" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M194 82 L202 68" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/>
            </svg>`)
        },
        {
            id: "lash-sparkle",
            name: "Sparkle Lashes",
            category: "eyelashes",
            price: 40,
            season: "limited",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <path d="M108 80 L104 70" stroke="#7c3aed" stroke-width="2"/>
                <path d="M120 78 L120 66" stroke="#7c3aed" stroke-width="2"/>
                <path d="M132 80 L136 70" stroke="#7c3aed" stroke-width="2"/>
                <path d="M168 80 L164 70" stroke="#7c3aed" stroke-width="2"/>
                <path d="M180 78 L180 66" stroke="#7c3aed" stroke-width="2"/>
                <path d="M192 80 L196 70" stroke="#7c3aed" stroke-width="2"/>
                <circle cx="150" cy="70" r="3" fill="#fde68a"/>
            </svg>`)
        },

        // --- SKIN (head overlay tints) ---
        {
            id: "skin-light",
            tone: "#f8d7b0",
            name: "Light Skin",
            category: "skin",
            price: 10,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <circle cx="150" cy="106" r="70" fill="#f8d7b0" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },
        {
            id: "skin-tan",
            tone: "#d4a574",
            name: "Tan Skin",
            category: "skin",
            price: 10,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <circle cx="150" cy="106" r="70" fill="#d4a574" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },
        {
            id: "skin-deep",
            tone: "#8b5a2b",
            name: "Deep Skin",
            category: "skin",
            price: 10,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <circle cx="150" cy="106" r="70" fill="#8b5a2b" stroke="#334155" stroke-width="3"/>
            </svg>`)
        },

        // --- TOPS (body area ~ y 170–295) ---
        {
            id: "top-blue-shirt",
            name: "Blue Shirt",
            category: "tops",
            price: 40,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="95" y="170" width="110" height="125" rx="24" fill="#3b82f6" stroke="#1e3a8a" stroke-width="3"/>
                <path d="M140 170 L150 195 L160 170" fill="#93c5fd"/>
            </svg>`)
        },
        {
            id: "top-green-hoodie",
            name: "Green Hoodie",
            category: "tops",
            price: 55,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="95" y="170" width="110" height="125" rx="24" fill="#16a34a" stroke="#14532d" stroke-width="3"/>
                <path d="M110 170 Q150 210 190 170" fill="none" stroke="#15803d" stroke-width="8"/>
                <circle cx="150" cy="230" r="10" fill="#bbf7d0"/>
            </svg>`)
        },
        {
            id: "top-formal",
            name: "Formal Shirt",
            category: "tops",
            price: 70,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="95" y="170" width="110" height="125" rx="20" fill="#f8fafc" stroke="#334155" stroke-width="3"/>
                <path d="M150 170 V295" stroke="#94a3b8" stroke-width="2"/>
                <circle cx="150" cy="200" r="4" fill="#1e293b"/>
                <circle cx="150" cy="225" r="4" fill="#1e293b"/>
                <circle cx="150" cy="250" r="4" fill="#1e293b"/>
                <path d="M95 185 L70 230 L95 220 Z" fill="#1e3a8a"/>
                <path d="M205 185 L230 230 L205 220 Z" fill="#1e3a8a"/>
            </svg>`)
        },

        // --- PANTS ---
        {
            id: "pants-jeans",
            name: "Blue Jeans",
            category: "pants",
            price: 40,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="105" y="290" width="32" height="78" rx="10" fill="#2563eb" stroke="#1e3a8a" stroke-width="3"/>
                <rect x="163" y="290" width="32" height="78" rx="10" fill="#2563eb" stroke="#1e3a8a" stroke-width="3"/>
                <rect x="105" y="285" width="90" height="16" rx="6" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "pants-shorts",
            name: "Summer Shorts",
            category: "pants",
            price: 30,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="105" y="290" width="32" height="40" rx="10" fill="#f59e0b" stroke="#b45309" stroke-width="3"/>
                <rect x="163" y="290" width="32" height="40" rx="10" fill="#f59e0b" stroke="#b45309" stroke-width="3"/>
                <rect x="105" y="285" width="90" height="14" rx="6" fill="#d97706" stroke="#b45309" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "pants-purple",
            name: "Purple Pants",
            category: "pants",
            price: 45,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="105" y="290" width="32" height="78" rx="10" fill="#7c3aed" stroke="#4c1d95" stroke-width="3"/>
                <rect x="163" y="290" width="32" height="78" rx="10" fill="#7c3aed" stroke="#4c1d95" stroke-width="3"/>
                <rect x="105" y="285" width="90" height="16" rx="6" fill="#6d28d9" stroke="#4c1d95" stroke-width="2"/>
            </svg>`)
        },

        // --- SHOES ---
        {
            id: "shoes-sneakers",
            name: "Sneakers",
            category: "shoes",
            price: 35,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <ellipse cx="121" cy="372" rx="24" ry="12" fill="#f8fafc" stroke="#334155" stroke-width="3"/>
                <rect x="100" y="355" width="40" height="18" rx="6" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>
                <ellipse cx="179" cy="372" rx="24" ry="12" fill="#f8fafc" stroke="#334155" stroke-width="3"/>
                <rect x="160" y="355" width="40" height="18" rx="6" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>
            </svg>`)
        },
        {
            id: "shoes-boots",
            name: "Boots",
            category: "shoes",
            price: 50,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect x="102" y="340" width="38" height="40" rx="8" fill="#78350f" stroke="#451a03" stroke-width="3"/>
                <rect x="160" y="340" width="38" height="40" rx="8" fill="#78350f" stroke="#451a03" stroke-width="3"/>
            </svg>`)
        },
        {
            id: "shoes-sandals",
            name: "Sandals",
            category: "shoes",
            price: 25,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <ellipse cx="121" cy="372" rx="22" ry="10" fill="#fde68a" stroke="#b45309" stroke-width="2"/>
                <path d="M108 360 Q121 350 134 360" fill="none" stroke="#b45309" stroke-width="3"/>
                <ellipse cx="179" cy="372" rx="22" ry="10" fill="#fde68a" stroke="#b45309" stroke-width="2"/>
                <path d="M166 360 Q179 350 192 360" fill="none" stroke="#b45309" stroke-width="3"/>
            </svg>`)
        },

        // --- THEMES (full background) ---
        {
            id: "purple-orca-theme",
            name: "Purple Orca",
            category: "themes",
            price: 0,
            season: "limited",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <defs>
                    <linearGradient id="po" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#2e1065"/>
                        <stop offset="55%" stop-color="#6d28d9"/>
                        <stop offset="100%" stop-color="#1e1b4b"/>
                    </linearGradient>
                </defs>
                <rect width="300" height="400" fill="url(#po)"/>
                <ellipse cx="150" cy="250" rx="90" ry="40" fill="#0f172a" opacity="0.45"/>
                <circle cx="80" cy="80" r="10" fill="#ede9fe" opacity="0.35"/>
                <circle cx="230" cy="120" r="6" fill="#ede9fe" opacity="0.3"/>
            </svg>`)
        },
        {
            id: "theme-ocean",
            name: "Ocean Wave",
            category: "themes",
            price: 60,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <defs>
                    <linearGradient id="oc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#7dd3fc"/>
                        <stop offset="100%" stop-color="#0369a1"/>
                    </linearGradient>
                </defs>
                <rect width="300" height="400" fill="url(#oc)"/>
                <path d="M0 280 Q75 250 150 280 T300 280 V400 H0 Z" fill="#0ea5e9" opacity="0.7"/>
                <path d="M0 320 Q75 300 150 320 T300 320 V400 H0 Z" fill="#0284c7" opacity="0.8"/>
            </svg>`)
        },
        {
            id: "theme-sunset",
            name: "Sunset Glow",
            category: "themes",
            price: 60,
            season: "normal",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <defs>
                    <linearGradient id="su" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#fed7aa"/>
                        <stop offset="45%" stop-color="#fb7185"/>
                        <stop offset="100%" stop-color="#7c2d12"/>
                    </linearGradient>
                </defs>
                <rect width="300" height="400" fill="url(#su)"/>
                <circle cx="150" cy="160" r="40" fill="#fbbf24" opacity="0.9"/>
            </svg>`)
        },
        {
            id: "theme-midnight",
            name: "Midnight Sky",
            category: "themes",
            price: 70,
            season: "limited",
            image: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <rect width="300" height="400" fill="#0f172a"/>
                <circle cx="60" cy="60" r="2" fill="#fff"/>
                <circle cx="120" cy="90" r="1.5" fill="#fff"/>
                <circle cx="200" cy="50" r="2" fill="#fff"/>
                <circle cx="250" cy="120" r="1.5" fill="#fff"/>
                <circle cx="90" cy="160" r="1.5" fill="#fff"/>
                <circle cx="180" cy="140" r="2" fill="#fff"/>
                <circle cx="40" cy="200" r="1.5" fill="#fff"/>
                <circle cx="220" cy="200" r="2" fill="#fde68a"/>
            </svg>`)
        }
    ];

    let changed = false;
    starters.forEach(item => {
        const idx = cosmetics.findIndex(c => String(c.id) === String(item.id));
        if (idx === -1) {
            cosmetics.push(Object.assign({ builtin: true }, item));
            changed = true;
            return;
        }
        // Keep built-in art up to date, but never touch a "hidden" flag a designer set.
        const existing = cosmetics[idx];
        ["image", "name", "price", "category", "season", "tone"].forEach(key => {
            if (existing[key] !== item[key]) {
                existing[key] = item[key];
                changed = true;
            }
        });
        if (!existing.builtin) {
            existing.builtin = true;
            changed = true;
        }
    });

    // Only write (and sync to the shared database) when something actually changed.
    if (changed) {
        setStore(STORAGE.cosmetics, cosmetics);
    }
}

/* =========================================
   START
========================================= */

function renderAll() {
    loadAdminDashboard();
    loadUserInfo();
    refreshShopPreview();
    loadShopCosmetics(shopState.category);
    loadInventory();
    loadDesignerCosmetics();
    loadProfilePage();
    loadForum();
}

function markCurrentNav() {
    document.querySelectorAll("header nav a").forEach(a => {
        if ((a.getAttribute("href") || "").split("?")[0] === currentPage) a.classList.add("is-current");
    });
}

function addDbBadge() {
    const badgeHost = document.querySelector("header nav");
    if (!badgeHost || document.getElementById("dbStatusBadge")) return;
    const span = document.createElement("span");
    span.id = "dbStatusBadge";
    span.className = cloudEnabled ? "db-badge online" : "db-badge offline";
    span.textContent = cloudEnabled ? "Shared database" : "Local only";
    span.title = cloudEnabled
        ? "Connected to the shared database. Data syncs across devices."
        : "Server not reachable. Data stays in this browser only.";
    badgeHost.appendChild(span);
}

async function initApp() {
    if (accessBlocked) return;
    applySiteTheme();
    showFlash();

    // Show what is already cached on this device straight away...
    renderAll();

    // ...then bring in the shared database and refresh.
    await loadFromCloud();
    ensureStarterCosmetics();

    const username = getCurrentUsername();
    if (username && isStaffUsername(username) && document.getElementById("cosmeticsContainer")) {
        ensurePlayableAccount(username);
    }

    renderAll();
    addDbBadge();
    markCurrentNav();
    enforcePasswordChange();
}

initApp();
