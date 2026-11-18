// GraphQL API for the media equipment desk.
const { createServer } = require('http');
const { createYoga, createSchema } = require('graphql-yoga');
const { GraphQLError } = require('graphql');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { authenticate } = require('./auth');

const JWT_SECRET = process.env.JWT_SECRET || 'campus-stores-dev-secret';

// The logged-in user from "Authorization: Bearer <token>", or null.
function readUser(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null; // expired or tampered token counts as logged out
  }
}

function requireRole(user, role) {
  if (user && user.role === role) return;
  const who = role === 'admin' ? 'the store desk' : 'a student';
  throw new GraphQLError(`Log in as ${who} to do this.`, { extensions: { code: 'FORBIDDEN' } });
}

const typeDefs = /* GraphQL */ `
  type Item { type: String!, qty: Int! }
  type Collector { roll: String!, name: String!, role: String! }
  type Request { id: ID!, club: String!, event: String!, ownerRoll: String!, due: String!, note: String, status: String!, items: [Item!]!, collectors: [Collector!]! }
  type User { roll: String!, name: String!, role: String! }
  type LoginResult { ok: Boolean!, message: String!, token: String, user: User }
  type Unit { id: ID!, type: String!, model: String!, bin: String!, inRepair: Boolean!, onLoan: Boolean! }
  type Loan { num: Int!, requestId: ID!, unitId: ID!, collectorRoll: String!, due: String!, issuedAt: String!, returnedAt: String, returnedBy: String }
  type Note { id: ID!, body: String!, createdAt: String! }
  type Verification { ok: Boolean!, name: String, roll: String, message: String! }
  type IssueResult { ok: Boolean!, message: String!, loans: [Loan!]! }

  type Query {
    requests: [Request!]!
    units: [Unit!]!
    loans(openOnly: Boolean): [Loan!]!
  }

  type Mutation {
    login(roll: String!, password: String!): LoginResult!
    submitRequest(club: String!, event: String!, due: String!, items: [String!]!, collectorRolls: [String!]!, note: String): Request!
    approveRequest(id: ID!): Request!
    verifyCollector(requestId: ID!, roll: String!, password: String!): Verification!
    issueKit(requestId: ID!, unitIds: [ID!]!, roll: String!, password: String!): IssueResult!
    recordReturn(loanNum: Int!, returnedBy: String): Loan!
    addNote(body: String!): Note!
  }
`;

const iso = (t) => (t ? new Date(t).toISOString() : null);
const toLoan = (r) => ({
  num: r.num, requestId: r.request_id, unitId: r.unit_id, collectorRoll: r.collector_roll,
  due: r.due, issuedAt: iso(r.issued_at), returnedAt: iso(r.returned_at), returnedBy: r.returned_by,
});

// Password must be right (authN) AND the person must be named on the request (authZ).
async function checkCollector(requestId, roll, password) {
  const found = await db.pool.query('SELECT id FROM requests WHERE id = $1', [requestId]);
  if (!found.rows.length) return { ok: false, message: `Request ${requestId} was not found.` };
  const person = await authenticate(roll, password);
  if (!person) return { ok: false, message: 'Roll number or password is wrong.' };
  const named = await db.pool.query('SELECT 1 FROM request_collectors WHERE request_id = $1 AND roll = $2', [requestId, person.roll]);
  if (!named.rows.length) return { ok: false, ...person, message: `${person.name} is not named on ${requestId}.` };
  return { ok: true, ...person, message: `${person.name} can collect ${requestId}.` };
}

