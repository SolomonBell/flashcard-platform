import {
  createUser,
  signInWithPassword,
  sendPasswordResetEmail,
  updatePassword,
  isPendingPasswordReset,
  signInWithGoogle,
} from "./authStore.js";

// ── Bouncing background items ─────────────────────────────────────────────────

const _BOUNCE_ITEMS = [
  { type: "img",  src: "assets/downtown-school-seattle-logo.png", alt: "Downtown School Seattle", url: "https://www.downtownschoolseattle.org/", h: 72 },
  { type: "img",  src: "assets/lakeside-logo-1.png",              alt: "Lakeside School",         url: "https://www.lakesideschool.org/",        h: 72 },
  { type: "img",  src: "assets/lakeside-logo-2.png",              alt: "Lakeside School",         url: "https://www.lakesideschool.org/",        h: 72 },
  { type: "tile", url: "https://solomonbell.com" },
];
const _SPEED = 120;  // px / second

let _bounceStop     = null;  // cancels the running animation
let _bounceObserver = null;  // MutationObserver for auto-cleanup on login

const _BASE_CSS =
  "position:fixed;z-index:0;pointer-events:none;display:block;" +
  "opacity:0.28;transition:opacity 0.2s,transform 0.18s;user-select:none;";

function _buildItemEl(cfg) {
  const anchor = document.createElement("a");
  anchor.href     = cfg.url;
  anchor.target   = "_blank";
  anchor.rel      = "noopener noreferrer";
  anchor.tabIndex = -1;

  if (cfg.type === "img") {
    anchor.style.cssText = _BASE_CSS;
    const img = document.createElement("img");
    img.src       = cfg.src;
    img.alt       = cfg.alt;
    img.draggable = false;
    img.style.cssText = `height:${cfg.h}px;width:auto;display:block;`;
    anchor.appendChild(img);
  } else {
    // Promo tile
    anchor.style.cssText =
      _BASE_CSS +
      "width:110px;height:104px;border-radius:12px;box-sizing:border-box;" +
      "background:#2563eb;box-shadow:inset 0 1px 0 rgba(255,255,255,0.15),0 1px 4px rgba(0,0,0,0.2);" +
      "display:flex;align-items:center;justify-content:center;" +
      "padding:10px 14px;text-align:center;text-decoration:none;";
    anchor.innerHTML =
      `<span style="color:#fff;font-size:13px;font-weight:700;line-height:1.4;pointer-events:none;">Want Your<br>Logo Here?</span>`;
  }

  document.body.appendChild(anchor);
  return anchor;
}

