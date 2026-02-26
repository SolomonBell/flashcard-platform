/**
 * Classes store: chooses Supabase-backed store when configured and signed in,
 * otherwise returns a safe stub (empty lists, no-op reads, throws "Supabase required" for create/assign).
 * Use getClassesStore() for orgs/classes/assignments/assigned decks; loadClasses/saveClasses remain for legacy local classes.
 */
export const STORAGE_CLASSES_KEY = "knowit_classes_v1";

/** Stub store when Supabase is not configured or user not signed in. List methods return []; create/assign throw. */
function getStubClassesStore() {
  const notSupported = () => {
    throw new Error("Supabase required");
  };
  return {
    isStub: true,
    async listMyOrgs() { return []; },
    async createOrg(_name) { notSupported(); },
    async listOrgMemberships(_orgId) { return []; },
    async getMyRoleInOrg(_orgId) { return null; },
    async listClasses(_orgId) { return []; },
    async createClass(_orgId, _name) { notSupported(); },
    async addStudentToClass(_classId, _studentUserId) { notSupported(); },
    async listMyDecks() { return []; },
    async assignDeckToClass(_classId, _deckId) { notSupported(); },
    async listAssignedDecksForMe() { return []; },
    async listCardsForDeck(_deckId) { return []; },
    async getDeck(_deckId) { return null; },
  };
}

/**
 * Returns Supabase-backed store if configured and signed in, otherwise a safe stub (no crash).
 */
export async function getClassesStore() {
  try {
    const { getClassesStore: getSupabaseStore } = await import("./classesSupabaseStore.js");
    return await getSupabaseStore();
  } catch (_) {
    return getStubClassesStore();
  }
}

export function loadClasses() {
  try {
    const raw = localStorage.getItem(STORAGE_CLASSES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveClasses(classes) {
  localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(classes));
}

export function getClassesByTeacher(teacherId) {
  const classes = loadClasses();
  return classes.filter(c => c.teacherId === teacherId);
}

export function getClassesByStudent(studentId) {
  const classes = loadClasses();
  return classes.filter(c => c.studentIds && c.studentIds.includes(studentId));
}

export function getClassById(classId) {
  const classes = loadClasses();
  return classes.find(c => c.id === classId) || null;
}

export function createClass(teacherId, name, allowedDomains) {
  const classes = loadClasses();
  const newClass = {
    id: `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    teacherId,
    name: name.trim(),
    allowedDomains: allowedDomains || [],
    studentIds: [],
    invitedEmails: [],
    createdAt: Date.now(),
  };
  classes.push(newClass);
  saveClasses(classes);
  return newClass;
}

export function updateClass(classId, updates) {
  const classes = loadClasses();
  const index = classes.findIndex(c => c.id === classId);
  if (index === -1) return null;
  
  classes[index] = { ...classes[index], ...updates };
  saveClasses(classes);
  return classes[index];
}

export function deleteClass(classId) {
  const classes = loadClasses();
  const filtered = classes.filter(c => c.id !== classId);
  saveClasses(filtered);
  return filtered.length < classes.length;
}

export function addStudentToClass(classId, studentId) {
  const classObj = getClassById(classId);
  if (!classObj) return false;
  
  if (!classObj.studentIds.includes(studentId)) {
    classObj.studentIds.push(studentId);
    updateClass(classId, { studentIds: classObj.studentIds });
  }
  return true;
}

export function removeStudentFromClass(classId, studentId) {
  const classObj = getClassById(classId);
  if (!classObj) return false;
  
  classObj.studentIds = classObj.studentIds.filter(id => id !== studentId);
  updateClass(classId, { studentIds: classObj.studentIds });
  return true;
}

export function addInvitedEmail(classId, email) {
  const classObj = getClassById(classId);
  if (!classObj) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  if (!classObj.invitedEmails.includes(normalizedEmail)) {
    classObj.invitedEmails.push(normalizedEmail);
    updateClass(classId, { invitedEmails: classObj.invitedEmails });
  }
  return true;
}

export function removeInvitedEmail(classId, email) {
  const classObj = getClassById(classId);
  if (!classObj) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  classObj.invitedEmails = classObj.invitedEmails.filter(e => e.toLowerCase() !== normalizedEmail);
  updateClass(classId, { invitedEmails: classObj.invitedEmails });
  return true;
}

export function validateEmailDomain(email, allowedDomains) {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  
  const emailDomain = email.toLowerCase().trim().split("@")[1];
  if (!emailDomain) return false;
  
  return allowedDomains.some(domain => 
    emailDomain === domain.toLowerCase().trim()
  );
}
