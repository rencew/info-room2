/* =========================================
   CICT CODE FORUM (v1 numbered files)
   Shared database via server API when available.
   Falls back to localStorage if server is offline.
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
const API_BASE = "https://info-room2.onrender.com";

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
   PAGE ACCESS PROTECTION
========================================= */

const currentPage = window.location.pathname.split("/").pop() || "index1.html";
const userRole = localStorage.getItem(STORAGE.userRole);

if (currentPage === "admin1.html") {
    if (userRole !== "admin") {
        alert("Access denied. Admins only.");
        window.location.href = "login1.html";
    }
}

if (currentPage === "designer1.html") {
    if (userRole !== "admin" && userRole !== "designer") {
        alert("Access denied. Designers only.");
        window.location.href = "login1.html";
    }
}

if (currentPage === "forum1.html" || currentPage === "cosmetics1.html" || currentPage === "profile1.html") {
    if (!["student", "teacher", "admin", "designer"].includes(userRole)) {
        alert("Please login first.");
        window.location.href = "login1.html";
    }
}

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
                if (coeLabel) coeLabel.textContent = "Faculty / Employee ID Photo";
                if (coeNote) coeNote.textContent = "Upload a clear photo of your Faculty or Employee ID for admin verification.";
            } else {
                if (idLabel) idLabel.textContent = "Student ID Number";
                if (sectionLabel) sectionLabel.textContent = "Section";
                if (coeLabel) coeLabel.textContent = "Certificate of Enrollment";
                if (coeNote) coeNote.textContent = "Upload a clear photo of your Certificate of Enrollment for admin verification.";
            }
        });
    }

    signupForm.addEventListener("submit", function (event) {
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

        if (!role) {
            alert("Please select whether you are a Student or Teacher.");
            return;
        }

        if (password !== confirmPassword) {
            alert("Passwords do not match!");
            return;
        }

        if (!coeFile) {
            alert("Please upload your verification document.");
            return;
        }

        let accounts = getStore(STORAGE.accounts, []);

        if (accounts.some(a => a.username === username)) {
            alert("Username already exists!");
            return;
        }

        if (accounts.some(a => a.studentID === studentID)) {
            alert("ID already exists!");
            return;
        }

        const reader = new FileReader();
        reader.onload = function () {
            accounts.push({
                fullname,
                studentID,
                section,
                email,
                username,
                password,
                role,
                status: "pending",
                coe: reader.result,
                points: 200,
                inventory: [],
                equipped: {},
                equippedTheme: null
            });
            setStore(STORAGE.accounts, accounts);
            alert("Registration submitted! Please wait for admin approval.");
            signupForm.reset();
            window.location.href = "login1.html";
        };
        reader.readAsDataURL(coeFile);
    });
}

/* =========================================
   LOGIN
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
            alert("Admin login successful!");
            window.location.href = "admin1.html";
            return;
        }

        if (username === "designer" && password === "Designer@123") {
            localStorage.setItem(STORAGE.loggedInUser, "designer");
            localStorage.setItem(STORAGE.userRole, "designer");
            alert("Designer login successful!");
            window.location.href = "designer1.html";
            return;
        }

        const accounts = getStore(STORAGE.accounts, []);
        const account = accounts.find(u => u.username === username && u.password === password);

        if (!account) {
            alert("Incorrect username or password.");
            return;
        }

        if (account.status === "pending") {
            alert("Your account is still waiting for admin approval.");
            return;
        }

        if (account.status === "rejected") {
            alert("Your registration was rejected by the admin.");
            return;
        }

        if (account.status === "approved") {
            localStorage.setItem(STORAGE.loggedInUser, account.username);
            localStorage.setItem(STORAGE.userRole, account.role || "student");
            alert("Login successful!");
            window.location.href = "forum1.html";
        }
    });
}

/* =========================================
   ADMIN DASHBOARD
========================================= */

function loadAdminDashboard() {
    const pendingContainer = document.getElementById("pendingAccounts");
    const approvedContainer = document.getElementById("approvedAccounts");
    const postsContainer = document.getElementById("adminPosts");
    const pendingPostsContainer = document.getElementById("pendingPosts");
    const reportedContainer = document.getElementById("reportedPosts");

    if (!pendingContainer && !approvedContainer && !postsContainer && !pendingPostsContainer && !reportedContainer) return;

    const accounts = getStore(STORAGE.accounts, []);

    if (pendingContainer) {
        pendingContainer.innerHTML = "";
        const pendingAccounts = accounts.filter(a => a.status === "pending");

        if (pendingAccounts.length === 0) {
            pendingContainer.innerHTML = "<p class='empty-state'>No pending registrations.</p>";
        } else {
            pendingAccounts.forEach(account => {
                const box = document.createElement("div");
                box.className = "admin-card";
                const roleBadge = account.role === "teacher"
                    ? '<span class="role-badge teacher">🎓 Teacher</span>'
                    : '<span class="role-badge student">Student</span>';
                box.innerHTML = `
                    <h3>${escapeHtml(account.fullname)} ${roleBadge}</h3>
                    <p><strong>ID:</strong> ${escapeHtml(account.studentID)}</p>
                    <p><strong>Section/Dept:</strong> ${escapeHtml(account.section)}</p>
                    <p><strong>Email:</strong> ${escapeHtml(account.email)}</p>
                    <p><strong>Username:</strong> ${escapeHtml(account.username)}</p>
                    <img src="${account.coe}" alt="Verification Document" style="max-width:300px; width:100%; border-radius:8px;">
                    <div class="admin-actions">
                        <button class="btn-approve" onclick="approveAccount('${escapeAttr(account.username)}')">Approve</button>
                        <button class="btn-reject" onclick="rejectAccount('${escapeAttr(account.username)}')">Reject</button>
                    </div>
                `;
                pendingContainer.appendChild(box);
            });
        }
    }

    if (approvedContainer) {
        approvedContainer.innerHTML = "";
        const approvedAccounts = accounts.filter(a => a.status === "approved");

        if (approvedAccounts.length === 0) {
            approvedContainer.innerHTML = "<p class='empty-state'>No approved accounts.</p>";
        } else {
            approvedAccounts.forEach(account => {
                const box = document.createElement("div");
                box.className = "admin-card";
                const roleBadge = account.role === "teacher"
                    ? '<span class="role-badge teacher">🎓 Teacher</span>'
                    : '<span class="role-badge student">Student</span>';
                box.innerHTML = `
                    <h3>${escapeHtml(account.fullname)} ${roleBadge}</h3>
                    <p>ID: ${escapeHtml(account.studentID)}</p>
                    <p>Section/Dept: ${escapeHtml(account.section)}</p>
                    <p>Username: ${escapeHtml(account.username)}</p>
                    <p>Points: ${account.points || 0}</p>
                    <button class="btn-danger" onclick="deleteAccount('${escapeAttr(account.username)}')">Delete Account</button>
                `;
                approvedContainer.appendChild(box);
            });
        }
    }

    if (pendingPostsContainer) loadPendingPosts();
    if (postsContainer) loadAdminPosts();
    if (reportedContainer) loadReportedPosts();
}

