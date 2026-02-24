/**
 * Minimal auth panel/modal for Supabase email/password.
 * Shows "Auth unavailable until configured" when Supabase is not configured.
 */

import { getSupabase } from "../supabaseClient.js";
import * as auth from "./auth.js";

const OVERLAY_ID = "authPanelOverlay";
const PANEL_ID = "authPanel";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getOverlay() {
  return document.getElementById(OVERLAY_ID);
}

function closePanel() {
  const overlay = getOverlay();
  if (overlay) overlay.remove();
}

/**
 * Open the auth panel/modal. Safe when Supabase is not configured.
 */
export async function openAuthPanel() {
  const existing = getOverlay();
  if (existing) {
    existing.remove();
  }

  const supabase = await getSupabase();
  const configured = supabase != null;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "auth-overlay";
  overlay.setAttribute("aria-label", "Account");

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.className = "auth-panel card";

  if (!configured) {
    panel.innerHTML = `
      <h2 style="margin:0; text-align:center; font-size:18px;">Account</h2>
      <p class="auth-unavailable" style="margin-top:12px; font-size:14px; color:var(--muted);">
        Auth unavailable until configured. Add <code>src/config.js</code> with Supabase URL and anon key to enable sign in.
      </p>
      <div class="btns" style="margin-top:16px;">
        <button type="button" class="primary" id="authPanelClose">Close</button>
      </div>
    `;
  } else {
    let tab = "signin";
    let statusMessage = "";
    let statusType = ""; // "success" | "error" | ""

    async function renderPanel() {
      const { data: sessionData } = await auth.getSession();
      const session = sessionData?.session ?? null;
      const user = session?.user ?? null;

      if (user) {
        panel.innerHTML = `
          <h2 style="margin:0; text-align:center; font-size:18px;">Account</h2>
          <p style="margin-top:12px; font-size:14px;">Signed in as <strong>${escapeHtml(user.email ?? "")}</strong></p>
          ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:8px;">${escapeHtml(statusMessage)}</div>` : ""}
          <div class="btns" style="margin-top:16px;">
            <button type="button" class="primary" id="authSignOut">Sign out</button>
            <button type="button" id="authPanelClose">Close</button>
          </div>
        `;
        panel.querySelector("#authSignOut").addEventListener("click", async () => {
          const { error } = await auth.signOut();
          if (error) {
            statusMessage = error.message ?? "Sign out failed";
            statusType = "error";
          } else {
            statusMessage = "";
            statusType = "";
          }
          renderPanel();
        });
      } else {
        panel.innerHTML = `
          <h2 style="margin:0; text-align:center; font-size:18px;">Account</h2>
          <div class="auth-tabs" style="margin-top:12px;">
            <button type="button" class="auth-tab ${tab === "signin" ? "active" : ""}" data-tab="signin">Sign in</button>
            <button type="button" class="auth-tab ${tab === "signup" ? "active" : ""}" data-tab="signup">Sign up</button>
          </div>
          ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:8px;">${escapeHtml(statusMessage)}</div>` : ""}
          <form id="authPanelForm" style="margin-top:16px;">
            <label class="label" for="authEmail">Email</label>
            <input type="email" id="authEmail" name="email" required style="margin-bottom:12px;" />
            <label class="label" for="authPassword">Password</label>
            <input type="password" id="authPassword" name="password" required style="margin-bottom:12px;" />
            <div class="btns" style="margin-top:16px;">
              <button type="submit" class="primary" id="authSubmit">${tab === "signin" ? "Sign in" : "Sign up"}</button>
              <button type="button" id="authPanelClose">Close</button>
            </div>
          </form>
        `;

        panel.querySelectorAll(".auth-tab").forEach((btn) => {
          btn.addEventListener("click", () => {
            tab = btn.getAttribute("data-tab");
            statusMessage = "";
            statusType = "";
            renderPanel();
          });
        });

        panel.querySelector("#authPanelForm").addEventListener("submit", async (e) => {
          e.preventDefault();
          statusMessage = "";
          statusType = "";
          const email = panel.querySelector("#authEmail").value.trim();
          const password = panel.querySelector("#authPassword").value;
          if (!email || !password) {
            statusMessage = "Email and password required.";
            statusType = "error";
            renderPanel();
            return;
          }
          if (tab === "signup") {
            const { data, error } = await auth.signUp(email, password);
            if (error) {
              statusMessage = error.message ?? "Sign up failed";
              statusType = "error";
            } else if (data?.user) {
              statusMessage = "Account created. Check your email to confirm, or sign in.";
              statusType = "success";
            }
          } else {
            const { data, error } = await auth.signIn(email, password);
            if (error) {
              statusMessage = error.message ?? "Sign in failed";
              statusType = "error";
            } else if (data?.session) {
              statusMessage = "Signed in.";
              statusType = "success";
            }
          }
          await renderPanel();
        });
      }

      const closeBtn = panel.querySelector("#authPanelClose");
      if (closeBtn) closeBtn.addEventListener("click", closePanel);
    }

    await renderPanel();
  }

  overlay.appendChild(panel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePanel();
  });

  document.body.appendChild(overlay);
}
