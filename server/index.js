// GraphQL API for the media equipment desk.
const { createServer } = require('http');
const { createYoga, createSchema } = require('graphql-yoga');
const { GraphQLError } = require('graphql');
const db = require('./db');
const { authenticate } = require('./auth');

const typeDefs = /* GraphQL */ `
  type Item { type: String!, qty: Int! }
  type Collector { roll: String!, name: String!, role: String! }
  type Request { id: ID!, club: String!, event: String!, ownerRoll: String!, due: String!, note: String, items: [Item!]!, collectors: [Collector!]! }
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
    const { due } = (await client.query('SELECT due FROM requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
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
    verifyCollector: (_, a) => checkCollector(a.requestId, a.roll, a.password),
    issueKit: (_, a) => issueKit(a.requestId, a.unitIds, a.roll, a.password),
    recordReturn: async (_, { loanNum, returnedBy }) => {
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
});

module.exports = { yoga };

if (require.main === module) {
  const port = process.env.PORT || 4000;
  createServer(yoga).listen(port, () => console.log(`GraphQL API on http://localhost:${port}/graphql`));
}
