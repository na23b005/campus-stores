// Creates the tables (schema.sql) and inserts the sample data if it is missing.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

// [roll, name, demo password, role]
const people = [
  ['ME23B014', 'Isha Rao', 'campus123', 'student'],
  ['EE23B031', 'Kabir Sen', 'campus123', 'student'],
  ['CH23B047', 'Leela Das', 'campus123', 'student'],
  ['HS23B008', 'Tara Shah', 'campus123', 'student'],
  ['CS23B052', 'Dev Menon', 'campus123', 'student'],
  ['ADMIN', 'Store desk', 'desk123', 'admin'],
];

const requests = [
  {
    id: 'RQ-214', club: 'Film Society', event: 'Courtyard screening', owner: 'ME23B014', due: 'Fri 8 pm',
    items: [['HDMI projector', 1], ['Portable speaker', 1], ['USB-C → HDMI adapter', 1]],
    collectors: [['ME23B014', 'Filed the request'], ['EE23B031', 'Named on the request']],
  },
  {
    id: 'RQ-209', club: 'Debate Union', event: 'Finals rehearsal', owner: 'HS23B008', due: 'Sat 10 am',
    items: [['Wireless microphone', 1]],
    collectors: [['HS23B008', 'Filed the request']],
  },
  {
    id: 'RQ-217', club: 'Photo Circle', event: 'Street portrait walk', owner: 'CS23B052', due: 'Sat noon',
    items: [['Digital camera', 1]],
    collectors: [['CS23B052', 'Filed the request']],
  },
];

// [id, type, model, bin, in_repair]
const units = [
  ['PR-04', 'HDMI projector', 'BenQ MH550', 'A2', false],
  ['PR-06', 'HDMI projector', 'Epson EB-X49', 'Workshop', true],
  ['SP-02', 'Portable speaker', 'JBL Eon One', 'B1', false],
  ['SP-05', 'Portable speaker', 'Bose S1', 'B2', false],
  ['AD-12', 'USB-C → HDMI adapter', 'Belkin AVC002', 'C4', false],
  ['AD-15', 'USB-C → HDMI adapter', 'Anker A8312', 'C4', false],
  ['MI-09', 'Wireless microphone', 'Shure BLX', 'B3', false],
  ['CA-03', 'Digital camera', 'Sony A6400', 'D2', false],
];

// Plain seed only adds missing rows, so it is safe to run on every deploy.
// reset: true drops this app's tables first, back to the clean sample state.
async function seed({ reset = false } = {}) {
  const q = (sql, params) => db.pool.query(sql, params);
  if (reset) {
    for (const t of ['loans', 'notes', 'request_collectors', 'request_items', 'requests', 'units', 'people']) {
      await q(`DROP TABLE IF EXISTS ${t}`);
    }
    await q('DROP SEQUENCE IF EXISTS loan_num');
    await q('DROP SEQUENCE IF EXISTS request_num');
  }
  await q(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  for (const [roll, name, password, role] of people) {
    const hash = await bcrypt.hash(password, 10);
    await q('INSERT INTO people (roll, name, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (roll) DO NOTHING',
      [roll, name, hash, role]);
  }
  for (const r of requests) {
    await q(`INSERT INTO requests (id, club, event, owner_roll, due, status) VALUES ($1, $2, $3, $4, $5, 'approved')
             ON CONFLICT (id) DO NOTHING`, [r.id, r.club, r.event, r.owner, r.due]);
    for (const [type, qty] of r.items) {
      await q('INSERT INTO request_items (request_id, item_type, qty) VALUES ($1, $2, $3) ON CONFLICT (request_id, item_type) DO NOTHING', [r.id, type, qty]);
    }
    for (const [roll, role] of r.collectors) {
      await q('INSERT INTO request_collectors (request_id, roll, role) VALUES ($1, $2, $3) ON CONFLICT (request_id, roll) DO NOTHING', [r.id, roll, role]);
    }
  }
  for (const u of units) {
    await q('INSERT INTO units (id, type, model, bin, in_repair) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', u);
  }
  await q(`INSERT INTO loans (num, request_id, unit_id, collector_roll, due)
           VALUES (401, 'RQ-209', 'MI-09', 'HS23B008', 'Sat 10 am') ON CONFLICT (num) DO NOTHING`);
}

module.exports = { seed };

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  seed({ reset })
    .then(() => { console.log(reset ? 'Reset to sample data.' : 'Seeded.'); return db.pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
