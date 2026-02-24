/**
 * Auth panel/modal: Sign in, Sign up, Forgot password, Set new password, email verification, OAuth.
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
 * Open the auth panel. options.initialView can be "setNewPassword" for recovery redirect.
 */
export async function openAuthPanel(options = {}) {
  const existing = getOverlay();
  if (existing) existing.remove();

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
    overlay.appendChild(panel);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
    document.body.appendChild(overlay);
    panel.querySelector("#authPanelClose").addEventListener("click", closePanel);
    return;
  }

  let tab = "signin";
  let view = options.initialView === "setNewPassword" ? "setNewPassword" : "main";
  let statusMessage = "";
  let statusType = "";
  let pendingSignupEmail = "";

  function attachClose() {
    const closeBtn = panel.querySelector("#authPanelClose");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
  }

  async function renderPanel() {
    const { data: sessionData } = await auth.getSession();
    const session = sessionData?.session ?? null;
    const user = session?.user ?? null;

    if (user && view !== "setNewPassword") {
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
        if (error) { statusMessage = error.message ?? "Sign out failed"; statusType = "error"; }
        else { statusMessage = ""; statusType = ""; }
        renderPanel();
      });
      attachClose();
      return;
    }

    if (view === "setNewPassword") {
      panel.innerHTML = `
        <h2 style="margin:0; text-align:center; font-size:18px;">Set new password</h2>
        ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:8px;">${escapeHtml(statusMessage)}</div>` : ""}
        <form id="authSetPasswordForm" style="margin-top:16px;">
          <label class="label" for="authNewPassword">New password</label>
          <input type="password" id="authNewPassword" name="newPassword" required style="margin-bottom:12px;" />
          <label class="label" for="authConfirmPassword">Confirm password</label>
          <input type="password" id="authConfirmPassword" name="confirmPassword" required style="margin-bottom:12px;" />
          <div class="btns" style="margin-top:16px;">
            <button type="submit" class="primary" id="authUpdatePassword">Update password</button>
            <button type="button" id="authPanelClose">Close</button>
          </div>
        </form>
      `;
      panel.querySelector("#authSetPasswordForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        statusMessage = "";
        statusType = "";
        const newP = panel.querySelector("#authNewPassword").value;
        const confirmP = panel.querySelector("#authConfirmPassword").value;
        if (newP !== confirmP) {
          statusMessage = "Passwords do not match.";
          statusType = "error";
          renderPanel();
          return;
        }
        const { error } = await auth.updatePassword(newP);
        if (error) {
          statusMessage = error.message ?? "Update failed";
          statusType = "error";
        } else {
          statusMessage = "Password updated. You can sign in now.";
          statusType = "success";
          view = "main";
          tab = "signin";
        }
        await renderPanel();
      });
      attachClose();
      return;
    }

    if (view === "forgotPassword") {
      panel.innerHTML = `
        <h2 style="margin:0; text-align:center; font-size:18px;">Reset password</h2>
        <p class="small" style="margin-top:8px;">Enter your email and we'll send a reset link.</p>
        ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:8px;">${escapeHtml(statusMessage)}</div>` : ""}
        <form id="authForgotForm" style="margin-top:16px;">
          <label class="label" for="authForgotEmail">Email</label>
          <input type="email" id="authForgotEmail" required style="margin-bottom:12px;" />
          <div class="btns" style="margin-top:16px;">
            <button type="submit" class="primary">Send reset email</button>
            <button type="button" id="authBackToSignIn">Back to Sign in</button>
            <button type="button" id="authPanelClose">Close</button>
          </div>
        </form>
      `;
      panel.querySelector("#authForgotForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        statusMessage = "";
        statusType = "";
        const email = panel.querySelector("#authForgotEmail").value.trim();
        if (!email) { statusMessage = "Email required."; statusType = "error"; renderPanel(); return; }
        const { error } = await auth.requestPasswordReset(email, auth.getDefaultRedirectTo());
        if (error) {
          statusMessage = error.message ?? "Failed to send reset email";
          statusType = "error";
        } else {
          statusMessage = "Check your email for the reset link.";
          statusType = "success";
        }
        await renderPanel();
      });
      panel.querySelector("#authBackToSignIn").addEventListener("click", () => {
        view = "main";
        statusMessage = "";
        statusType = "";
        renderPanel();
      });
      attachClose();
      return;
    }

    if (view === "signupSuccess") {
      panel.innerHTML = `
        <h2 style="margin:0; text-align:center; font-size:18px;">Check your email</h2>
        <p style="margin-top:12px; font-size:14px;">Check your email to confirm your account before signing in.</p>
        ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:8px;">${escapeHtml(statusMessage)}</div>` : ""}
        <div class="btns" style="margin-top:16px;">
          <button type="button" class="primary" id="authResendConfirm">Resend confirmation email</button>
          <button type="button" id="authBackToSignIn2">Back to Sign in</button>
          <button type="button" id="authPanelClose">Close</button>
        </div>
      `;
      panel.querySelector("#authResendConfirm").addEventListener("click", async () => {
        statusMessage = "";
        statusType = "";
        const { error } = await auth.resendSignupConfirmation(pendingSignupEmail, auth.getDefaultRedirectTo());
        if (error) {
          statusMessage = error.message ?? "Failed to resend";
          statusType = "error";
        } else {
          statusMessage = "Confirmation email sent again.";
          statusType = "success";
        }
        await renderPanel();
      });
      panel.querySelector("#authBackToSignIn2").addEventListener("click", () => {
        view = "main";
        tab = "signin";
        statusMessage = "";
        statusType = "";
        renderPanel();
      });
      attachClose();
      return;
    }

    if (view !== "main") return;
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
        ${tab === "signin" ? `<p style="margin-top:4px;"><a href="#" class="auth-link" id="authForgotLink">Forgot password?</a></p>` : ""}
        <div class="btns" style="margin-top:16px;">
          <button type="submit" class="primary" id="authSubmit">${tab === "signin" ? "Sign in" : "Sign up"}</button>
          <button type="button" id="authPanelClose">Close</button>
        </div>
      </form>
      ${tab === "signin" ? `
        <p class="small" style="margin-top:12px; text-align:center;">Or continue with</p>
        <div class="btns auth-oauth-btns" style="margin-top:8px; justify-content:center;">
          <button type="button" class="small" id="authOAuthGoogle">Continue with Google</button>
          <button type="button" class="small" id="authOAuthMicrosoft">Continue with Microsoft</button>
        </div>
      ` : ""}
    `;

    panel.querySelectorAll(".auth-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab = btn.getAttribute("data-tab");
        statusMessage = "";
        statusType = "";
        renderPanel();
      });
    });

    const forgotLink = panel.querySelector("#authForgotLink");
    if (forgotLink) {
      forgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        view = "forgotPassword";
        statusMessage = "";
        statusType = "";
        renderPanel();
      });
    }

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
          pendingSignupEmail = email;
          view = "signupSuccess";
          statusMessage = "Check your email to confirm your account before signing in.";
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

    const oauthGoogle = panel.querySelector("#authOAuthGoogle");
    if (oauthGoogle) {
      oauthGoogle.addEventListener("click", () => auth.signInWithOAuth("google", auth.getDefaultRedirectTo()));
    }
    const oauthMicrosoft = panel.querySelector("#authOAuthMicrosoft");
    if (oauthMicrosoft) {
      oauthMicrosoft.addEventListener("click", () => auth.signInWithOAuth("azure", auth.getDefaultRedirectTo()));
    }

    attachClose();
  }

  overlay.appendChild(panel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
  document.body.appendChild(overlay);

  await renderPanel();
}