async function issueKit(requestId, unitIds, roll, password) {
  const check = await checkCollector(requestId, roll, password);
  if (!check.ok) return { ok: false, message: check.message, loans: [] };
  const ids = [...new Set(unitIds)];
  if (!ids.length) return { ok: false, message: 'Pick at least one unit.', loans: [] };

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Locking the request row makes two desks issuing on the same request take turns.
    const { due, status } = (await client.query('SELECT due, status FROM requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
    if (status !== 'approved') {
      await client.query('ROLLBACK');
      return { ok: false, message: `${requestId} is not approved yet. Nothing was issued.`, loans: [] };
    }
    const approved = {};
    for (const r of (await client.query('SELECT item_type, qty FROM request_items WHERE request_id = $1', [requestId])).rows) {
      approved[r.item_type] = r.qty;
    }
    const out = {}; // units of each type already out on this request
    const open = await client.query(
      `SELECT u.type FROM loans l JOIN units u ON u.id = l.unit_id
       WHERE l.request_id = $1 AND l.returned_at IS NULL`, [requestId]);
    for (const r of open.rows) out[r.type] = (out[r.type] || 0) + 1;

    const loans = [];
    for (const id of ids) {
      const unit = (await client.query('SELECT * FROM units WHERE id = $1 FOR UPDATE', [id])).rows[0];
      let problem = null;
      if (!unit) problem = `Unit ${id} does not exist.`;
      else if (unit.in_repair) problem = `${id} is in repair and cannot be issued.`;
      else if ((await client.query('SELECT 1 FROM loans WHERE unit_id = $1 AND returned_at IS NULL', [id])).rows.length) {
        problem = `${id} is already out on another loan.`;
      } else if (!(unit.type in approved)) problem = `${id} is a ${unit.type}, which is not approved on ${requestId}.`;
      else if ((out[unit.type] || 0) + 1 > approved[unit.type]) {
        problem = `${requestId} is approved for ${approved[unit.type]} ${unit.type}; ${id} would go over.`;
      }
      if (problem) {
        await client.query('ROLLBACK');
        return { ok: false, message: `${problem} Nothing was issued.`, loans: [] };
      }
      out[unit.type] = (out[unit.type] || 0) + 1;
      const row = (await client.query(
        `INSERT INTO loans (request_id, unit_id, collector_roll, due) VALUES ($1, $2, $3, $4) RETURNING *`,
        [requestId, id, check.roll, due])).rows[0];
      loans.push(toLoan(row));
    }
    await client.query('COMMIT');
    return { ok: true, message: `Issued ${ids.join(', ')} to ${check.name}. Due ${due}.`, loans };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// A student files a request; it waits as 'pending' until the desk approves it.
async function submitRequest(user, { club, event, due, items, collectorRolls, note }) {
  if (![club, event, due].every((s) => s.trim())) throw new GraphQLError('Club, event and due time are all needed.');
  if (!items.length) throw new GraphQLError('Ask for at least one item.');
  const stocked = new Set((await db.pool.query('SELECT DISTINCT type FROM units')).rows.map((r) => r.type));
  const qty = {}; // listing an item twice asks for two
  for (const type of items) {
    if (!stocked.has(type)) throw new GraphQLError(`The desk has no "${type}".`);
    qty[type] = (qty[type] || 0) + 1;
  }
  const rolls = [...new Set(collectorRolls.map((r) => r.trim().toUpperCase()))].filter((r) => r !== user.roll);
  for (const roll of rolls) {
    const found = await db.pool.query("SELECT 1 FROM people WHERE roll = $1 AND role = 'student'", [roll]);
    if (!found.rows.length) throw new GraphQLError(`No student has roll number ${roll}.`);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const id = 'RQ-' + (await client.query("SELECT nextval('request_num') AS n")).rows[0].n;
    const row = (await client.query(
      `INSERT INTO requests (id, club, event, owner_roll, due, note, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [id, club.trim(), event.trim(), user.roll, due.trim(), note || null])).rows[0];
    for (const [type, n] of Object.entries(qty)) {
      await client.query('INSERT INTO request_items (request_id, item_type, qty) VALUES ($1, $2, $3)', [id, type, n]);
    }
    const addCollector = 'INSERT INTO request_collectors (request_id, roll, role) VALUES ($1, $2, $3)';
    await client.query(addCollector, [id, user.roll, 'Filed the request']);
    for (const roll of rolls) await client.query(addCollector, [id, roll, 'Named on the request']);
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const resolvers = {
  Query: {
    requests: async () => (await db.pool.query('SELECT * FROM requests ORDER BY id')).rows,
    units: async () => (await db.pool.query(
      `SELECT u.*, EXISTS (SELECT 1 FROM loans l WHERE l.unit_id = u.id AND l.returned_at IS NULL) AS on_loan
       FROM units u ORDER BY u.id`)).rows
      .map((u) => ({ id: u.id, type: u.type, model: u.model, bin: u.bin, inRepair: u.in_repair, onLoan: u.on_loan })),
    loans: async (_, { openOnly }) => (await db.pool.query(
      `SELECT * FROM loans ${openOnly ? 'WHERE returned_at IS NULL' : ''} ORDER BY num`)).rows.map(toLoan),
  },
  Request: {
    ownerRoll: (r) => r.owner_roll,
    items: async (r) => (await db.pool.query(
      'SELECT item_type AS type, qty FROM request_items WHERE request_id = $1 ORDER BY item_type', [r.id])).rows,
    collectors: async (r) => (await db.pool.query(
      `SELECT c.roll, COALESCE(p.name, c.roll) AS name, c.role
       FROM request_collectors c LEFT JOIN people p ON p.roll = c.roll
       WHERE c.request_id = $1 ORDER BY c.roll`, [r.id])).rows,
  },
  Mutation: {
    login: async (_, { roll, password }) => {
      const user = await authenticate(roll, password);
      if (!user) return { ok: false, message: 'Roll number or password is wrong.' };
      const token = jwt.sign(user, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
      return { ok: true, message: `Logged in as ${user.name}.`, token, user };
    },
    submitRequest: (_, a, { user }) => {
      requireRole(user, 'student');
      return submitRequest(user, a);
    },
    approveRequest: async (_, { id }, { user }) => {
      requireRole(user, 'admin');
      const { rows } = await db.pool.query("UPDATE requests SET status = 'approved' WHERE id = $1 RETURNING *", [id]);
      if (!rows.length) throw new GraphQLError(`Request ${id} was not found.`);
      return rows[0];
    },
    verifyCollector: (_, a) => checkCollector(a.requestId, a.roll, a.password),
    issueKit: (_, a, { user }) => {
      requireRole(user, 'admin'); // the desk issues; the collector still proves who they are below
      return issueKit(a.requestId, a.unitIds, a.roll, a.password);
    },
    recordReturn: async (_, { loanNum, returnedBy }, { user }) => {
      requireRole(user, 'admin');
      const { rows } = await db.pool.query(
        `UPDATE loans SET returned_at = now(), returned_by = $2
         WHERE num = $1 AND returned_at IS NULL RETURNING *`, [loanNum, returnedBy || null]);
      if (rows.length) return toLoan(rows[0]);
      const exists = await db.pool.query('SELECT 1 FROM loans WHERE num = $1', [loanNum]);
      throw new GraphQLError(exists.rows.length ? `Loan ${loanNum} was already returned.` : `Loan ${loanNum} does not exist.`);
    },
    addNote: async (_, { body }) => {
      if (!body.trim()) throw new GraphQLError('A note cannot be empty.');
      const row = (await db.pool.query('INSERT INTO notes (body) VALUES ($1) RETURNING *', [body.trim()])).rows[0];
      return { id: row.id, body: row.body, createdAt: iso(row.created_at) };
    },
  },
};

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  cors: { origin: process.env.CORS_ORIGIN || '*' },
  context: ({ request }) => ({ user: readUser(request) }),
});

module.exports = { yoga };

if (require.main === module) {
  const port = process.env.PORT || 4000;
  createServer(yoga).listen(port, () => console.log(`GraphQL API on http://localhost:${port}/graphql`));
}