function approveAccount(username) {
    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.status = "approved";
    setStore(STORAGE.accounts, accounts);
    alert("Account approved!");
    loadAdminDashboard();
}

function rejectAccount(username) {
    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.status = "rejected";
    setStore(STORAGE.accounts, accounts);
    alert("Account rejected!");
    loadAdminDashboard();
}

function deleteAccount(username) {
    if (!confirm("Are you sure you want to delete this account?")) return;
    let accounts = getStore(STORAGE.accounts, []);
    accounts = accounts.filter(a => a.username !== username);
    setStore(STORAGE.accounts, accounts);

    let posts = getStore(STORAGE.posts, []);
    posts = posts.filter(p => p.username !== username);
    setStore(STORAGE.posts, posts);

    alert("Account deleted!");
    loadAdminDashboard();
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
    loadForum();

    postForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const content = document.getElementById("postContent").value.trim();
        const anonymous = document.getElementById("anonymousPost").checked;
        const mediaFile = document.getElementById("postMedia")?.files[0];

        if (!content && !mediaFile) {
            alert("Please write something or attach a file.");
            return;
        }

        const username = localStorage.getItem(STORAGE.loggedInUser);
        if (!username) {
            alert("Please login first.");
            window.location.href = "login1.html";
            return;
        }

        const role = localStorage.getItem(STORAGE.userRole) || "student";
        const postStatus = (role === "teacher" || role === "admin" || role === "designer") ? "approved" : "pending";

        const createPost = (mediaData = null, mediaType = null, mediaName = null) => {
            let posts = getStore(STORAGE.posts, []);
            posts.push({
                id: Date.now(),
                username,
                content: content || "",
                anonymous,
                reactions: 0,
                points: 3,
                date: new Date().toLocaleString(),
                status: postStatus,
                comments: [],
                media: mediaData,
                mediaType,
                mediaName
            });
            setStore(STORAGE.posts, posts);

            if (postStatus === "approved") addPoints(username, 3);

            postForm.reset();
            const nameEl = document.getElementById("mediaFileName");
            if (nameEl) nameEl.textContent = "";

            if (postStatus === "pending") {
                alert("Your post has been submitted and is awaiting admin approval.");
            } else {
                alert("Post published!");
            }

            loadForum();
            if (typeof loadPendingPosts === "function") loadPendingPosts();
            if (typeof loadAdminPosts === "function") loadAdminPosts();
        };

        if (mediaFile) {
            if (mediaFile.size > 4 * 1024 * 1024) {
                alert("File is too large. Please keep under 4MB for this demo.");
                return;
            }
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
   LOAD FORUM
========================================= */

function buildPostCard(post, accounts, currentUser) {
    const postCard = document.createElement("div");
    postCard.className = "post";
    postCard.dataset.postId = post.id;

    const authorAccount = accounts.find(a => a.username === post.username);
    const author = post.anonymous ? "Anonymous" : post.username;
    const authorBadge = getAuthorBadgeHTML(post, authorAccount);
    const mediaHTML = renderMedia(post);
    const canReport = currentUser && post.username !== currentUser;
    const authorHTML = post.anonymous
        ? `<strong>${escapeHtml(author)}</strong>`
        : `<a class="author-link" href="profile1.html?user=${encodeURIComponent(post.username)}"><strong>${escapeHtml(author)}</strong></a>`;

    postCard.innerHTML = `
        <div class="speech-bubble">
            ${authorHTML} ${authorBadge}
            <p>${escapeHtml(post.content)}</p>
            ${mediaHTML}
            <small class="post-date">${post.date || ""}</small>
        </div>
        <div class="post-character">${createCharacter(post.username)}</div>
        <div class="post-actions">
            <button type="button" onclick="reactToPost(${post.id})">❤️ ${post.reactions || 0}</button>
            <button type="button" onclick="toggleComments(${post.id})">💬 Comments (${(post.comments || []).length})</button>
            ${canReport ? `<button type="button" class="btn-report" onclick="reportPost(${post.id})">🚩 Report</button>` : ""}
            ${post.username === currentUser ? `<button type="button" class="btn-danger" onclick="deletePost(${post.id})">Delete</button>` : ""}
        </div>
        <div class="comments-section" id="comments-${post.id}" style="display:none;">
            <div class="comments-list" id="comments-list-${post.id}"></div>
            <div class="comment-form">
                <textarea id="comment-input-${post.id}" placeholder="Write a comment..." maxlength="500"></textarea>
                <button type="button" onclick="addComment(${post.id})">Add Comment</button>
            </div>
        </div>
    `;
    return postCard;
}

function appendPostsToContainer(container, postsList) {
    const currentUser = localStorage.getItem(STORAGE.loggedInUser);
    const accounts = getStore(STORAGE.accounts, []);
    container.innerHTML = "";

    if (!postsList.length) {
        return false;
    }

    postsList.forEach(post => {
        const postCard = buildPostCard(post, accounts, currentUser);
        container.appendChild(postCard);
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
        container.innerHTML = "<p class='empty-state'>No posts yet. Be the first to share something! 💬</p>";
        return;
    }

    appendPostsToContainer(container, approvedPosts.slice().reverse());
}

function refreshPostViews() {
    loadForum();
    // Reload profile posts if on profile page (keeps likes/comments/report in sync)
    if (document.getElementById("profilePosts")) {
        loadProfilePage();
    }
}

function getAuthorBadgeHTML(post, account) {
    if (post.anonymous) return "";
    if (!account) {
        if (post.username === "admin") return '<span class="role-badge admin">Admin</span>';
        if (post.username === "designer") return '<span class="role-badge designer">Designer</span>';
        return "";
    }
    if (account.role === "teacher") {
        return '<span class="role-badge teacher">🎓 Teacher</span>';
    }
    return '<span class="role-badge student">Student</span>';
}

/* =========================================
   REPORT POSTS
========================================= */

function reportPost(postId) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        return;
    }

    const reason = prompt("Why are you reporting this post?\n(spam, harassment, inappropriate, other)");
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (!cleanReason) {
        alert("Please enter a reason.");
        return;
    }

    let reports = getStore(STORAGE.reports, []);
    const already = reports.some(r =>
        r.postId === postId &&
        r.reportedBy === username &&
        r.status === "open"
    );
    if (already) {
        alert("You already reported this post.");
        return;
    }

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => p.id === postId);
    if (!post) {
        alert("Post not found.");
        return;
    }

    reports.push({
        id: Date.now(),
        postId,
        postContent: post.content,
        postAuthor: post.username,
        reportedBy: username,
        reason: cleanReason,
        date: new Date().toLocaleString(),
        status: "open"
    });
    setStore(STORAGE.reports, reports);
    alert("Report submitted. An admin will review it.");
}

