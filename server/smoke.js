// End-to-end smoke test: reset to sample data, then call the GraphQL API and check the answers.
// Uses DATABASE_URL if set (it resets that database!), otherwise an in-memory Postgres (pg-mem).
const db = require('./db');

if (!process.env.DATABASE_URL) {
  const { newDb } = require('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  db.pool = new Pool();
}

const { seed } = require('./seed');
const { yoga } = require('./index');

async function gql(query, variables, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await yoga.fetch('http://localhost/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  return res.json();
}

let failures = 0;
function check(name, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed ? '' : ' -> ' + JSON.stringify(detail)}`);
  if (!passed) failures++;
}
const forbidden = (r) => r.errors?.[0]?.extensions?.code === 'FORBIDDEN';

const LOGIN = `mutation ($roll: String!, $password: String!) {
  login(roll: $roll, password: $password) { ok message token user { roll name role } } }`;
const VERIFY = `mutation ($requestId: ID!, $roll: String!, $password: String!) {
  verifyCollector(requestId: $requestId, roll: $roll, password: $password) { ok name message } }`;
const ISSUE = `mutation ($requestId: ID!, $unitIds: [ID!]!, $roll: String!, $password: String!) {
  issueKit(requestId: $requestId, unitIds: $unitIds, roll: $roll, password: $password) { ok message loans { num unitId due } } }`;
const RETURN = `mutation ($n: Int!) { recordReturn(loanNum: $n, returnedBy: "Desk") { num returnedAt returnedBy } }`;
const SUBMIT = `mutation ($items: [String!]!, $rolls: [String!]!) {
  submitRequest(club: "Film Society", event: "Rooftop movie", due: "Sun 7 pm", items: $items, collectorRolls: $rolls) {
    id status ownerRoll items { type qty } collectors { roll role } } }`;
const APPROVE = `mutation ($id: ID!) { approveRequest(id: $id) { id status } }`;

async function main() {
  await seed({ reset: true });
  const kabir = { roll: 'EE23B031', password: 'campus123' };

  // Logging in
  let r = await gql(LOGIN, { roll: 'ADMIN', password: 'nope' });
  check('login with wrong password rejected', r.data?.login.ok === false && !r.data.login.token, r);
  r = await gql(LOGIN, { roll: 'ADMIN', password: 'desk123' });
  const desk = r.data?.login.token;
  check('desk logs in as admin', r.data?.login.ok === true && r.data.login.user.role === 'admin' && !!desk, r);
  r = await gql(LOGIN, { roll: 'ME23B014', password: 'campus123' });
  const isha = r.data?.login.token;
  check('Isha logs in as student', r.data?.login.user?.role === 'student' && !!isha, r);

  // Checking collectors
  r = await gql(VERIFY, { requestId: 'RQ-214', roll: 'EE23B031', password: 'wrong' });
  check('wrong password rejected', r.data?.verifyCollector.ok === false &&
    r.data.verifyCollector.message === 'Roll number or password is wrong.', r);
  r = await gql(VERIFY, { requestId: 'RQ-214', roll: 'CH23B047', password: 'campus123' });
  check('Leela rejected for RQ-214 (not named)', r.data?.verifyCollector.ok === false &&
    r.data.verifyCollector.message === 'Leela Das is not named on RQ-214.', r);
  r = await gql(VERIFY, { requestId: 'RQ-214', ...kabir });
  check('Kabir verified for RQ-214', r.data?.verifyCollector.ok === true && r.data.verifyCollector.name === 'Kabir Sen', r);

  // Issuing and returning
  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['PR-04'], ...kabir });
  check('issueKit without desk login refused', forbidden(r), r);
  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['PR-04'], ...kabir }, isha);
  check('issueKit by a student refused', forbidden(r), r);
  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['PR-04', 'SP-02', 'AD-12'], ...kabir }, desk);
  const nums = r.data?.issueKit.loans.map((l) => l.num).join(',');
  check('issueKit RQ-214 creates loans 402-404', r.data?.issueKit.ok === true && nums === '402,403,404' &&
    r.data.issueKit.loans.every((l) => l.due === 'Fri 8 pm'), r);
  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['PR-06'], ...kabir }, desk);
  check('PR-06 refused (in repair)', r.data?.issueKit.ok === false && /repair/.test(r.data.issueKit.message), r);
  r = await gql(ISSUE, { requestId: 'RQ-214', unitIds: ['SP-05'], ...kabir }, desk);
  check('SP-05 refused on RQ-214 (quantity)', r.data?.issueKit.ok === false && /would go over/.test(r.data.issueKit.message), r);
  r = await gql(RETURN, { n: 402 });
  check('recordReturn without desk login refused', forbidden(r), r);
  r = await gql(RETURN, { n: 402 }, desk);
  check('recordReturn 402', r.data?.recordReturn.num === 402 && !!r.data.recordReturn.returnedAt, r);
  r = await gql('{ loans(openOnly: true) { num } }');
  check('open loans are 401, 403, 404', r.data?.loans.map((l) => l.num).join(',') === '401,403,404', r);

  // Students submit requests, the desk approves them
  r = await gql(SUBMIT, { items: ['Digital camera'], rolls: [] });
  check('submitRequest without login refused', forbidden(r), r);
  r = await gql(SUBMIT, { items: ['Digital camera'], rolls: [] }, desk);
  check('submitRequest by the desk refused', forbidden(r), r);
  r = await gql(SUBMIT, { items: ['Digital camera'], rolls: ['ZZ99Z999'] }, isha);
  check('submitRequest with unknown roll refused', r.errors?.[0]?.message === 'No student has roll number ZZ99Z999.', r);
  r = await gql(SUBMIT, { items: ['Smoke machine'], rolls: [] }, isha);
  check('submitRequest with unknown item refused', r.errors?.[0]?.message === 'The desk has no "Smoke machine".', r);
  r = await gql(SUBMIT, { items: ['HDMI projector', 'Portable speaker', 'Portable speaker'], rolls: ['ee23b031'] }, isha);
  const req = r.data?.submitRequest;
  check('Isha submits RQ-218 (pending, 2 speakers, Kabir named)', req?.id === 'RQ-218' && req.status === 'pending' &&
    req.ownerRoll === 'ME23B014' && req.items.find((i) => i.type === 'Portable speaker')?.qty === 2 &&
    req.collectors.map((c) => c.roll).join(',') === 'EE23B031,ME23B014', r);
  r = await gql(ISSUE, { requestId: 'RQ-218', unitIds: ['PR-06'], ...kabir }, desk);
  check('issueKit on pending RQ-218 refused', r.data?.issueKit.ok === false && /not approved/.test(r.data.issueKit.message), r);
  r = await gql(APPROVE, { id: 'RQ-218' }, isha);
  check('approveRequest by a student refused', forbidden(r), r);
  r = await gql(APPROVE, { id: 'RQ-218' }, desk);
  check('desk approves RQ-218', r.data?.approveRequest.status === 'approved', r);
  r = await gql(SUBMIT, { items: ['Digital camera'], rolls: [] }, isha);
  check('next request is RQ-219', r.data?.submitRequest.id === 'RQ-219', r);

  console.log(failures ? `${failures} check(s) failed.` : 'All checks passed.');
  await db.pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
