// End-to-end smoke test: seed, then call the GraphQL API and check the answers.
// Uses DATABASE_URL if set (use a throwaway database), otherwise an in-memory Postgres (pg-mem).
const db = require('./db');

if (!process.env.DATABASE_URL) {
  const { newDb } = require('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  db.pool = new Pool();
}

const { seed } = require('./seed');
const { yoga } = require('./index');

async function gql(query, variables) {
  const res = await yoga.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

let failures = 0;
function check(name, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed ? '' : ' -> ' + JSON.stringify(detail)}`);
  if (!passed) failures++;
}

const VERIFY = `mutation ($requestId: ID!, $roll: String!, $password: String!) {
  verifyCollector(requestId: $requestId, roll: $roll, password: $password) { ok name message } }`;
const ISSUE = `mutation ($requestId: ID!, $unitIds: [ID!]!, $roll: String!, $password: String!) {
  issueKit(requestId: $requestId, unitIds: $unitIds, roll: $roll, password: $password) { ok message loans { num unitId due } } }`;
const RETURN = `mutation ($n: Int!) { recordReturn(loanNum: $n, returnedBy: "Desk") { num returnedAt returnedBy } }`;

async function main() {
  await seed();

  let r = await gql(VERIFY, { requestId: 'RQ-214', roll: 'EE23B031', password: 'wrong' });
  check('wrong password rejected', r.data?.verifyCollector.ok === false &&
    r.data.verifyCollector.message === 'Roll number or password is wrong.', r);

  r = await gql(VERIFY, { requestId: 'RQ-214', roll: 'CH23B047', password: 'campus123' });
  check('Leela rejected for RQ-214 (not named)', r.data?.verifyCollector.ok === false &&
    r.data.verifyCollector.message === 'Leela Das is not named on RQ-214.', r);

  r = await gql(VERIFY, { requestId: 'RQ-214', roll: 'EE23B031', password: 'campus123' });
  check('Kabir verified for RQ-214', r.data?.verifyCollector.ok === true && r.data.verifyCollector.name === 'Kabir Sen', r);

  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['PR-04', 'SP-02', 'AD-12'], roll: 'EE23B031', password: 'campus123' });
  const nums = r.data?.issueKit.loans.map((l) => l.num).join(',');
  check('issueKit RQ-214 creates loans 402-404', r.data?.issueKit.ok === true && nums === '402,403,404' &&
    r.data.issueKit.loans.every((l) => l.due === 'Fri 8 pm'), r);

  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['PR-06'], roll: 'EE23B031', password: 'campus123' });
  check('PR-06 refused (in repair)', r.data?.issueKit.ok === false && /repair/.test(r.data.issueKit.message), r);

  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['SP-05'], roll: 'EE23B031', password: 'campus123' });
  check('SP-05 refused on RQ-214 (quantity)', r.data?.issueKit.ok === false && /would go over/.test(r.data.issueKit.message), r);

  r = await gql(RETURN, { n: 402 });
  check('recordReturn 402', r.data?.recordReturn.num === 402 && !!r.data.recordReturn.returnedAt, r);

  r = await gql('{ loans(openOnly: true) { num } }');
  check('open loans are 401, 403, 404', r.data?.loans.map((l) => l.num).join(',') === '401,403,404', r);

  console.log(failures ? `${failures} check(s) failed.` : 'All checks passed.');
  await db.pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