function _startBouncingLogo(appEl) {
  // Cancel previous animation + observer before creating new ones
  if (_bounceStop)     { _bounceStop();               _bounceStop     = null; }
  if (_bounceObserver) { _bounceObserver.disconnect(); _bounceObserver = null; }

  // Lift the header above the bouncing items
  const header = document.querySelector(".header");
  if (header) header.style.zIndex = "10";

  // Build one state object per item
  const items = _BOUNCE_ITEMS.map((cfg, i) => {
    // Start at 45° offset so no item begins with purely horizontal or vertical motion.
    // With 4 items spaced 90° apart starting at 45°, all angles are 45/135/225/315°,
    // giving every item a non-zero vx and vy from the first frame.
    const angle = (i / _BOUNCE_ITEMS.length) * Math.PI * 2 + Math.PI / 4;
    const speed = _SPEED * (0.8 + i * 0.1);   // slightly varied speeds
    return {
      el:    _buildItemEl(cfg),
      x: 0, y: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.7,
      ready: false,
    };
  });

  let paused  = true;
  let running = true;
  let lastTs  = null;
  let rafId   = null;

  function getTopBound() {
    return header ? header.getBoundingClientRect().bottom + 4 : 0;
  }

  function initItem(item) {
    const lw = item.el.offsetWidth  || 120;
    const lh = item.el.offsetHeight || 72;
    const top = getTopBound();
    item.x = Math.random() * Math.max(1, window.innerWidth  - lw);
    item.y = top + Math.random() * Math.max(1, window.innerHeight - top - lh);
    item.el.style.left = `${item.x}px`;
    item.el.style.top  = `${item.y}px`;
    item.ready = true;
  }

  function tick(ts) {
    if (!running) return;
    if (lastTs === null) { lastTs = ts; rafId = requestAnimationFrame(tick); return; }

    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    if (!paused) {
      const top = getTopBound();

      // 1. Move each item and resolve wall collisions
      for (const item of items) {
        if (!item.ready) continue;
        const lw = item.el.offsetWidth  || 120;
        const lh = item.el.offsetHeight || 72;

        item.x += item.vx * dt;
        item.y += item.vy * dt;

        if (item.x <= 0)                       { item.x = 0;                       item.vx =  Math.abs(item.vx); }
        if (item.x + lw >= window.innerWidth)  { item.x = window.innerWidth  - lw; item.vx = -Math.abs(item.vx); }
        if (item.y <= top)                     { item.y = top;                     item.vy =  Math.abs(item.vy); }
        if (item.y + lh >= window.innerHeight) { item.y = window.innerHeight - lh; item.vy = -Math.abs(item.vy); }
      }

      // 2. Resolve item-to-item AABB collisions (equal-mass elastic: swap velocity on collision axis)
      for (let i = 0; i < items.length - 1; i++) {
        const a = items[i];
        if (!a.ready) continue;
        const aw = a.el.offsetWidth || 120, ah = a.el.offsetHeight || 72;
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          if (!b.ready) continue;
          const bw = b.el.offsetWidth || 120, bh = b.el.offsetHeight || 72;

          const overlapX = (aw / 2 + bw / 2) - Math.abs((a.x + aw / 2) - (b.x + bw / 2));
          const overlapY = (ah / 2 + bh / 2) - Math.abs((a.y + ah / 2) - (b.y + bh / 2));

          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              // Separate horizontally, swap vx
              const sep = overlapX / 2;
              if (a.x + aw / 2 < b.x + bw / 2) { a.x -= sep; b.x += sep; } else { a.x += sep; b.x -= sep; }
              [a.vx, b.vx] = [b.vx, a.vx];
            } else {
              // Separate vertically, swap vy
              const sep = overlapY / 2;
              if (a.y + ah / 2 < b.y + bh / 2) { a.y -= sep; b.y += sep; } else { a.y += sep; b.y -= sep; }
              [a.vy, b.vy] = [b.vy, a.vy];
            }
          }
        }
      }

      // 3. Commit positions to DOM
      for (const item of items) {
        if (!item.ready) continue;
        item.el.style.left = `${item.x}px`;
        item.el.style.top  = `${item.y}px`;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  // Initialize each item (images wait for load; tile waits one rAF for layout)
  for (const item of items) {
    const img = item.el.querySelector("img");
    if (img) {
      if (img.complete && img.naturalWidth) {
        initItem(item);
      } else {
        img.addEventListener("load",  () => initItem(item),                          { once: true });
        img.addEventListener("error", () => { item.el.remove(); item.ready = false; }, { once: true });
      }
    } else {
      requestAnimationFrame(() => initItem(item));
    }
  }

  rafId = requestAnimationFrame(tick);

  // Pause/resume all items together based on cursor position over the auth card
  const card = appEl.querySelector(".card");
  if (card) {
    card.addEventListener("mouseenter", () => {
      paused = false;
      for (const item of items) {
        item.el.style.pointerEvents = "none";
        item.el.style.opacity       = "0.28";
        item.el.style.transform     = "";
      }
    });
    card.addEventListener("mouseleave", () => {
      paused = true;
      for (const item of items) {
        item.el.style.pointerEvents = "auto";
        item.el.style.opacity       = "0.55";
      }
    });
  }

  // Hover scale on each item when paused and clickable
  for (const item of items) {
    item.el.addEventListener("mouseenter", () => {
      if (paused) item.el.style.transform = "scale(1.08)";
    });
    item.el.addEventListener("mouseleave", () => {
      item.el.style.transform = "";
    });
  }

  // Cleanup
  _bounceStop = () => {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    for (const item of items) item.el.remove();
    if (header) header.style.zIndex = "";
  };

  // Auto-cleanup when main.js replaces the auth content on successful login
  _bounceObserver = new MutationObserver(() => {
    if (!appEl.querySelector(".card")) {
      if (_bounceStop) { _bounceStop(); _bounceStop = null; }
      _bounceObserver.disconnect();
      _bounceObserver = null;
    }
  });
  _bounceObserver.observe(appEl, { childList: true });
}