function loadReportedPosts() {
    const container = document.getElementById("reportedPosts");
    if (!container) return;

    const reports = getStore(STORAGE.reports, []);
    const openReports = reports.filter(r => r.status === "open");
    container.innerHTML = "";

    if (openReports.length === 0) {
        container.innerHTML = "<p class='empty-state'>No reported posts.</p>";
        return;
    }

    openReports.slice().reverse().forEach(report => {
        const box = document.createElement("div");
        box.className = "admin-card report-card";
        box.innerHTML = `
            <p><strong>Post:</strong> ${escapeHtml(report.postContent || "(empty)")}</p>
            <p><strong>Author:</strong> ${escapeHtml(report.postAuthor)}</p>
            <p><strong>Reported by:</strong> ${escapeHtml(report.reportedBy)}</p>
            <p><strong>Reason:</strong> ${escapeHtml(report.reason)}</p>
            <p><strong>Date:</strong> ${escapeHtml(report.date || "")}</p>
            <div class="admin-actions">
                <button class="btn-danger" onclick="resolveReport(${report.id}, true)">Delete Post & Resolve</button>
                <button class="btn-approve" onclick="resolveReport(${report.id}, false)">Dismiss Report</button>
            </div>
        `;
        container.appendChild(box);
    });
}

function resolveReport(reportId, deletePostToo) {
    let reports = getStore(STORAGE.reports, []);
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    if (deletePostToo) {
        if (!confirm("Delete the reported post and close this report?")) return;
        let posts = getStore(STORAGE.posts, []);
        posts = posts.filter(p => p.id !== report.postId);
        setStore(STORAGE.posts, posts);
    } else {
        if (!confirm("Dismiss this report?")) return;
    }

    report.status = deletePostToo ? "removed" : "dismissed";
    setStore(STORAGE.reports, reports);
    alert(deletePostToo ? "Post deleted and report closed." : "Report dismissed.");
    loadReportedPosts();
    loadAdminPosts();
    loadForum();
}

function renderMedia(post) {
    if (!post.media) return "";
    if (post.mediaType === "image") {
        return `<div class="post-media"><img src="${post.media}" alt="Attached image" class="post-image"></div>`;
    }
    if (post.mediaType === "video") {
        return `<div class="post-media"><video controls class="post-video" src="${post.media}"></video></div>`;
    }
    return `<div class="post-media file-attachment">
        <a href="${post.media}" download="${escapeAttr(post.mediaName || "file")}" class="file-link">
            📄 ${escapeHtml(post.mediaName || "Download file")}
        </a>
    </div>`;
}

/* =========================================
   COMMENTS (threaded replies)
========================================= */

function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    section.style.display = section.style.display === "none" ? "block" : "none";
}

function countAllComments(comments) {
    return (comments || []).length;
}

function getReplies(comments, parentId) {
    return (comments || []).filter(c => {
        if (parentId === null || parentId === undefined) {
            return c.parentId === null || c.parentId === undefined;
        }
        return String(c.parentId) === String(parentId);
    });
}

function buildCommentNode(postId, comment, allComments, depth) {
    const maxDepth = 4;
    const replies = getReplies(allComments, comment.id);
    const wrapper = document.createElement("div");
    wrapper.className = "comment-thread" + (depth > 0 ? " is-reply" : "");
    wrapper.dataset.commentId = comment.id;

    const replyToLabel = comment.replyToAuthor
        ? `<span class="reply-to">↳ @${escapeHtml(comment.replyToAuthor)}</span>`
        : "";

    wrapper.innerHTML = `
        <div class="comment" style="margin-left:${Math.min(depth, maxDepth) * 18}px">
            <div class="comment-header">
                <strong>${escapeHtml(comment.author)}</strong>
                ${replyToLabel}
                <span class="comment-date">${comment.date || ""}</span>
            </div>
            <p>${escapeHtml(comment.text)}</p>
            <div class="comment-actions">
                <button type="button" class="comment-reply-btn" onclick="toggleReplyForm(${postId}, ${comment.id}, '${escapeAttr(comment.author)}')">
                    Reply
                </button>
            </div>
            <div class="reply-form" id="reply-form-${postId}-${comment.id}" style="display:none;">
                <textarea id="reply-input-${postId}-${comment.id}" placeholder="Reply to ${escapeAttr(comment.author)}..." maxlength="500"></textarea>
                <div class="reply-form-actions">
                    <button type="button" onclick="addComment(${postId}, ${comment.id}, '${escapeAttr(comment.author)}')">Post Reply</button>
                    <button type="button" class="btn-cancel" onclick="toggleReplyForm(${postId}, ${comment.id})">Cancel</button>
                </div>
            </div>
        </div>
    `;

    const repliesBox = document.createElement("div");
    repliesBox.className = "comment-replies";
    replies.forEach(reply => {
        repliesBox.appendChild(buildCommentNode(postId, reply, allComments, depth + 1));
    });
    wrapper.appendChild(repliesBox);
    return wrapper;
}

