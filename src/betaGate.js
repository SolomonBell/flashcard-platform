const BETA_CODE        = "firststep-beta";
const STORAGE_KEY      = "fss_beta_access";

function _isUnlocked() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

/**
 * Shows a full-screen access-code prompt and resolves when the user
 * enters the correct code. Resolves immediately if already unlocked.
 */
export function requireBetaAccess() {
  if (_isUnlocked()) return Promise.resolve();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "betaGateOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;" +
      "justify-content:center;background:var(--bg,#f3f4f6);";

    overlay.innerHTML = `
      <div style="
        background:#fff;border:1px solid var(--border,#e5e7eb);
        border-radius:16px;padding:40px 32px;max-width:360px;width:100%;
        box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center;
      ">
        <h2 style="margin:0 0 6px;font-size:1.3rem;">FirstStepStudy Beta</h2>
        <p style="margin:0 0 24px;color:var(--muted,#6b7280);font-size:0.9rem;">
          Enter your access code to continue.
          Computers only. 
        </p>
        <input
          id="betaCodeInput"
          type="text"
          placeholder="Access code"
          autocomplete="off"
          style="
            width:100%;box-sizing:border-box;padding:10px 14px;
            border:1px solid var(--border,#e5e7eb);border-radius:10px;
            font-size:1rem;margin-bottom:12px;text-align:center;
          "
        />
        <div id="betaCodeError" style="
          display:none;color:#dc2626;font-size:0.82rem;
          margin-bottom:12px;
        ">Incorrect access code. Please try again.</div>
        <button id="betaCodeSubmit" class="primary" style="width:100%;">
          Continue
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const input   = overlay.querySelector("#betaCodeInput");
    const errorEl = overlay.querySelector("#betaCodeError");
    const btn     = overlay.querySelector("#betaCodeSubmit");

    input.focus();

    function attempt() {
      if (input.value.trim() === BETA_CODE) {
        localStorage.setItem(STORAGE_KEY, "1");
        overlay.remove();
        resolve();
      } else {
        errorEl.style.display = "block";
        input.select();
      }
    }

    btn.addEventListener("click", attempt);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  });
}
