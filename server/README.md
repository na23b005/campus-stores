# Campus Stores API

GraphQL + Postgres backend for the media equipment desk. The static app works offline on its own; when `window.CAMPUS_API` is set it can use this API instead.

**Env vars:** `DATABASE_URL` (Postgres), `PGSSL=1` (SSL for hosted Postgres), `JWT_SECRET` (signs login tokens; set it in production), `PORT` (default 4000), `CORS_ORIGIN` (default `*`), `LDAP_URL` + `LDAP_BIND_DN_TEMPLATE` (optional, see below).

**Run locally:** `npm install`, `npm run seed` (creates tables, adds missing sample data; safe to re-run), `npm start`, then open http://localhost:4000/graphql. `npm run reset` drops this app's tables and restores the clean sample data.

**Roles:** `login` returns a token; send it as `Authorization: Bearer <token>`. Students submit requests (`submitRequest`, status `pending`). The desk (admin) approves them (`approveRequest`), issues kits (`issueKit`, which also checks the collector's own roll and password) and records returns (`recordReturn`).

**Smoke test:** `npm run smoke`. Without `DATABASE_URL` it uses an in-memory Postgres (pg-mem). With `DATABASE_URL` it resets that database first, so never point it at live data; run `npm run reset` afterwards.

**Deploy:** on Render, create a Blueprint from the repo and paste the existing database URL into `DATABASE_URL` (never commit it); set `CORS_ORIGIN` to the Netlify URL. On Netlify, deploy the repo root and set `CAMPUS_API` to the Render URL + `/graphql`; the build writes it into `config.js`.

**Demo accounts:**

| Roll | Name | Password | Role / can collect |
|---|---|---|---|
| ADMIN | Store desk | desk123 | admin |
| ME23B014 | Isha Rao | campus123 | RQ-214 |
| EE23B031 | Kabir Sen | campus123 | RQ-214 |
| CH23B047 | Leela Das | campus123 | none |
| HS23B008 | Tara Shah | campus123 | RQ-209 |
| CS23B052 | Dev Menon | campus123 | RQ-217 |

**Campus LDAP:** passwords are checked against bcrypt hashes in the `people` table, which stands in for LDAP. Setting `LDAP_URL` (and e.g. `LDAP_BIND_DN_TEMPLATE='uid={roll},ou=students,dc=college,dc=edu'`) switches `auth.js` to bind against campus LDAP; roles still come from `people`.
