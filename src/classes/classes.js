import {
  getClassesByTeacher,
  getClassesByStudent,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
  addInvitedEmail,
  removeInvitedEmail,
  validateEmailDomain,
} from "./classesStore.js";
import { getUserByEmail, loadUsers } from "../authStore.js";

export function renderClassesScreen(appEl, { currentUser, state, setScreen, save, renderAll }) {
  const classView = state.classView || "home";
  const classId = state.classId || null;

  if (classView === "create") {
    renderCreateClassForm(appEl, { currentUser, state, setScreen, save, renderAll });
  } else if (classView === "detail" && classId) {
    renderClassDetail(appEl, { currentUser, classId, state, setScreen, save, renderAll });
  } else {
    renderClassesHome(appEl, { currentUser, state, setScreen, save, renderAll });
  }
}

function renderClassesHome(appEl, { currentUser, state, setScreen, save, renderAll }) {
  const isTeacher = currentUser.role === "teacher";
  const classes = isTeacher
    ? getClassesByTeacher(currentUser.id)
    : getClassesByStudent(currentUser.id);

  appEl.innerHTML = `
    <section class="card">
      <h2 style="margin:0; text-align:center;">Classes</h2>
      
      ${isTeacher ? `
        <div class="btns" style="margin-top:16px; justify-content:center;">
          <button class="primary" id="createClassBtn">Create Class</button>
        </div>
      ` : ""}
      
      ${classes.length === 0 ? `
        <p class="sub" style="text-align:center; margin-top:16px;">
          ${isTeacher ? "No classes yet. Create one to get started." : "You are not enrolled in any classes."}
        </p>
      ` : `
        <div style="margin-top:16px;">
          ${classes.map(c => `
            <div class="cardRow" style="margin-top:${classes.indexOf(c) === 0 ? '0' : '12px'};">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong>${escapeHtml(c.name)}</strong>
                  ${c.allowedDomains && c.allowedDomains.length > 0 ? `
                    <div class="small" style="margin-top:4px;">
                      Domains: ${escapeHtml(c.allowedDomains.join(", "))}
                    </div>
                  ` : ""}
                </div>
                <button class="primary" data-class-id="${c.id}">View</button>
              </div>
            </div>
          `).join("")}
        </div>
      `}
      
      <div class="btns" style="margin-top:16px; justify-content:center;">
        <button id="backToCreate">Back</button>
      </div>
    </section>
  `;

  if (isTeacher) {
    appEl.querySelector("#createClassBtn")?.addEventListener("click", () => {
      state.classView = "create";
      save();
      renderAll();
    });
  }

  appEl.querySelectorAll("button[data-class-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-class-id");
      state.classView = "detail";
      state.classId = id;
      save();
      renderAll();
    });
  });

  appEl.querySelector("#backToCreate")?.addEventListener("click", () => {
    state.classView = "home";
    state.classId = null;
    setScreen("create");
    save();
    renderAll();
  });
}

function renderCreateClassForm(appEl, { currentUser, state, setScreen, save, renderAll }) {
  let errorMessage = "";

  function render() {
    appEl.innerHTML = `
      <section class="card">
        <h2 style="margin:0; text-align:center;">Create Class</h2>
        
        ${errorMessage ? `
          <div style="color:#dc2626; font-size:13px; margin-top:12px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">
            ${errorMessage}
          </div>
        ` : ""}
        
        <form id="createClassForm" style="margin-top:16px;">
          <label class="label" for="className">Class Name</label>
          <input type="text" id="className" name="className" required style="margin-bottom:12px;" />
          
          <label class="label" for="allowedDomains">
            Allowed Domains (comma-separated, e.g. "bucknell.edu,seattleu.edu")
            <span class="small" style="display:block; margin-top:4px;">Leave empty to allow any email domain</span>
          </label>
          <input type="text" id="allowedDomains" name="allowedDomains" placeholder="bucknell.edu, seattleu.edu" style="margin-bottom:12px;" />
          
          <div class="btns" style="margin-top:16px;">
            <button type="submit" class="primary">Create</button>
            <button type="button" id="cancelCreate">Cancel</button>
          </div>
        </form>
      </section>
    `;

    const form = appEl.querySelector("#createClassForm");
    const cancelBtn = appEl.querySelector("#cancelCreate");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorMessage = "";

      const name = form.className.value.trim();
      const domainsInput = form.allowedDomains.value.trim();

      if (!name) {
        errorMessage = "Class name is required.";
        render();
        return;
      }

      const allowedDomains = domainsInput
        ? domainsInput.split(",").map(d => d.trim()).filter(d => d.length > 0)
        : [];

      const newClass = createClass(currentUser.id, name, allowedDomains);
      state.classView = "detail";
      state.classId = newClass.id;
      save();
      renderAll();
    });

    cancelBtn.addEventListener("click", () => {
      state.classView = "home";
      state.classId = null;
      save();
      renderAll();
    });
  }

  render();
}