function renderComments(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;

    const posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const comments = post.comments || [];
    list.innerHTML = "";

    if (comments.length === 0) {
        list.innerHTML = "<p class='empty-state small'>No comments yet. Start the conversation!</p>";
        updateCommentCountButton(postId, 0);
        return;
    }

    const roots = getReplies(comments, null);
    roots.forEach(c => {
        list.appendChild(buildCommentNode(postId, c, comments, 0));
    });

    // Orphan replies (parent missing) still show at top level
    const shownIds = new Set();
    function markShown(nodes) {
        nodes.forEach(n => {
            shownIds.add(String(n.id));
            getReplies(comments, n.id).forEach(r => markShown([r]));
        });
    }
    markShown(roots);
    comments.forEach(c => {
        if (!shownIds.has(String(c.id))) {
            list.appendChild(buildCommentNode(postId, c, comments, 0));
        }
    });

    updateCommentCountButton(postId, countAllComments(comments));
}

function updateCommentCountButton(postId, count) {
    const actionBtns = document.querySelectorAll(`.post[data-post-id="${postId}"] .post-actions button`);
    actionBtns.forEach(b => {
        if (b.textContent.includes("Comments")) {
            b.textContent = `💬 Comments (${count})`;
        }
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
    if (!text) {
        alert(isReply ? "Please write a reply." : "Please write a comment.");
        return;
    }

    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        return;
    }

    let posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => p.id === postId);
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

    if (isReply) {
        const form = document.getElementById(`reply-form-${postId}-${parentId}`);
        if (form) form.style.display = "none";
    }

    renderComments(postId);
}

function reactToPost(postID) {
    let posts = getStore(STORAGE.posts, []);
    const post = posts.find(item => item.id === postID);
    if (!post) return;
    post.reactions = (post.reactions || 0) + 1;
    setStore(STORAGE.posts, posts);
    refreshPostViews();
}

function deletePost(postID) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    let posts = getStore(STORAGE.posts, []);
    const post = posts.find(item => item.id === postID);
    if (!post) return;

    if (post.username !== username && localStorage.getItem(STORAGE.userRole) !== "admin") {
        alert("You can only delete your own post.");
        return;
    }

    if (!confirm("Delete this post?")) return;
    posts = posts.filter(item => item.id !== postID);
    setStore(STORAGE.posts, posts);
    refreshPostViews();
    if (typeof loadAdminPosts === "function") loadAdminPosts();
    if (typeof loadPendingPosts === "function") loadPendingPosts();
}

/* =========================================
   ADMIN POST MANAGEMENT
========================================= */

function loadPendingPosts() {
    const container = document.getElementById("pendingPosts");
    if (!container) return;

    const posts = getStore(STORAGE.posts, []);
    const pending = posts.filter(p => p.status === "pending");
    container.innerHTML = "";

    if (pending.length === 0) {
        container.innerHTML = "<p class='empty-state'>No pending posts.</p>";
        return;
    }

    const accounts = getStore(STORAGE.accounts, []);

    pending.slice().reverse().forEach(post => {
        const account = accounts.find(u => u.username === post.username);
        const box = document.createElement("div");
        box.className = "admin-card";
        box.innerHTML = `
            <p><strong>Post:</strong> ${escapeHtml(post.content)}</p>
            ${renderMedia(post)}
            <p><strong>Posted by:</strong> ${account ? escapeHtml(account.fullname) : escapeHtml(post.username)}</p>
            <p><strong>Username:</strong> ${escapeHtml(post.username)}</p>
            <p><strong>Anonymous:</strong> ${post.anonymous ? "Yes" : "No"}</p>
            <p><strong>Date:</strong> ${post.date || ""}</p>
            <div class="admin-actions">
                <button class="btn-approve" onclick="approvePost(${post.id})">Approve</button>
                <button class="btn-reject" onclick="rejectPost(${post.id})">Reject</button>
            </div>
        `;
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
        const box = document.createElement("div");
        box.className = "admin-card";
        const statusBadge = post.status === "pending" ? '<span class="status-badge pending">Pending</span>' :
                            post.status === "rejected" ? '<span class="status-badge rejected">Rejected</span>' :
                            '<span class="status-badge approved">Approved</span>';
        box.innerHTML = `
            <p><strong>Post:</strong> ${escapeHtml(post.content)} ${statusBadge}</p>
            ${renderMedia(post)}
            <p><strong>Posted by:</strong> ${account ? escapeHtml(account.fullname) : escapeHtml(post.username)}</p>
            <p><strong>Username:</strong> ${escapeHtml(post.username)}</p>
            <p><strong>Anonymous:</strong> ${post.anonymous ? "Yes" : "No"}</p>
            <p><strong>Reactions:</strong> ${post.reactions || 0}</p>
            <p><strong>Comments:</strong> ${(post.comments || []).length}</p>
            <button class="btn-danger" onclick="adminDeletePost(${post.id})">Delete Post</button>
        `;
        container.appendChild(box);
    });
}

function approvePost(postID) {
    let posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => p.id === postID);
    if (!post) return;
    post.status = "approved";
    setStore(STORAGE.posts, posts);
    addPoints(post.username, 3);
    alert("Post approved!");
    loadPendingPosts();
    loadAdminPosts();
    loadForum();
}

function rejectPost(postID) {
    if (!confirm("Reject this post?")) return;
    let posts = getStore(STORAGE.posts, []);
    const post = posts.find(p => p.id === postID);
    if (!post) return;
    post.status = "rejected";
    setStore(STORAGE.posts, posts);
    alert("Post rejected.");
    loadPendingPosts();
    loadAdminPosts();
}

function adminDeletePost(postID) {
    if (!confirm("Are you sure you want to delete this post?")) return;
    let posts = getStore(STORAGE.posts, []);
    posts = posts.filter(p => p.id !== postID);
    setStore(STORAGE.posts, posts);
    loadAdminPosts();
    loadPendingPosts();
    loadForum();
}

