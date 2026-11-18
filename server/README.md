# Campus Stores API

GraphQL + Postgres backend for the media equipment desk. The static app works offline on its own; when `window.CAMPUS_API` is set it can use this API instead.

**Env vars:** `DATABASE_URL` (Postgres), `PGSSL=1` (SSL for hosted Postgres), `PORT` (default 4000), `CORS_ORIGIN` (default `*`), `LDAP_URL` + `LDAP_BIND_DN_TEMPLATE` (optional, see below).

**Run locally:** `npm install`, `npm run seed` (creates tables and sample data), `npm start`, then open http://localhost:4000/graphql.

**Smoke test:** `npm run smoke`. Without `DATABASE_URL` it runs against an in-memory Postgres (pg-mem). With `DATABASE_URL` it writes loans, so point it at a throwaway database.

**Deploy:** on Render, create a Blueprint from the repo (`render.yaml` sets up Postgres and the API, and seeds on build); set `CORS_ORIGIN` to the Netlify URL. On Netlify, deploy the repo root and set `CAMPUS_API` to the Render URL + `/graphql`; the build writes it into `config.js`.

**Demo collectors** (password `campus123` for all):

| Roll | Name | Can collect |
|---|---|---|
| ME23B014 | Isha Rao | RQ-214 |
| EE23B031 | Kabir Sen | RQ-214 |
| CH23B047 | Leela Das | none |
| HS23B008 | Tara Shah | RQ-209 |
| CS23B052 | Dev Menon | RQ-217 |

**Campus LDAP:** passwords are checked against bcrypt hashes in the `people` table, which stands in for LDAP. Setting `LDAP_URL` (and e.g. `LDAP_BIND_DN_TEMPLATE='uid={roll},ou=students,dc=college,dc=edu'`) switches `auth.js` to bind against campus LDAP instead.
