// authenticate(roll, password) -> { roll, name } or null.
// Default: bcrypt hash in the people table (stands in for campus LDAP).
// With LDAP_URL set: bind to campus LDAP as the student instead.
const bcrypt = require('bcryptjs');
const db = require('./db');

async function authenticate(roll, password) {
  roll = String(roll || '').trim().toUpperCase();
  // Roll numbers are letters and digits only; this also keeps them safe inside an LDAP DN.
  if (!/^[A-Z0-9]+$/.test(roll) || !password) return null;
  return process.env.LDAP_URL ? ldapAuth(roll, password) : dbAuth(roll, password);
}

async function dbAuth(roll, password) {
  const { rows } = await db.pool.query('SELECT roll, name, password_hash FROM people WHERE roll = $1', [roll]);
  if (!rows.length) return null;
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  return ok ? { roll: rows[0].roll, name: rows[0].name } : null;
}

async function ldapAuth(roll, password) {
  const { Client } = require('ldapts');
  const client = new Client({ url: process.env.LDAP_URL });
  const dn = process.env.LDAP_BIND_DN_TEMPLATE.replace('{roll}', roll);
  try {
    await client.bind(dn, password);
    const { searchEntries } = await client.search(dn, { scope: 'base', attributes: ['displayName', 'cn'] });
    const entry = searchEntries[0] || {};
    return { roll, name: String(entry.displayName || entry.cn || roll) };
  } catch {
    return null; // wrong password or unknown user
  } finally {
    await client.unbind().catch(() => {});
  }
}

module.exports = { authenticate };
