export const STORAGE_USERS_KEY = "knowit_users_v1";
export const STORAGE_SESSION_KEY = "knowit_session_v1";

export function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveUsers(users) {
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
}

export function getUserByEmail(email) {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();
  return users.find(u => u.email.toLowerCase() === normalizedEmail) || null;
}

export function createUser(email, passwordHash, role) {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check for duplicate email (case-insensitive)
  if (getUserByEmail(normalizedEmail)) {
    return { success: false, error: "Email already exists" };
  }

  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email: normalizedEmail,
    passwordHash,
    role,
    createdAt: Date.now(),
  };

  users.push(newUser);
  saveUsers(users);
  return { success: true, user: newUser };
}

export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(userId) {
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify({ userId, timestamp: Date.now() }));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_SESSION_KEY);
}

export function getCurrentUser() {
  const session = getSession();
  if (!session) return null;
  
  const users = loadUsers();
  return users.find(u => u.id === session.userId) || null;
}
