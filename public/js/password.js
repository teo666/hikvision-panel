// Camera password rules (Hikvision: 8–16 characters, at least two kinds of
// characters, not containing the user name). Pure, so it runs in Node tests too.

/** @returns {string|null} an error code: 'length', 'kinds', 'username' */
export function checkPassword(password, username = '') {
  if (password.length < 8 || password.length > 16) return 'length';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(password)).length;
  if (kinds < 2) return 'kinds';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'username';
  return null;
}
