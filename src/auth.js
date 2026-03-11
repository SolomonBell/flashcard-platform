import { createUser, signInWithPassword } from "./authStore.js";

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

export function renderAuthScreen(appEl, onLoginSuccess) {
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

            ${passwordFieldHtml("password", "Password")}

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
          </form>
        </section>
      </div>
    `;

    // Wire show/hide toggles
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

          onLoginSuccess();
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
