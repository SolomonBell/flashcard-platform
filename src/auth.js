import { createUser, getUserByEmail, setSession } from "./authStore.js";
import { hashPassword, verifyPassword } from "./crypto.js";

export function renderAuthScreen(appEl, onLoginSuccess) {
  let errorMessage = "";
  let isSignUp = false;

  function render() {
    appEl.innerHTML = `
      <section class="card">
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

      if (isSignUp) {
        if (!role) {
          errorMessage = "Please select a role.";
          render();
          return;
        }

        try {
          const passwordHash = await hashPassword(password);
          const result = createUser(email, passwordHash, role);
          
          if (!result.success) {
            errorMessage = result.error;
            render();
            return;
          }

          setSession(result.user.id);
          onLoginSuccess();
        } catch (err) {
          errorMessage = "An error occurred. Please try again.";
          render();
        }
      } else {
        try {
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
        } catch (err) {
          errorMessage = "An error occurred. Please try again.";
          render();
        }
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