/* =========================================
   POINTS & USER INFO
========================================= */

function addPoints(username, amount) {
    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;
    account.points = (account.points || 0) + amount;
    setStore(STORAGE.accounts, accounts);
}

function loadUserInfo() {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) return;

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);

    if (username === "admin" || username === "designer") {
        const currentUser = document.getElementById("currentUser");
        const userPoints = document.getElementById("userPoints");
        const badge = document.getElementById("userRoleBadge");
        if (currentUser) currentUser.textContent = username;
        if (userPoints) userPoints.textContent = "∞";
        if (badge) {
            badge.textContent = username === "admin" ? "Admin" : "Designer";
            badge.className = "role-badge " + (username === "admin" ? "admin" : "designer");
        }
        return;
    }

    if (!account) return;

    const currentUser = document.getElementById("currentUser");
    const userPoints = document.getElementById("userPoints");
    const shopPoints = document.getElementById("shopPoints");
    const badge = document.getElementById("userRoleBadge");

    if (currentUser) currentUser.textContent = account.fullname;
    if (userPoints) userPoints.textContent = account.points || 0;
    if (shopPoints) shopPoints.textContent = account.points || 0;
    if (badge) {
        if (account.role === "teacher") {
            badge.textContent = "🎓 Teacher";
            badge.className = "role-badge teacher";
        } else {
            badge.textContent = "Student";
            badge.className = "role-badge student";
        }
    }
}

/* =========================================
   CLEAR TEST DATA
========================================= */

const clearDataButton = document.getElementById("clearDataButton");
if (clearDataButton) {
    clearDataButton.addEventListener("click", function () {
        if (!confirm("This will delete ALL accounts, posts, and cosmetics for this version only. Continue?")) return;
        localStorage.removeItem(STORAGE.accounts);
        localStorage.removeItem(STORAGE.posts);
        localStorage.removeItem(STORAGE.cosmetics);
        localStorage.removeItem(STORAGE.loggedInUser);
        localStorage.removeItem(STORAGE.userRole);
        localStorage.removeItem(STORAGE.reports);
        alert("All test data has been cleared!");
        loadAdminDashboard();
    });
}

/* =========================================
   COSMETICS DESIGNER
========================================= */

const cosmeticForm = document.getElementById("cosmeticForm");
if (cosmeticForm) {
    loadDesignerCosmetics();
    cosmeticForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const name = document.getElementById("cosmeticName").value.trim();
        const category = document.getElementById("cosmeticCategory").value;
        const price = Number(document.getElementById("cosmeticPrice").value);
        const season = document.getElementById("cosmeticSeason").value;
        const imageFile = document.getElementById("cosmeticImage").files[0];

        if (!imageFile) {
            alert("Please select a cosmetic image.");
            return;
        }
        if (imageFile.type !== "image/png") {
            alert("Please upload a PNG image only.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function () {
            let cosmetics = getStore(STORAGE.cosmetics, []);
            cosmetics.push({
                id: Date.now(),
                name,
                category,
                price,
                season,
                image: reader.result
            });
            setStore(STORAGE.cosmetics, cosmetics);
            alert("Cosmetic added successfully! 🎨");
            cosmeticForm.reset();
            loadDesignerCosmetics();
        };
        reader.readAsDataURL(imageFile);
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
        card.className = "admin-card";
        card.innerHTML = `
            <h3>${escapeHtml(cosmetic.name)}</h3>
            <p><strong>Category:</strong> ${escapeHtml(cosmetic.category)}</p>
            <p><strong>Price:</strong> ${cosmetic.price} points</p>
            <p><strong>Season:</strong> ${escapeHtml(cosmetic.season)}</p>
            <img src="${cosmetic.image}" alt="${escapeAttr(cosmetic.name)}" style="width:150px;height:200px;object-fit:contain;">
            <br>
            <button class="btn-danger" onclick='deleteCosmetic(${JSON.stringify(cosmetic.id)})'>Delete Cosmetic</button>
        `;
        container.appendChild(card);
    });
}

function deleteCosmetic(cosmeticID) {
    if (!confirm("Are you sure you want to delete this cosmetic?")) return;
    let cosmetics = getStore(STORAGE.cosmetics, []);
    cosmetics = cosmetics.filter(c => c.id !== cosmeticID);
    setStore(STORAGE.cosmetics, cosmetics);
    alert("Cosmetic deleted!");
    loadDesignerCosmetics();
}

/* =========================================
   COSMETICS SHOP
========================================= */

const cosmeticsContainer = document.getElementById("cosmeticsContainer");
const categoryButtons = document.querySelectorAll(".category-button");

if (cosmeticsContainer) {
    loadShopCosmetics("hats");
    categoryButtons.forEach(button => {
        button.addEventListener("click", function () {
            loadShopCosmetics(button.dataset.category);
        });
    });
}

function loadShopCosmetics(category) {
    const container = document.getElementById("cosmeticsContainer");
    const title = document.getElementById("categoryTitle");
    if (!container) return;

    const cosmetics = getStore(STORAGE.cosmetics, []);
    container.innerHTML = "";

    if (title) {
        title.textContent = category === "face" ? "Face Cosmetics" :
            category.charAt(0).toUpperCase() + category.slice(1) + " Cosmetics";
    }

    let filteredCosmetics;
    if (category === "face") {
        const faceCategories = ["eyes", "mouth", "nose", "ears", "eyebrows", "eyelashes", "skin"];
        filteredCosmetics = cosmetics.filter(c => faceCategories.includes(c.category));
    } else {
        filteredCosmetics = cosmetics.filter(c => c.category === category);
    }

    if (filteredCosmetics.length === 0) {
        container.innerHTML = "<p class='empty-state'>No cosmetics available in this category yet.</p>";
        return;
    }

    filteredCosmetics.forEach(cosmetic => {
        const card = document.createElement("div");
        card.className = "cosmetic-card";
        const buttonHTML = cosmetic.category === "themes"
            ? `<button type="button" onclick='buyTheme(${JSON.stringify(cosmetic.id)})'>Buy Theme</button>`
            : `<button type="button" onclick='buyCosmetic(${JSON.stringify(cosmetic.id)})'>Buy</button>`;
        card.innerHTML = `
            <img src="${cosmetic.image}" alt="${escapeAttr(cosmetic.name)}">
            <h3>${escapeHtml(cosmetic.name)}</h3>
            <p>${cosmetic.price} points</p>
            <p>${escapeHtml(cosmetic.season)}</p>
            ${buttonHTML}
        `;
        container.appendChild(card);
    });
}

