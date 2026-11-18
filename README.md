# Campus Stores - my submission

I would keep the product. My main change: **issue the kit from the approved request, to named collectors who sign in with their campus roll number.**
To support it, the app now has sign-in with two roles: desk staff (full access) and students, who can file requests in the app with the people allowed to collect.

## Try it in 2 minutes

Open `index.html` in a browser (it works offline), or run `python -m http.server 8000` in this folder and visit `http://localhost:8000`.

Sign in first. All accounts are fictional sample data.

- Desk staff, full access: `ADMIN` / `desk123`. Use this to play the shift.
- Students: the roll numbers below, password `campus123`. A student sees only their own requests and can file a new one. It shows as "Waiting for approval" until desk staff approve it.

| Name | Roll number | Role in the sample shift |
| --- | --- | --- |
| Isha Rao | ME23B014 | Filed RQ-214 |
| Kabir Sen | EE23B031 | Named collector on RQ-214 |
| Leela Das | CH23B047 | Not a collector - use her to see a refusal |
| Tara Shah | HS23B008 | RQ-209 |
| Dev Menon | CS23B052 | RQ-217 |

Follow the steps in [Walk through the same job with it](#walk-through-the-same-job-with-it).

## The moment it handles well

One slip per physical unit.

- At Fri 7:30 pm Kabir returned the projector and the speaker. I closed L-402 and L-403.
- The adapter slip L-404 stayed open, and Inventory still showed AD-12 as On loan.
- So the partial return was exact. Nothing was lost or closed by mistake.
- The guards also stopped me from issuing the in-repair projector PR-06 and a second speaker.

## The moment I would change

Fri 3:45 pm, issuing the kit.

- I picked a request and a unit, pressed Save, and only then got "This equipment type is outside the approved request". The form had offered me units the request never approved.
- "Collected by" listed five people with no reason for any of them. The request said "Filed by Isha Rao". The only reason Kabir could collect was a message in the Desk book.
- I entered the same request, person and due time three times, one slip at a time.
- Nothing told me whether the kit was complete. A USB-C-only laptop with no adapter means no screening.

This is the first moment of the job, and every later shift inherits its mistakes.

## My change

A sketch of the new issue form:

```text
Issue kit
Request        RQ-214 · Film Society screening        (picked)

Projector      [ PR-04 · BenQ MH550 · bin A2        v ]
Speaker        [ SP-02 · JBL Eon One · bin B1       v ]
Adapter        [ AD-12 · Belkin AVC002 · bin C4     v ]

Return by      Fri 8 pm (from the request)

Who can collect
  Isha Rao   · ME23B014 · filed the request
  Kabir Sen  · EE23B031 · named on the request

Collector roll number  [ EE23B031 ]
Password               [ ******** ]

               [ Issue 3 items ]
```

- Unit lists are filtered by the request. They show only approved, available units, so the old error can't happen.
- Several units are issued in one go. It is still one slip per unit.
- Collectors are named on the request, with their roll numbers.
- The collector signs in with their campus roll number and password (authentication). They must be named on that request (authorisation).
- The request page shows a checklist for each item: Not issued / Out on L-40x / Returned. It has an "Issue kit" button.
- Register rows show type and model, so the morning shift can match the adapter label.
- Students file requests in the app: club, event, equipment, return time and the roll numbers of who else may collect. Desk staff approve them, then issue the kit. This is where the named-collector list comes from.
- Sign-in has two roles. Desk staff see every screen. Students see only the requests they filed or can collect for.

## Walk through the same job with it

Fri 3:45 pm - pickup (signed in as `ADMIN`)

1. Open Requests > RQ-214 > Issue kit.
2. Pick PR-04, SP-02 and AD-12.
3. Kabir enters `EE23B031` / `campus123`.
4. One click issues L-402, L-403 and L-404.
5. The RQ-214 checklist shows 3 of 3 out.
6. Optional: try Leela's roll number `CH23B047` to see the refusal.

Fri 7:30 pm - partial return

1. In the Loan register, record the return for L-402 and L-403.
2. The RQ-214 checklist shows the adapter still out.
3. Add a handover note for the morning shift.

Sat 9:00 am - handover

1. The register row reads `L-404 · AD-12 · USB-C → HDMI adapter / Belkin AVC002 · bin C4 ...`.
2. Check that the label on Leela's adapter says Belkin.
3. Record the return on L-404.
4. The checklist shows all items returned.

A student filing a request

1. Sign out, then sign in as Kabir (`EE23B031` / `campus123`).
2. New request: tick the equipment, pick a return time, and add a friend's roll number as a collector.
3. Sign back in as `ADMIN`. The request shows as New. Approve it, then Issue kit.

## What I would keep

- One slip per physical unit.
- The repair, on-loan and quantity guards.
- The register opening on Outstanding.
- Inventory status computed from loans.
- The Desk book.

## How I would know it helped

One observation at a real counter:

- Time each pickup, from the student arriving to leaving with the full kit.
- Count how often the desk worker opens the Desk book or asks "who can collect this?".
- Compare one week before and one week after.

Success means one screen, under a minute, zero "outside the approved request" errors and zero kits leaving incomplete.

## Login, backend and hosting

- The static page stays offline-first for reviewers. Without a backend, sign-in is checked against a small demo directory of SHA-256 hashes in `app.js`.
- When `config.js` sets `window.CAMPUS_API`, the page uses the GraphQL API in `server/` (Node.js, GraphQL Yoga, Postgres, bcrypt).
- The auth adapter checks the Postgres directory. It switches to the college LDAP when `LDAP_URL` is set. Students already have a campus roll number and password, so there is no sign-up.
- Deploy: `render.yaml` (Render web service and Postgres) and `netlify.toml` (static site, `CAMPUS_API` env var).
- Details are in [server/README.md](server/README.md).

## Why no LLM here

- The job is structured records and rules. A rule is exact and works offline.
- I would use a model where text is messy. One example is reading free-text Desk book messages into structured collector changes, with the desk worker checking the result.

## What I would do next

- Record when an item passes to someone else. Leela had the adapter overnight, but the slip still says Kabir.
- An overdue flag.
- Confirm or undo on return.
- Returned-by and time on each return.

## Original exercise

Campus Stores is a Product Engineer work sample set at a fictional campus media equipment desk. Work through a club’s screening, from equipment pickup to a partial return and the next morning’s handover. Open **Candidate brief** in the app for the assignment.

### Run the app

Open `index.html` in a modern browser. The app includes its scripts, styles, and icons and can run offline.

To serve it over local HTTP, run this from the repository folder and visit `http://localhost:8000`.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Each browser stores its own sample shift locally when browser storage is available. **Restart sample shift** restores the fictional starting records.

### Source

- `index.html` contains the desk layout, candidate brief, and bundled icons.
- `app.js` contains the sample records and interactions.
- `styles.css` defines the desktop and mobile layouts.
- `config.js` optionally sets `window.CAMPUS_API` to point the page at the backend.
- `server/` contains the GraphQL API, database schema, seed data and auth adapter.

Icon license notices are in [third-party/lucide-LICENSE.txt](third-party/lucide-LICENSE.txt).

### Submit your work

1. [Fork Campus Stores](https://github.com/virinchi-healthcare/campus-stores/fork) into your GitHub account. Complete the candidate brief and push your changes to your public fork. In your README, point reviewers to your work and explain the decision you made.
2. In your fork, open **Commits**, select the final commit you want reviewed, and copy the page URL. It should look like `https://github.com/YOUR-USERNAME/campus-stores/commit/COMMIT-SHA`.
3. [Submit your work through the Google Form](https://docs.google.com/forms/d/e/1FAIpQLScvzoh1R4WS-SkiwAVBQbMvniieJYSoOEfLMyVo5CyjOvYUgQ/viewform). Your **roll number**, **email ID**, and **final commit link from your public fork** are required. Enter your roll number and email ID in the form only.
