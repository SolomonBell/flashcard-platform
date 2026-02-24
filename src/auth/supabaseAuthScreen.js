/**
 * Full-page Supabase auth UI (sign in, sign up, forgot password, set new password).
 * Renders into appEl when Supabase is configured and user is not signed in.
 */

import * as auth from "./auth.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the Supabase auth screen into appEl.
 * @param {HTMLElement} appEl - Main app container
 * @param {{ initialView?: 'main' | 'setNewPassword' }} options - initialView: 'setNewPassword' for recovery redirect
 */
export function renderSupabaseAuthScreen(appEl, options = {}) {
  let tab = "signin";
  let view = options.initialView === "setNewPassword" ? "setNewPassword" : "main";
  let statusMessage = "";
  let statusType = "";
  let pendingSignupEmail = "";

  function render() {
    if (view === "setNewPassword") {
      appEl.innerHTML = `
        <div style="display:flex; justify-content:center; width:100%;">
          <section class="card" style="max-width:400px; width:100%;">
            <h2 style="margin:0; text-align:center;">Set new password</h2>
            ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:12px;">${escapeHtml(statusMessage)}</div>` : ""}
            <form id="authSetPasswordForm" style="margin-top:16px;">
              <label class="label" for="authNewPassword">New password</label>
              <input type="password" id="authNewPassword" name="newPassword" required style="margin-bottom:12px;" />
              <label class="label" for="authConfirmPassword">Confirm password</label>
              <input type="password" id="authConfirmPassword" name="confirmPassword" required style="margin-bottom:12px;" />
              <div class="btns" style="margin-top:16px;">
                <button type="submit" class="primary">Update password</button>
              </div>
            </form>
          </section>
        </div>
      `;
      appEl.querySelector("#authSetPasswordForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        statusMessage = "";
        statusType = "";
        const newP = appEl.querySelector("#authNewPassword").value;
        const confirmP = appEl.querySelector("#authConfirmPassword").value;
        if (newP !== confirmP) {
          statusMessage = "Passwords do not match.";
          statusType = "error";
          render();
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
        render();
      });
      return;
    }

    if (view === "forgotPassword") {
      appEl.innerHTML = `
        <div style="display:flex; justify-content:center; width:100%;">
          <section class="card" style="max-width:400px; width:100%;">
            <h2 style="margin:0; text-align:center;">Reset password</h2>
            <p class="small" style="margin-top:8px;">Enter your email and we'll send a reset link.</p>
            ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:12px;">${escapeHtml(statusMessage)}</div>` : ""}
            <form id="authForgotForm" style="margin-top:16px;">
              <label class="label" for="authForgotEmail">Email</label>
              <input type="email" id="authForgotEmail" required style="margin-bottom:12px;" />
              <div class="btns" style="margin-top:16px;">
                <button type="submit" class="primary">Send reset email</button>
                <button type="button" id="authBackToSignIn">Back to Sign in</button>
              </div>
            </form>
          </section>
        </div>
      `;
      appEl.querySelector("#authForgotForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        statusMessage = "";
        statusType = "";
        const email = appEl.querySelector("#authForgotEmail").value.trim();
        if (!email) {
          statusMessage = "Email required.";
          statusType = "error";
          render();
          return;
        }
        const { error } = await auth.requestPasswordReset(email, auth.getDefaultRedirectTo());
        if (error) {
          statusMessage = error.message ?? "Failed to send reset email";
          statusType = "error";
        } else {
          statusMessage = "Check your email for the reset link.";
          statusType = "success";
        }
        render();
      });
      appEl.querySelector("#authBackToSignIn").addEventListener("click", () => {
        view = "main";
        statusMessage = "";
        statusType = "";
        render();
      });
      return;
    }

    if (view === "signupSuccess") {
      appEl.innerHTML = `
        <div style="display:flex; justify-content:center; width:100%;">
          <section class="card" style="max-width:400px; width:100%;">
            <h2 style="margin:0; text-align:center;">Check your email</h2>
            <p style="margin-top:12px; font-size:14px;">Confirm your account via the email we sent, then sign in.</p>
            ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:12px;">${escapeHtml(statusMessage)}</div>` : ""}
            <div class="btns" style="margin-top:16px;">
              <button type="button" class="primary" id="authResendConfirm">Resend confirmation email</button>
              <button type="button" id="authBackToSignIn2">Back to Sign in</button>
            </div>
          </section>
        </div>
      `;
      appEl.querySelector("#authResendConfirm").addEventListener("click", async () => {
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
        render();
      });
      appEl.querySelector("#authBackToSignIn2").addEventListener("click", () => {
        view = "main";
        tab = "signin";
        statusMessage = "";
        statusType = "";
        render();
      });
      return;
    }

    // main: sign in / sign up
    appEl.innerHTML = `
      <div style="display:flex; justify-content:center; width:100%;">
        <section class="card" style="max-width:400px; width:100%;">
          <h2 style="margin:0; text-align:center;">${tab === "signup" ? "Create account" : "Sign in"}</h2>
          <div class="auth-tabs" style="margin-top:12px;">
            <button type="button" class="auth-tab ${tab === "signin" ? "active" : ""}" data-tab="signin">Sign in</button>
            <button type="button" class="auth-tab ${tab === "signup" ? "active" : ""}" data-tab="signup">Sign up</button>
          </div>
          ${statusMessage ? `<div class="auth-status auth-status-${statusType}" style="margin-top:12px;">${escapeHtml(statusMessage)}</div>` : ""}
          <form id="authPageForm" style="margin-top:16px;">
            <label class="label" for="authEmail">Email</label>
            <input type="email" id="authEmail" name="email" required style="margin-bottom:12px;" />
            <label class="label" for="authPassword">Password</label>
            <input type="password" id="authPassword" name="password" required style="margin-bottom:12px;" />
            ${tab === "signin" ? `<p style="margin-top:4px;"><a href="#" class="auth-link" id="authForgotLink">Forgot password?</a></p>` : ""}
            <div class="btns" style="margin-top:16px;">
              <button type="submit" class="primary">${tab === "signin" ? "Sign in" : "Sign up"}</button>
            </div>
          </form>
          ${tab === "signin" ? `
            <p class="small" style="margin-top:12px; text-align:center;">Or continue with</p>
            <div class="btns auth-oauth-btns" style="margin-top:8px; justify-content:center;">
              <button type="button" class="small" id="authOAuthGoogle">Continue with Google</button>
              <button type="button" class="small" id="authOAuthMicrosoft">Continue with Microsoft</button>
            </div>
          ` : ""}
        </section>
      </div>
    `;

    appEl.querySelectorAll(".auth-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab = btn.getAttribute("data-tab");
        statusMessage = "";
        statusType = "";
        render();
      });
    });

    const forgotLink = appEl.querySelector("#authForgotLink");
    if (forgotLink) {
      forgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        view = "forgotPassword";
        statusMessage = "";
        statusType = "";
        render();
      });
    }

    appEl.querySelector("#authPageForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      statusMessage = "";
      statusType = "";
      const email = appEl.querySelector("#authEmail").value.trim();
      const password = appEl.querySelector("#authPassword").value;
      if (!email || !password) {
        statusMessage = "Email and password required.";
        statusType = "error";
        render();
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
      render();
    });

    const oauthGoogle = appEl.querySelector("#authOAuthGoogle");
    if (oauthGoogle) {
      oauthGoogle.addEventListener("click", () => auth.signInWithOAuth("google", auth.getDefaultRedirectTo()));
    }
    const oauthMicrosoft = appEl.querySelector("#authOAuthMicrosoft");
    if (oauthMicrosoft) {
      oauthMicrosoft.addEventListener("click", () => auth.signInWithOAuth("azure", auth.getDefaultRedirectTo()));
    }
  }

  render();
}