/** Renders a password input wrapped with a show/hide toggle button. */
function passwordFieldHtml(id, label, placeholder = "") {
  return `
    <label class="label" for="${id}">${label}</label>
    <div style="position:relative; margin-bottom:12px;">
      <input type="password" id="${id}" name="${id}" required
        placeholder="${placeholder}"
        style="width:100%; box-sizing:border-box; padding-right:72px;" />
      <button type="button" data-toggle-pw="${id}"
        style="position:absolute; right:8px; top:50%; transform:translateY(-50%);
               background:none; border:none; cursor:pointer; font-size:13px;
               color:var(--muted, #666); padding:4px 6px; border-radius:4px;"
        aria-label="Show password">Show</button>
    </div>`;
}

function wirePasswordToggles(appEl) {
  appEl.querySelectorAll("[data-toggle-pw]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = appEl.querySelector(`#${btn.getAttribute("data-toggle-pw")}`);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Show" : "Hide";
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });
}

function errorHtml(msg) {
  return msg
    ? `<div style="color:#dc2626; font-size:13px; margin-top:12px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">${msg}</div>`
    : "";
}

function infoHtml(msg) {
  return msg
    ? `<div style="color:#166534; font-size:13px; margin-top:12px; padding:8px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">${msg}</div>`
    : "";
}