function renderClassDetail(appEl, { currentUser, classId, state, setScreen, save, renderAll }) {
  let errorMessage = "";

  function render() {
    // Reload class data and users on each render to ensure fresh data
    const classObj = getClassById(classId);
    if (!classObj) {
      state.classView = "home";
      state.classId = null;
      save();
      renderAll();
      return;
    }

    const isTeacher = currentUser.role === "teacher" && classObj.teacherId === currentUser.id;
    const allUsers = loadUsers();
    const enrolledStudents = classObj.studentIds
      .map(id => allUsers.find(u => u.id === id))
      .filter(Boolean);
    appEl.innerHTML = `
      <section class="card">
        <h2 style="margin:0; text-align:center;">${escapeHtml(classObj.name)}</h2>
        
        ${classObj.allowedDomains && classObj.allowedDomains.length > 0 ? `
          <p class="sub" style="text-align:center; margin-top:8px;">
            Allowed domains: ${escapeHtml(classObj.allowedDomains.join(", "))}
          </p>
        ` : `
          <p class="sub" style="text-align:center; margin-top:8px;">
            All email domains allowed
          </p>
        `}
        
        ${isTeacher ? `
          <hr style="margin-top:16px;" />
          
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Add Student</h3>
          
          ${errorMessage ? `
            <div style="color:#dc2626; font-size:13px; margin-top:8px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">
              ${errorMessage}
            </div>
          ` : ""}
          
          <form id="addStudentForm" style="margin-top:8px;">
            <div style="display:flex; gap:8px;">
              <input type="email" id="studentEmail" name="studentEmail" placeholder="student@example.com" required style="flex:1;" />
              <button type="submit" class="primary">Add</button>
            </div>
          </form>
          
          <hr style="margin-top:16px;" />
          
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Enrolled Students</h3>
          ${enrolledStudents.length === 0 ? `
            <p class="small" style="margin-top:8px;">No enrolled students yet.</p>
          ` : `
            <div style="margin-top:8px;">
              ${enrolledStudents.map(s => `
                <div class="cardRow" style="margin-top:${enrolledStudents.indexOf(s) === 0 ? '0' : '8px'};">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${escapeHtml(s.email)}</span>
                    <button class="danger" data-remove-student-id="${s.id}">Remove</button>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
          
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Invited Emails</h3>
          ${classObj.invitedEmails.length === 0 ? `
            <p class="small" style="margin-top:8px;">No pending invitations.</p>
          ` : `
            <div style="margin-top:8px;">
              ${classObj.invitedEmails.map(email => `
                <div class="cardRow" style="margin-top:${classObj.invitedEmails.indexOf(email) === 0 ? '0' : '8px'};">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${escapeHtml(email)}</span>
                    <button class="danger" data-remove-email="${escapeHtml(email)}">Remove</button>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        ` : `
          <hr style="margin-top:16px;" />
          
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Enrolled Students</h3>
          ${enrolledStudents.length === 0 ? `
            <p class="small" style="margin-top:8px;">No enrolled students yet.</p>
          ` : `
            <div style="margin-top:8px;">
              ${enrolledStudents.map(s => `
                <div class="cardRow" style="margin-top:${enrolledStudents.indexOf(s) === 0 ? '0' : '8px'};">
                  <span>${escapeHtml(s.email)}</span>
                </div>
              `).join("")}
            </div>
          `}
        `}
        
        <div class="btns" style="margin-top:16px; justify-content:center;">
          <button id="backToClasses">Back to Classes</button>
        </div>
      </section>
    `;

    if (isTeacher) {
      const addForm = appEl.querySelector("#addStudentForm");
      addForm.addEventListener("submit", (e) => {
        e.preventDefault();
        errorMessage = "";

        const email = addForm.studentEmail.value.trim().toLowerCase();

        if (!email) {
          errorMessage = "Email is required.";
          render();
          return;
        }

        // Reload class to get current state
        const currentClass = getClassById(classId);
        if (!currentClass) {
          state.classView = "home";
          state.classId = null;
          save();
          renderAll();
          return;
        }

        // Validate domain if restrictions exist
        if (!validateEmailDomain(email, currentClass.allowedDomains)) {
          errorMessage = `Email domain not allowed. Allowed domains: ${currentClass.allowedDomains.join(", ") || "none"}`;
          render();
          return;
        }

        // Check if user exists
        const existingUser = getUserByEmail(email);
        if (existingUser) {
          // Add to enrolled students
          if (!currentClass.studentIds.includes(existingUser.id)) {
            addStudentToClass(classId, existingUser.id);
            // Remove from invited if present
            removeInvitedEmail(classId, email);
          }
        } else {
          // Add to invited emails
          if (!currentClass.invitedEmails.includes(email)) {
            addInvitedEmail(classId, email);
          }
        }

        // Clear the form input
        addForm.studentEmail.value = "";
        
        // Refresh the view
        render();
      });

      appEl.querySelectorAll("button[data-remove-student-id]").forEach(btn => {
        btn.addEventListener("click", () => {
          const studentId = btn.getAttribute("data-remove-student-id");
          removeStudentFromClass(classId, studentId);
          render();
        });
      });

      appEl.querySelectorAll("button[data-remove-email]").forEach(btn => {
        btn.addEventListener("click", () => {
          const email = btn.getAttribute("data-remove-email");
          removeInvitedEmail(classId, email);
          render();
        });
      });
    }

    appEl.querySelector("#backToClasses")?.addEventListener("click", () => {
      state.classView = "home";
      state.classId = null;
      save();
      renderAll();
    });
  }

  render();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