function ensurePlayableAccount(username) {
    let accounts = getStore(STORAGE.accounts, []);
    let account = accounts.find(u => u.username === username);
    if (account) return { accounts, account };

    // Special demo logins (admin/designer) are not registered accounts —
    // create a playable profile so shop / equip works.
    const role = localStorage.getItem(STORAGE.userRole) || "student";
    account = {
        fullname: username === "admin" ? "Administrator" : username === "designer" ? "Designer" : username,
        studentID: "demo-" + username,
        section: "Staff",
        email: username + "@cict.local",
        username: username,
        password: "",
        role: role,
        status: "approved",
        points: 9999,
        inventory: [],
        equipped: {},
        equippedTheme: null
    };
    accounts.push(account);
    setStore(STORAGE.accounts, accounts);
    return { accounts, account };
}


function applyCosmeticImage(layerEl, imageUrl) {
    if (!layerEl || !imageUrl) return;
    layerEl.style.backgroundImage = "";
    layerEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.draggable = false;
    img.className = "cosmetic-layer-img";
    layerEl.appendChild(img);
}

function idsMatch(a, b) {
    return String(a) === String(b);
}

function buyCosmetic(cosmeticID) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        window.location.href = "login1.html";
        return;
    }

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const cosmetic = cosmetics.find(item => idsMatch(item.id, cosmeticID));
    if (!cosmetic) {
        alert("Cosmetic not found. Try refreshing the page.");
        return;
    }

    let { accounts, account } = ensurePlayableAccount(username);
    // re-find in case array was replaced
    accounts = getStore(STORAGE.accounts, []);
    account = accounts.find(u => u.username === username);
    if (!account) {
        alert("Account not found.");
        return;
    }

    if (!account.inventory) account.inventory = [];
    if (account.inventory.some(id => idsMatch(id, cosmeticID))) {
        alert("You already own this cosmetic!");
        return;
    }

    const points = Number(account.points) || 0;
    const price = Number(cosmetic.price) || 0;
    if (points < price) {
        alert("You don't have enough points! You have " + points + " points, but this costs " + price + ".\n\nTip: post on the forum (after approval) to earn points, or use admin login for testing.");
        return;
    }

    if (price > 0 && !confirm("Buy " + cosmetic.name + " for " + price + " points?")) return;

    account.points = points - price;
    account.inventory.push(cosmetic.id);
    setStore(STORAGE.accounts, accounts);

    alert(cosmetic.name + " added to your inventory! 🎉");
    loadUserInfo();
    const cat = ["eyes","mouth","nose","ears","eyebrows","eyelashes","skin"].includes(cosmetic.category) ? "face" : cosmetic.category;
    loadShopCosmetics(cat);
    loadInventory();
}

/* =========================================
   CHARACTER / EQUIP / INVENTORY / THEMES
========================================= */

function loadCharacter() {
    const layersContainer = document.getElementById("characterLayers");
    if (!layersContainer) return;

    const characterRoot = layersContainer.parentElement; // .character
    if (characterRoot) {
        let base = characterRoot.querySelector(".character-base");
        if (!base) {
            characterRoot.insertAdjacentHTML("afterbegin", getBaseCharacterHTML());
        } else if (!base.querySelector(".char-figure")) {
            base.innerHTML = `
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
                </div>
            `;
        }
        characterRoot.classList.remove("has-mouth-cosmetic", "has-eyes-cosmetic");
    }

    layersContainer.innerHTML = "";

    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) return;

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account || !account.equipped) return;

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const order = ["skin", "ears", "eyes", "eyebrows", "eyelashes", "nose", "mouth", "tops", "pants", "shoes", "hats"];
    Object.keys(account.equipped)
        .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
        .forEach(category => {
            const cosmeticID = account.equipped[category];
            const cosmetic = cosmetics.find(item => item.id === cosmeticID);
            if (!cosmetic || !cosmetic.image) return;
            const layer = document.createElement("div");
            layer.className = "character-layer layer-" + category;
            applyCosmeticImage(layer, cosmetic.image);
            layersContainer.appendChild(layer);

            if (characterRoot) {
                if (category === "mouth") characterRoot.classList.add("has-mouth-cosmetic");
                if (category === "eyes") characterRoot.classList.add("has-eyes-cosmetic");
            }
        });
}

function equipCosmetic(cosmeticID) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        return;
    }

    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;

    if (!account.inventory) account.inventory = [];
    if (!account.inventory || !account.inventory.some(id => idsMatch(id, cosmeticID))) {
        alert("You don't own this cosmetic.");
        return;
    }

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const cosmetic = cosmetics.find(item => idsMatch(item.id, cosmeticID));
    if (!cosmetic) return;

    if (!account.equipped) account.equipped = {};
    account.equipped[cosmetic.category] = cosmeticID;
    setStore(STORAGE.accounts, accounts);

    alert(`${cosmetic.name} equipped! 🎨`);
    loadCharacter();
    loadInventory();
    loadUserInfo();
}

