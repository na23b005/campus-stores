// The one place that knows how to reach Postgres.
// Other files use db.pool at call time, so smoke.js can swap in an in-memory pool.
const { Pool } = require('pg');

const ssl = process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined;

module.exports = {
  pool: new Pool({ connectionString: process.env.DATABASE_URL, ssl }),
};
