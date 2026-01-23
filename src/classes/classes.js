export function renderClassesScreen(appEl, { setScreen, renderAll }) {
  appEl.innerHTML = `
    <section class="card">
      <h2 style="margin:0; text-align:center;">Classes</h2>
      <p class="sub" style="text-align:center; margin-top:12px;">Coming soon</p>
      <div class="btns" style="margin-top:16px; justify-content:center;">
        <button class="primary" id="backToCreate">Back</button>
      </div>
    </section>
  `;

  appEl.querySelector("#backToCreate").addEventListener("click", () => {
    setScreen("create");
    renderAll();
  });
}
