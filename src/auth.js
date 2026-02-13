import { createUser, getUserByEmail, setSession } from "./authStore.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { useSupabaseAuth } from "./authBridge.js";
import * as authSupabase from "./authSupabase.js";

export function renderAuthScreen(appEl, onLoginSuccess) {
  (async () => {
    const useSupabase = await useSupabaseAuth();
    if (useSupabase) {
      renderAuthScreenSupabase(appEl, onLoginSuccess);
    } else {
      renderAuthScreenLocal(appEl, onLoginSuccess);
    }
  })();
}

function renderAuthScreenLocal(appEl, onLoginSuccess) {
  let errorMessage = "";
  let isSignUp = false;

  function render() {
    appEl.innerHTML = `
      <div style="display:flex; justify-content:center; width:100%;">
        <section class="card" style="max-width:400px; width:100%;">
          <h2 style="margin:0; text-align:center;">${isSignUp ? "Create Account" : "Sign In"}</h2>
        
        ${errorMessage ? `<div style="color:#dc2626; font-size:13px; margin-top:12px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">${errorMessage}</div>` : ""}
        
        <form id="authForm" style="margin-top:16px;">
          <label class="label" for="email">Email</label>
          <input type="email" id="email" name="email" required style="margin-bottom:12px;" />
          
          <label class="label" for="password">Password</label>
          <input type="password" id="password" name="password" required style="margin-bottom:12px;" />
          
          ${isSignUp ? `
            <label class="label" for="role">Role</label>
            <select id="role" name="role" required style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font-size:14px; margin-bottom:12px;">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          ` : ""}
          
          <div class="btns" style="margin-top:16px;">
            <button type="submit" class="primary" id="submitBtn">
              ${isSignUp ? "Create Account" : "Sign In"}
            </button>
            <button type="button" id="toggleForm">
              ${isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
            </button>
          </div>
        </form>
        </section>
      </div>
    `;

    const form = appEl.querySelector("#authForm");
    const toggleBtn = appEl.querySelector("#toggleForm");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMessage = "";
      const email = form.email.value.trim();
      const password = form.password.value;
      const role = isSignUp ? form.role?.value : null;
      if (!email || !password) {
        errorMessage = "Please fill in all fields.";
        render();
        return;
      }
      if (isSignUp && !role) {
        errorMessage = "Please select a role.";
        render();
        return;
      }
      try {
        if (isSignUp) {
          const passwordHash = await hashPassword(password);
          const result = createUser(email, passwordHash, role);
          if (!result.success) {
            errorMessage = result.error;
            render();
            return;
          }
          setSession(result.user.id);
          onLoginSuccess();
        } else {
          const user = getUserByEmail(email);
          if (!user) {
            errorMessage = "Invalid email or password.";
            render();
            return;
          }
          const isValid = await verifyPassword(password, user.passwordHash);
          if (!isValid) {
            errorMessage = "Invalid email or password.";
            render();
            return;
          }
          setSession(user.id);
          onLoginSuccess();
        }
      } catch (err) {
        errorMessage = "An error occurred. Please try again.";
        render();
      }
    });

    toggleBtn.addEventListener("click", () => {
      isSignUp = !isSignUp;
      errorMessage = "";
      render();
    });
  }

  render();
}

function renderAuthScreenSupabase(appEl, onLoginSuccess) {
  let errorMessage = "";
  let isSignUp = false;
  let showVerifyMessage = false;
  let verifyEmail = "";
  let showForgotPassword = false;
  let forgotSuccess = false;

  function render() {
    if (showVerifyMessage) {
      appEl.innerHTML = `
        <div style="display:flex; justify-content:center; width:100%;">
          <section class="card" style="max-width:400px; width:100%;">
            <h2 style="margin:0; text-align:center;">Check your email</h2>
            <p style="margin-top:12px; font-size:14px;">We sent a verification link to <strong>${verifyEmail}</strong>. Click it to activate your account.</p>
            <div class="btns" style="margin-top:16px;">
              <button type="button" class="primary" id="resendVerify">Resend verification email</button>
              <button type="button" id="backToAuth">Back to Sign In</button>
            </div>
          </section>
        </div>
      `;
      appEl.querySelector("#resendVerify").addEventListener("click", async () => {
        const r = await authSupabase.resendConfirmationEmail(verifyEmail);
        if (r.success) errorMessage = ""; else errorMessage = r.error || "Failed to resend.";
        render();
      });
      appEl.querySelector("#backToAuth").addEventListener("click", () => {
        showVerifyMessage = false;
        render();
      });
      return;
    }

    if (showForgotPassword) {
      appEl.innerHTML = `
        <div style="display:flex; justify-content:center; width:100%;">
          <section class="card" style="max-width:400px; width:100%;">
            <h2 style="margin:0; text-align:center;">Forgot password?</h2>
            ${forgotSuccess ? `<p style="margin-top:12px; font-size:14px; color:green;">Check your email for a reset link.</p>` : ""}
            ${!forgotSuccess ? `
              <form id="forgotForm" style="margin-top:16px;">
                <label class="label" for="forgotEmail">Email</label>
                <input type="email" id="forgotEmail" required style="margin-bottom:12px;" />
                <div class="btns" style="margin-top:16px;">
                  <button type="submit" class="primary">Send reset link</button>
                  <button type="button" id="backFromForgot">Back</button>
                </div>
              </form>
            ` : `
              <div class="btns" style="margin-top:16px;">
                <button type="button" id="backFromForgot">Back to Sign In</button>
              </div>
            `}
          </section>
        </div>
      `;
      if (!forgotSuccess) {
        appEl.querySelector("#forgotForm").addEventListener("submit", async (e) => {
          e.preventDefault();
          const email = appEl.querySelector("#forgotEmail").value.trim();
          const r = await authSupabase.requestPasswordReset(email);
          if (r.success) { forgotSuccess = true; render(); } else { errorMessage = r.error; render(); }
        });
      }
      appEl.querySelector("#backFromForgot").addEventListener("click", () => {
        showForgotPassword = false;
        forgotSuccess = false;
        render();
      });
      return;
    }

    appEl.innerHTML = `
      <div style="display:flex; justify-content:center; width:100%;">
        <section class="card" style="max-width:400px; width:100%;">
          <h2 style="margin:0; text-align:center;">${isSignUp ? "Create Account" : "Sign In"}</h2>
          ${errorMessage ? `<div style="color:#dc2626; font-size:13px; margin-top:12px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">${errorMessage}</div>` : ""}
          <form id="authForm" style="margin-top:16px;">
            <label class="label" for="email">Email</label>
            <input type="email" id="email" name="email" required style="margin-bottom:12px;" />
            <label class="label" for="password">Password</label>
            <input type="password" id="password" name="password" required style="margin-bottom:12px;" />
            ${isSignUp ? `
              <label class="label" for="role">Role</label>
              <select id="role" name="role" required style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font-size:14px; margin-bottom:12px;">
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            ` : ""}
            <div class="btns" style="margin-top:16px;">
              <button type="submit" class="primary" id="submitBtn">${isSignUp ? "Create Account" : "Sign In"}</button>
              <button type="button" id="toggleForm">${isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}</button>
            </div>
            ${!isSignUp ? `<p style="margin-top:8px; font-size:13px;"><a href="#" id="forgotLink">Forgot password?</a></p>` : ""}
          </form>
          <p style="margin-top:16px; font-size:13px; text-align:center;">Or continue with</p>
          <div class="btns" style="margin-top:8px; justify-content:center;">
            <button type="button" class="small" id="oauthGoogle">Continue with Google</button>
            <button type="button" class="small" id="oauthMicrosoft">Continue with Microsoft</button>
          </div>
        </section>
      </div>
    `;

    const form = appEl.querySelector("#authForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMessage = "";
      const email = form.email.value.trim();
      const password = form.password.value;
      const role = isSignUp ? form.role?.value : null;
      if (!email || !password) {
        errorMessage = "Please fill in all fields.";
        render();
        return;
      }
      if (isSignUp && !role) {
        errorMessage = "Please select a role.";
        render();
        return;
      }
      try {
        if (isSignUp) {
          const result = await authSupabase.signUp(email, password);
          if (!result.success) {
            errorMessage = result.error || "Sign up failed.";
            render();
            return;
          }
          if (result.user && !result.user.email_confirmed_at) {
            verifyEmail = email;
            showVerifyMessage = true;
            render();
            return;
          }
          if (result.session) {
            onLoginSuccess();
            return;
          }
          verifyEmail = email;
          showVerifyMessage = true;
          render();
        } else {
          const result = await authSupabase.signIn(email, password);
          if (!result.success) {
            errorMessage = result.error || "Invalid email or password.";
            render();
            return;
          }
          onLoginSuccess();
        }
      } catch (err) {
        errorMessage = err.message || "An error occurred. Please try again.";
        render();
      }
    });

    appEl.querySelector("#toggleForm").addEventListener("click", () => {
      isSignUp = !isSignUp;
      errorMessage = "";
      render();
    });

    const forgotLink = appEl.querySelector("#forgotLink");
    if (forgotLink) {
      forgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        showForgotPassword = true;
        render();
      });
    }

    appEl.querySelector("#oauthGoogle").addEventListener("click", async () => {
      errorMessage = "";
      await authSupabase.signInWithProvider("google");
    });
    appEl.querySelector("#oauthMicrosoft").addEventListener("click", async () => {
      errorMessage = "";
      await authSupabase.signInWithProvider("azure");
    });
  }

  render();
}