function loadInventory() {
    const container = document.getElementById("equippedItems");
    if (!container) return;

    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) return;

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;

    const cosmetics = getStore(STORAGE.cosmetics, []);
    container.innerHTML = "";

    if (!account.inventory || account.inventory.length === 0) {
        container.innerHTML = "<p class='empty-state'>You don't own any cosmetics yet.</p>";
        return;
    }

    account.inventory.forEach(cosmeticID => {
        const cosmetic = cosmetics.find(item => item.id === cosmeticID);
        if (!cosmetic) return;

        const card = document.createElement("div");
        card.className = "cosmetic-card";

        if (cosmetic.category === "themes") {
            const isEquipped = account.equippedTheme === cosmetic.id;
            card.innerHTML = `
                <img src="${cosmetic.image}" alt="${escapeAttr(cosmetic.name)}">
                <h3>${escapeHtml(cosmetic.name)}</h3>
                <p>🌎 Theme</p>
                ${isEquipped
                    ? `<strong>🌎 Equipped</strong>
                       <button type="button" class="btn-unequip" onclick="unequipTheme()">Unequip</button>`
                    : `<button type="button" onclick='equipTheme(${JSON.stringify(cosmetic.id)})'>Equip Theme</button>`}
            `;
        } else {
            const isEquipped = account.equipped && account.equipped[cosmetic.category] === cosmetic.id;
            card.innerHTML = `
                <img src="${cosmetic.image}" alt="${escapeAttr(cosmetic.name)}">
                <h3>${escapeHtml(cosmetic.name)}</h3>
                <p>${escapeHtml(cosmetic.category)}</p>
                ${isEquipped
                    ? `<strong>✅ Equipped</strong>
                       <button type="button" class="btn-unequip" onclick='unequipCosmetic(${JSON.stringify(cosmetic.id)})'>Unequip</button>`
                    : `<button type="button" onclick='equipCosmetic(${JSON.stringify(cosmetic.id)})'>Equip</button>`}
            `;
        }
        container.appendChild(card);
    });
}


function unequipCosmetic(cosmeticID) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        return;
    }

    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account || !account.equipped) return;

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const cosmetic = cosmetics.find(item => item.id === cosmeticID);
    if (!cosmetic) return;

    if (account.equipped[cosmetic.category] !== cosmeticID) {
        alert("This cosmetic is not equipped.");
        return;
    }

    delete account.equipped[cosmetic.category];
    setStore(STORAGE.accounts, accounts);
    alert(`${cosmetic.name} unequipped.`);
    loadCharacter();
    loadInventory();
    loadUserInfo();
}

function unequipTheme() {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        return;
    }

    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;

    account.equippedTheme = null;
    setStore(STORAGE.accounts, accounts);
    alert("Theme unequipped.");
    loadCharacterTheme();
    loadInventory();
}

function equipTheme(themeID) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        window.location.href = "login1.html";
        return;
    }

    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) return;

    if (!account.inventory) account.inventory = [];
    if (!account.inventory.includes(themeID)) {
        alert("You don't own this theme.");
        return;
    }

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const theme = cosmetics.find(item => item.id === themeID && item.category === "themes");
    if (!theme) return;

    account.equippedTheme = themeID;
    setStore(STORAGE.accounts, accounts);
    alert(`${theme.name} equipped! 🌎`);
    loadCharacterTheme();
    loadInventory();
}

function loadCharacterTheme() {
    const characterArea = document.querySelector(".character-area");
    if (!characterArea) return;

    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) return;

    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account || !account.equippedTheme) {
        characterArea.style.backgroundImage = "none";
        return;
    }

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const theme = cosmetics.find(item => item.id === account.equippedTheme && item.category === "themes");
    if (!theme) return;

    characterArea.style.backgroundImage = `url('${theme.image}')`;
}

function buyTheme(themeID) {
    const username = localStorage.getItem(STORAGE.loggedInUser);
    if (!username) {
        alert("Please login first.");
        window.location.href = "login1.html";
        return;
    }

    ensurePlayableAccount(username);
    let accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    if (!account) {
        alert("Account not found.");
        return;
    }

    const cosmetics = getStore(STORAGE.cosmetics, []);
    const theme = cosmetics.find(item => idsMatch(item.id, themeID) && item.category === "themes");
    if (!theme) {
        alert("Theme not found. Try refreshing the page.");
        return;
    }

    if (!account.inventory) account.inventory = [];
    if (account.inventory.some(id => idsMatch(id, themeID))) {
        alert("You already own this theme!");
        return;
    }

    const points = Number(account.points) || 0;
    const price = Number(theme.price) || 0;
    if (points < price) {
        alert("You don't have enough points! You have " + points + " points, but this costs " + price + ".");
        return;
    }

    if (price > 0 && !confirm("Buy " + theme.name + " for " + price + " points?")) return;

    account.points = points - price;
    account.inventory.push(theme.id);
    setStore(STORAGE.accounts, accounts);

    alert(theme.name + " added to your inventory! 🌎");
    loadUserInfo();
    loadInventory();
    loadShopCosmetics("themes");
}

/* =========================================
   LOGOUT
========================================= */

function logoutUser() {
    localStorage.removeItem(STORAGE.loggedInUser);
    localStorage.removeItem(STORAGE.userRole);
    alert("You have been logged out.");
    window.location.href = "index1.html";
}

/* =========================================
   CHARACTER RENDERER (fixed base figure)
========================================= */

function getBaseCharacterHTML() {
    return `
        <div class="character-layer character-base">
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
            </div>
        </div>
    `;
}

function createCharacter(username) {
    const accounts = getStore(STORAGE.accounts, []);
    const account = accounts.find(u => u.username === username);
    const cosmetics = getStore(STORAGE.cosmetics, []);
    let layersHTML = "";
    const extraClasses = [];

    if (account && account.equipped) {
        const order = ["skin", "ears", "eyes", "eyebrows", "eyelashes", "nose", "mouth", "tops", "pants", "shoes", "hats"];
        const keys = Object.keys(account.equipped).sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        keys.forEach(category => {
            const cosmeticID = account.equipped[category];
            const cosmetic = cosmetics.find(item => item.id === cosmeticID);
            if (!cosmetic || !cosmetic.image) return;
            layersHTML += `<div class="character-layer layer-${category}"><img class="cosmetic-layer-img" src="${cosmetic.image}" alt="" draggable="false"></div>`;
            if (category === "mouth") extraClasses.push("has-mouth-cosmetic");
            if (category === "eyes") extraClasses.push("has-eyes-cosmetic");
        });
    }

    const cls = ["forum-character-body"].concat(extraClasses).join(" ");
    return `
        <div class="forum-character">
            <div class="${cls}">
                ${getBaseCharacterHTML()}
                ${layersHTML}
            </div>
        </div>
    `;
}