export function renderAuthScreen(appEl, onLoginSuccess) {
  // Always stop the animation before handing off to the rest of the app.
  // This fires synchronously at every exit point so no rAF or DOM node lingers.
  const succeed = () => {
    if (_bounceStop)     { _bounceStop();               _bounceStop     = null; }
    if (_bounceObserver) { _bounceObserver.disconnect(); _bounceObserver = null; }
    onLoginSuccess();
  };

  let errorMessage = "";
  let infoMessage = "";
  let isSignUp = false;

  // ── Password-reset landing form ────────────────────────────────────────────
  function renderPasswordResetForm() {
    appEl.innerHTML = `
      <div style="display:flex;justify-content:center;width:100%;position:relative;z-index:1;">
        <section class="card" style="max-width:400px; width:100%;">
          <h2 style="margin:0; text-align:center;">Set New Password</h2>

          ${errorHtml(errorMessage)}

          <form id="newPwForm" style="margin-top:16px;">
            ${passwordFieldHtml("newPassword", "New Password")}
            ${passwordFieldHtml("confirmNewPassword", "Confirm New Password")}
            <div class="btns" style="margin-top:16px; justify-content:center;">
              <button type="submit" class="primary">Update Password</button>
            </div>
          </form>
        </section>
      </div>
    `;

    wirePasswordToggles(appEl);
    _startBouncingLogo(appEl);

    appEl.querySelector("#newPwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMessage = "";

      const newPassword = e.target.newPassword.value;
      const confirmNewPassword = e.target.confirmNewPassword.value;

      if (!newPassword || !confirmNewPassword) {
        errorMessage = "Please fill in both password fields.";
        render();
        return;
      }
      if (newPassword !== confirmNewPassword) {
        errorMessage = "Passwords do not match.";
        render();
        return;
      }

      const result = await updatePassword(newPassword);
      if (!result.success) {
        errorMessage = result.error || "Failed to update password.";
        render();
        return;
      }

      succeed();
    });
  }

  // ── Main auth form ─────────────────────────────────────────────────────────
  function render() {
    if (isPendingPasswordReset()) {
      renderPasswordResetForm();
      return;
    }

    appEl.innerHTML = `
      <div style="display:flex;justify-content:center;width:100%;position:relative;z-index:1;">
        <section class="card" style="max-width:400px; width:100%;">
          <h2 style="margin:0; text-align:center;">${isSignUp ? "Create Account" : "Sign In"}</h2>

          ${errorHtml(errorMessage)}
          ${infoHtml(infoMessage)}

          <form id="authForm" style="margin-top:16px;">
            <label class="label" for="email">Email</label>
            <input type="email" id="email" name="email" required style="margin-bottom:12px;" />

            ${passwordFieldHtml("password", "Password")}

            ${!isSignUp ? `
              <div style="text-align:right; margin-top:-8px; margin-bottom:12px;">
                <button type="button" id="forgotPwBtn"
                  style="background:none; border:none; padding:0; font-size:12px;
                         color:var(--muted, #888); cursor:pointer; text-decoration:underline;">
                  Forgot password?
                </button>
              </div>
            ` : ""}

            ${isSignUp ? `
              ${passwordFieldHtml("confirmPassword", "Confirm Password")}
              <label class="label" for="role">Role</label>
              <select id="role" name="role" required style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font-size:14px; margin-bottom:12px;">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            ` : ""}

            <div class="btns" style="margin-top:16px; flex-wrap:nowrap; align-items:center; justify-content:center;">
              <button type="submit" class="primary" id="submitBtn">
                ${isSignUp ? "Create Account" : "Sign In"}
              </button>
              <button type="button" id="toggleForm">
                ${isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </div>

            <div style="text-align:center; margin-top:10px;">
              <button type="button" id="googleSignInBtn">Continue with Google</button>
            </div>
          </form>
        </section>
      </div>
    `;

    wirePasswordToggles(appEl);
    _startBouncingLogo(appEl);

    const form = appEl.querySelector("#authForm");
    const toggleBtn = appEl.querySelector("#toggleForm");
    const forgotBtn = appEl.querySelector("#forgotPwBtn");

    // Forgot password
    if (forgotBtn) {
      forgotBtn.addEventListener("click", async () => {
        const email = form.email.value.trim();
        if (!email) {
          errorMessage = "Enter your email address above, then click Forgot password.";
          infoMessage = "";
          render();
          return;
        }
        forgotBtn.disabled = true;
        const result = await sendPasswordResetEmail(email);
        forgotBtn.disabled = false;
        if (result.success) {
          errorMessage = "";
          infoMessage = "Password reset email sent. Check your inbox.";
        } else {
          infoMessage = "";
          errorMessage = result.error || "Failed to send reset email.";
        }
        render();
      });
    }

    // Sign in / Sign up submit
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMessage = "";
      infoMessage = "";

      const email = form.email.value.trim();
      const password = form.password.value;
      const role = isSignUp ? form.role?.value : null;

      if (!email || !password) {
        errorMessage = "Please fill in all fields.";
        render();
        return;
      }

      if (isSignUp) {
        const confirmPassword = form.confirmPassword?.value ?? "";
        if (password !== confirmPassword) {
          errorMessage = "Passwords do not match.";
          render();
          return;
        }

        if (!role) {
          errorMessage = "Please select a role.";
          render();
          return;
        }

        try {
          const result = await createUser(email, password, role);

          if (!result.success) {
            errorMessage = result.error;
            render();
            return;
          }

          if (result.needsEmailConfirmation) {
            infoMessage = "Account created! Check your email to confirm your address before signing in.";
            isSignUp = false;
            render();
            return;
          }

          succeed();
        } catch (err) {
          errorMessage = "An error occurred. Please try again.";
          render();
        }
      } else {
        try {
          const result = await signInWithPassword(email, password);

          if (!result.success) {
            errorMessage = result.error || "Invalid email or password.";
            render();
            return;
          }

          succeed();
        } catch (err) {
          errorMessage = "An error occurred. Please try again.";
          render();
        }
      }
    });

    toggleBtn.addEventListener("click", () => {
      isSignUp = !isSignUp;
      errorMessage = "";
      infoMessage = "";
      render();
    });

    appEl.querySelector("#googleSignInBtn").addEventListener("click", async () => {
      const result = await signInWithGoogle();
      if (!result.success) {
        errorMessage = result.error || "Google sign-in failed.";
        render();
      }
      // On success the browser navigates to Google — nothing else to do here.
    });
  }

  render();
}