/* =========================================
   STARTER COSMETICS (300×400 transparent layers)
========================================= */

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

    let changed = 0;
    starters.forEach(item => {
        const idx = cosmetics.findIndex(c => String(c.id) === String(item.id));
        if (idx === -1) {
            cosmetics.push(item);
            changed += 1;
        } else {
            // Refresh built-in art (fixes older broken SVG data-urls)
            cosmetics[idx].image = item.image;
            cosmetics[idx].name = item.name;
            cosmetics[idx].price = item.price;
            cosmetics[idx].category = item.category;
            cosmetics[idx].season = item.season;
            changed += 1;
        }
    });

    if (changed > 0) {
        setStore(STORAGE.cosmetics, cosmetics);
    }
}

function applySiteTheme() {
    document.body.classList.add("theme-purple-orca");
}


/* =========================================
   USER PROFILE PAGE
========================================= */

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

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

    const accounts = getStore(STORAGE.accounts, []);
    let account = accounts.find(u => u.username === username);

    // Demo staff profiles
    if (!account && (username === "admin" || username === "designer")) {
        account = {
            fullname: username === "admin" ? "Administrator" : "Designer",
            username: username,
            role: username,
            section: "Staff",
            studentID: "—",
            points: "∞",
            status: "approved",
            equipped: {},
            equippedTheme: null
        };
    }

    if (!account) {
        infoBox.innerHTML = "<p class='empty-state'>User not found.</p>";
        postsBox.innerHTML = "";
        return;
    }

    const role = account.role || "student";
    const roleBadge =
        role === "teacher" ? '<span class="role-badge teacher">🎓 Teacher</span>' :
        role === "admin" ? '<span class="role-badge admin">Admin</span>' :
        role === "designer" ? '<span class="role-badge designer">Designer</span>' :
        '<span class="role-badge student">Student</span>';

    infoBox.innerHTML = `
        <h2 class="profile-name">${escapeHtml(account.fullname || account.username)} ${roleBadge}</h2>
        <p class="profile-username">@${escapeHtml(account.username)}</p>
        <div class="profile-meta">
            <div><span>Section / Dept</span><strong>${escapeHtml(account.section || "—")}</strong></div>
            <div><span>ID</span><strong>${escapeHtml(String(account.studentID || "—"))}</strong></div>
            <div><span>Points</span><strong>${escapeHtml(String(account.points ?? 0))}</strong></div>
            <div><span>Status</span><strong>${escapeHtml(account.status || "—")}</strong></div>
        </div>
    `;

    const title = document.getElementById("profilePostsTitle");
    if (title) title.textContent = account.fullname || account.username;

    // Avatar + theme
    renderProfileAvatar(account);

    // Posts
    const posts = getStore(STORAGE.posts, []);
    const userPosts = posts
        .filter(p => p.username === username && (p.status === "approved" || !p.status))
        .slice()
        .reverse();

    if (userPosts.length === 0) {
        postsBox.innerHTML = "<p class='empty-state'>This user has not posted anything yet.</p>";
        return;
    }

    // Same interactive cards as the main forum (likes, comments, threads, report, delete)
    appendPostsToContainer(postsBox, userPosts);
}

function renderProfileAvatar(account) {
    const themeArea = document.getElementById("profileThemeArea");
    const layersBox = document.getElementById("profileCharacterLayers");
    const stage = document.getElementById("profileCharacterStage");
    if (!themeArea || !layersBox || !stage) return;

    // Base figure
    let base = stage.querySelector(".character-base");
    if (!base) {
        stage.insertAdjacentHTML("afterbegin", getBaseCharacterHTML());
        base = stage.querySelector(".character-base");
    } else if (!base.querySelector(".char-figure")) {
        base.outerHTML = getBaseCharacterHTML();
    }

    stage.classList.remove("has-mouth-cosmetic", "has-eyes-cosmetic");
    layersBox.innerHTML = "";

    const cosmetics = getStore(STORAGE.cosmetics, []);

    // Theme background
    themeArea.style.backgroundImage = "none";
    if (account.equippedTheme) {
        const theme = cosmetics.find(c => idsMatch(c.id, account.equippedTheme) && c.category === "themes");
        if (theme && theme.image) {
            themeArea.style.backgroundImage = `url("${theme.image}")`;
            themeArea.style.backgroundSize = "cover";
            themeArea.style.backgroundPosition = "center";
        }
    }

    if (!account.equipped) return;

    const order = ["skin", "ears", "eyes", "eyebrows", "eyelashes", "nose", "mouth", "tops", "pants", "shoes", "hats"];
    Object.keys(account.equipped)
        .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
        .forEach(category => {
            const cosmeticID = account.equipped[category];
            const cosmetic = cosmetics.find(item => idsMatch(item.id, cosmeticID));
            if (!cosmetic || !cosmetic.image) return;
            const layer = document.createElement("div");
            layer.className = "character-layer layer-" + category;
            applyCosmeticImage(layer, cosmetic.image);
            layersBox.appendChild(layer);
            if (category === "mouth") stage.classList.add("has-mouth-cosmetic");
            if (category === "eyes") stage.classList.add("has-eyes-cosmetic");
        });
}


/* =========================================
   UTILS
========================================= */

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text || "")
        .replace(/&/g, "&" + "amp;")
        .replace(/"/g, "&" + "quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&" + "lt;")
        .replace(/>/g, "&" + "gt;");
}

/* =========================================
   START
========================================= */

async function initApp() {
    applySiteTheme();
    await loadFromCloud();
    ensureStarterCosmetics();
    if (document.getElementById("cosmeticsContainer")) {
        loadShopCosmetics("hats");
    }
    loadAdminDashboard();
    loadUserInfo();
    loadCharacter();
    loadInventory();
    loadCharacterTheme();
    loadProfilePage();
    loadForum();

    // Show small status on forum/shop if cloud connected
    const badgeHost = document.querySelector("header nav");
    if (badgeHost && !document.getElementById("dbStatusBadge")) {
        const span = document.createElement("span");
        span.id = "dbStatusBadge";
        span.className = cloudEnabled ? "db-badge online" : "db-badge offline";
        span.textContent = cloudEnabled ? "DB: Shared" : "DB: Local only";
        span.title = cloudEnabled
            ? "Connected to shared database — data syncs across devices"
            : "Server not found — data stays in this browser only. Run the Node server to enable sharing.";
        badgeHost.appendChild(span);
    }
}

initApp();
