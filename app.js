(() => {
  const storageKey = "campus-stores.shift.v1";
  const root = document.getElementById("campus-stores");
  const q = (selector) => root.querySelector(selector);
  const requests = [
    {
      id: "RQ-214",
      club: "Film Society",
      event: "Courtyard screening",
      owner: "Isha Rao",
      due: "Fri 8 pm",
      items: ["HDMI projector", "Portable speaker", "USB-C → HDMI adapter"],
      note: "Playback is from a USB-C-only laptop. The host will collect at 4 pm.",
      // Named collectors: [roll number, why they may collect]. Filled in when the club files the request.
      collectors: [
        ["ME23B014", "Filed the request"],
        ["EE23B031", "Named on the request"],
      ],
    },
    {
      id: "RQ-209",
      club: "Debate Union",
      event: "Finals rehearsal",
      owner: "Tara Shah",
      due: "Sat 10 am",
      items: ["Wireless microphone"],
      note: "Rehearsal runs into the evening.",
      collectors: [["HS23B008", "Filed the request"]],
    },
    {
      id: "RQ-217",
      club: "Photo Circle",
      event: "Street portrait walk",
      owner: "Dev Menon",
      due: "Sat noon",
      items: ["Digital camera"],
      note: "Collection on Saturday morning.",
      collectors: [["CS23B052", "Filed the request"]],
    },
  ];
  const assets = [
    { id: "PR-04", type: "HDMI projector", model: "BenQ MH550", bin: "A2" },
    {
      id: "PR-06",
      type: "HDMI projector",
      model: "Epson EB-X49",
      bin: "Workshop",
      repair: true,
    },
    { id: "SP-02", type: "Portable speaker", model: "JBL Eon One", bin: "B1" },
    { id: "SP-05", type: "Portable speaker", model: "Bose S1", bin: "B2" },
    {
      id: "AD-12",
      type: "USB-C → HDMI adapter",
      model: "Belkin AVC002",
      bin: "C4",
    },
    {
      id: "AD-15",
      type: "USB-C → HDMI adapter",
      model: "Anker A8312",
      bin: "C4",
    },
    { id: "MI-09", type: "Wireless microphone", model: "Shure BLX", bin: "B3" },
    { id: "CA-03", type: "Digital camera", model: "Sony A6400", bin: "D2" },
  ];
  // Offline demo directory standing in for campus LDAP. hash = SHA-256 of "ROLL:password".
  // Demo password for everyone: campus123. The server in server/ uses bcrypt in Postgres instead.
  const people = [
    { roll: "ME23B014", name: "Isha Rao", hash: "ecbc929a291392975b0018a198f28053afc13a5273ea1cd2c562281043d2094e" },
    { roll: "EE23B031", name: "Kabir Sen", hash: "a1856af3b3faf36089d9c933411546543ce5dc1aebf7d52379df86cde0d7b006" },
    { roll: "CH23B047", name: "Leela Das", hash: "881d4756cfbe68523b65bef7fca294fb1bc5c8ef2f1bab38ceeb554e3d712f5a" },
    { roll: "HS23B008", name: "Tara Shah", hash: "a83d8d57f014c9f50d522619b50e16ac96e8018029aa0b2cf88f1f9245bc5902" },
    { roll: "CS23B052", name: "Dev Menon", hash: "08405f9a4fa263460915a2714d0424d099ebb394b7666e31f8dd7ff63756d39e" },
    // Desk staff account with full access. Demo password: desk123.
    { roll: "ADMIN", name: "Store desk", role: "admin", hash: "2ebcdf880ef654590c067a8afef424ea8b37c5d47d8008b0d7e4c848c04ec6a8" },
  ];
  const person = (roll) => people.find((p) => p.roll === roll);
  const shifts = [
    {
      time: "Friday · 3:45 pm",
      title: "Pickup at the counter",
      text: "Kabir is here for the Film Society screening. The film starts at four. Can he leave with everything he needs?",
      next: "Move to return time",
    },
    {
      time: "Friday · 7:30 pm",
      title: "The kit comes back in pieces",
      text: "Kabir has brought back the projector and speaker. “Leela still has the adapter. She’ll drop it off tomorrow at nine.” Take the return and hand over to the morning shift.",
      next: "Move to next morning",
    },
    {
      time: "Saturday · 9:00 am",
      title: "Morning shift",
      text: "You’ve just taken over. Leela walks in with an adapter. Work out what was outstanding from the screening and close the loan for the right item.",
    },
  ];
  const pages = [
    ["Requests", "clipboard-list"],
    ["Inventory", "package"],
    ["Loan register", "book-open"],
    ["Desk book", "messages-square"],
  ];
  const original = () => ({
    version: 1,
    tab: "Requests",
    phase: 0,
    selected: "",
    filter: "All items",
    loans: [
      {
        num: 401,
        req: "RQ-209",
        asset: "MI-09",
        who: "Tara Shah",
        due: "Sat 10 am",
        back: false,
      },
    ],
    notes: [],
    editing: false,
    issueReq: "",
    user: null, // { roll, name, role } after sign-in
    extra: [], // requests students submit in the app
    composing: false,
    onlyOpen: true,
    notice: "Sample shift · All records are fictional.",
  });
  let s = original();
  const getAsset = (id) => assets.find((x) => x.id === id);
  const allReqs = () => requests.concat(s.extra);
  const getReq = (id) => allReqs().find((x) => x.id === id);
  const approved = (r) => r.status !== "pending";
  const isAdmin = () => s.user && s.user.role === "admin";
  const types = [...new Set(assets.map((a) => a.type))];
  const dues = ["Fri 8 pm", "Sat 9 am", "Sat 10 am", "Sat noon"];
  const out = (id) => s.loans.find((l) => l.asset === id && !l.back);
  // One line per approved item, paired with its slip (an open slip first, else a returned one).
  const kit = (r) => {
    const used = new Set();
    return r.items.map((type) => {
      const mine = s.loans.filter(
        (l) =>
          l.req === r.id && !used.has(l) && getAsset(l.asset).type === type,
      );
      const loan = mine.find((l) => !l.back) || mine.find((l) => l.back);
      if (loan) used.add(loan);
      return { type, loan };
    });
  };
  const isOut = (line) => line.loan && !line.loan.back;
  const progress = (r) => {
    const lines = kit(r);
    const outNow = lines.filter(isOut).length;
    const back = lines.filter((x) => x.loan && x.loan.back).length;
    if (!outNow && !back) return "Not issued";
    if (!outNow) return "All returned";
    return outNow + " of " + lines.length + " out" + (back ? ", " + back + " returned" : "");
  };
  const unitLabel = (a) => a.id + " · " + a.model + " · bin " + a.bin;
  const sha256 = async (text) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  };
  // Authentication (roll number + campus password) and authorisation (named on this request).
  async function verify(reqId, roll, password) {
    if (window.CAMPUS_API) {
      try {
        const res = await fetch(window.CAMPUS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query:
              "mutation($r: ID!, $u: String!, $p: String!) { verifyCollector(requestId: $r, roll: $u, password: $p) { ok name roll message } }",
            variables: { r: reqId, u: roll, p: password },
          }),
        });
        return (await res.json()).data.verifyCollector;
      } catch {
        return { ok: false, message: "Can’t reach campus sign-in. Try again." };
      }
    }
    const p = person(roll);
    if (!p || !crypto.subtle || (await sha256(roll + ":" + password)) !== p.hash)
      return { ok: false, message: "Roll number or password is wrong." };
    const r = getReq(reqId);
    if (!r.collectors.some(([c]) => c === roll))
      return {
        ok: false,
        message: p.name + " is not named on " + r.id + ". Only the people listed on the request can collect.",
      };
    return { ok: true, name: p.name, roll };
  }
  const esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const opts = (list) =>
    list
      .map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + "</option>")
      .join("");
  const btn = (label, act, val = "", style = "") =>
    '<button type="button" data-action="' +
    act +
    '" data-val="' +
    esc(val) +
    '" class="' +
    style +
    '">' +
    esc(label) +
    "</button>";
  const head = (title, sub, control = "") =>
    '<div class="sectionhead"><div><h2>' +
    title +
    "</h2><small>" +
    sub +
    "</small></div>" +
    control +
    "</div>";
  const row = (label, sub, right) =>
    '<div class="row"><div><strong>' +
    esc(label) +
    "</strong><small>" +
    esc(sub) +
    "</small></div><div>" +
    right +
    "</div></div>";
  const badge = (t, good = false) =>
    '<span class="tag' + (good ? " good" : "") + '">' + esc(t) + "</span>";
  // Requests a student may see: ones they filed or are named on. Desk staff see all.
  const visible = () =>
    allReqs().filter(
      (r) => isAdmin() || r.collectors.some(([roll]) => roll === s.user.roll),
    );
  function newRequestForm() {
    return (
      head("New equipment request", "Filed as " + esc(s.user.name) + " · " + esc(s.user.roll), btn("Cancel", "cancelreq")) +
      '<form data-newreq><div class="form"><label><span>Club</span><input name="club" required maxlength="60" /></label><label><span>Event</span><input name="event" required maxlength="80" /></label><div class="full"><span class="fieldlabel">Equipment needed</span><div class="checks">' +
      types
        .map((t) => '<label><input type="checkbox" name="items" value="' + esc(t) + '" /> ' + esc(t) + "</label>")
        .join("") +
      '</div></div><label><span>Return by</span><select name="due" required>' +
      opts(dues.map((d) => [d, d])) +
      '</select></label><label><span>Who else can collect (roll numbers, comma separated)</span><input name="others" placeholder="e.g. EE23B031" /></label><label class="full"><span>Note for the desk</span><textarea name="note" rows="2" maxlength="300"></textarea></label></div><p class="formerror" role="alert" data-form-error></p><button type="submit" class="primary">Submit for approval</button></form>'
    );
  }
  function requestPage() {
    if (s.composing) return newRequestForm();
    let html = head(
      isAdmin() ? "Requests" : "My requests",
      isAdmin()
        ? "Student Activities Office · approve new forms, issue approved ones"
        : "Requests you filed or can collect for",
      isAdmin() ? "" : btn("New request", "newreq", "", "primary"),
    );
    if (s.selected) {
      const r = getReq(s.selected);
      const lines = kit(r);
      html +=
        btn("Back to list", "close") +
        '<div class="record"><small>' +
        esc(r.id) +
        (approved(r) ? " · Approved" : " · Waiting for approval") +
        "</small><h3>" +
        esc(r.event) +
        "</h3><p>" +
        esc(r.club) +
        " · Filed by " +
        esc(r.owner) +
        "</p><p><b>Return by</b> " +
        esc(r.due) +
        "</p><p>" +
        esc(r.note) +
        '</p></div><h3 class="subhead">Kit checklist</h3>' +
        lines
          .map((x) =>
            row(
              x.type,
              x.loan
                ? unitLabel(getAsset(x.loan.asset)) + " · L-" + x.loan.num + " · " + x.loan.who
                : "Nothing issued yet",
              isOut(x)
                ? badge("Out")
                : x.loan
                  ? badge("Returned", true)
                  : '<span class="tag warn">Not issued</span>',
            ),
          )
          .join("") +
        '<h3 class="subhead">Who can collect</h3>' +
        r.collectors
          .map(([roll, why]) => row(person(roll).name, roll + " · " + why, ""))
          .join("") +
        (!isAdmin()
          ? ""
          : !approved(r)
            ? '<div class="buttons">' + btn("Approve request", "approve", r.id, "primary") + "</div>"
            : lines.some((x) => !x.loan)
              ? '<div class="buttons">' + btn("Issue kit", "issue", r.id, "primary") + "</div>"
              : "");
    } else {
      const list = visible();
      if (!list.length) html += '<p class="hint">No requests yet. Use New request to file one.</p>';
      html += list
        .map((r) =>
          row(
            r.event,
            r.id + " · " + r.club + " · " + (approved(r) ? progress(r) : "Waiting for approval"),
            (approved(r) ? "" : '<span class="tag warn">New</span> ') + btn("View form", "request", r.id),
          ),
        )
        .join("");
    }
    return html;
  }
  function loginPage() {
    return (
      head("Sign in", "Use your campus roll number and password. No sign-up needed.") +
      '<form data-login><div class="form"><label><span>Roll number</span><input name="roll" required autocomplete="username" /></label><label><span>Password</span><input name="password" type="password" required autocomplete="current-password" /></label></div><p class="formerror" role="alert" data-form-error></p><button type="submit" class="primary">Sign in</button></form><p class="hint">Demo accounts · Desk staff (full access): <b>ADMIN</b> / desk123 · Students: <b>EE23B031</b> Kabir, <b>ME23B014</b> Isha, <b>CH23B047</b> Leela, <b>HS23B008</b> Tara, <b>CS23B052</b> Dev, password campus123</p>'
    );
  }
  async function login(roll, password) {
    if (window.CAMPUS_API) {
      try {
        const res = await fetch(window.CAMPUS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query:
              "mutation($u: String!, $p: String!) { login(roll: $u, password: $p) { ok message user { roll name role } } }",
            variables: { u: roll, p: password },
          }),
        });
        const r = (await res.json()).data.login;
        return r.ok ? r.user : null;
      } catch {
        return null;
      }
    }
    const p = person(roll);
    if (!p || !crypto.subtle || (await sha256(roll + ":" + password)) !== p.hash) return null;
    return { roll: p.roll, name: p.name, role: p.role || "student" };
  }
  function inventory() {
    let html = head(
      "Inventory",
      "Physical units · home shelf and current availability",
    );
    html +=
      '<div class="buttons"><label>Show <select data-filter>' +
      opts(
        ["All items", "On shelf", "On loan", "In repair"].map((f) => [f, f]),
      ) +
      "</select></label></div>";
    for (const a of assets) {
      const status = a.repair
        ? "In repair"
        : out(a.id)
          ? "On loan"
          : "On shelf";
      if (s.filter !== "All items" && s.filter !== status) continue;
      html += row(
        a.id + " · " + a.type,
        a.model + " · " + a.bin,
        badge(status, status === "On shelf"),
      );
    }
    return html;
  }
  function register() {
    let html = head(
      "Loan register",
      "One slip per physical unit",
      s.editing
        ? btn("Cancel", "cancel")
        : btn("New issue slip", "new", "", "primary"),
    );
    if (s.editing) {
      const r = getReq(s.issueReq);
      html +=
        '<form data-issue><div class="form"><label class="full"><span>Approved request</span><select name="req" data-issue-req required><option value="">Select…</option>' +
        opts(allReqs().filter(approved).map((x) => [x.id, x.id + " · " + x.club + " · " + x.event])) +
        "</select></label></div>";
      if (!r)
        return html + '<p class="hint">Pick the approved request. The units and the people who can collect come from it.</p></form>';
      // Only units of an approved type that are on the shelf and not in repair.
      const lines = kit(r).filter((x) => !x.loan);
      if (!lines.length)
        return html + '<p class="hint">Everything on ' + esc(r.id) + " has already been issued.</p></form>";
      html +=
        '<div class="kitlines">' +
        lines
          .map((x) => {
            const units = assets.filter((a) => a.type === x.type && !a.repair && !out(a.id));
            return (
              "<label><span>" +
              esc(x.type) +
              "</span>" +
              (units.length
                ? '<select name="unit" required><option value="">Pick the unit you hand over…</option>' +
                  opts(units.map((a) => [a.id, unitLabel(a)])) +
                  "</select>"
                : '<span class="tag warn">None on the shelf</span>') +
              "</label>"
            );
          })
          .join("") +
        '</div><p class="hint">Return by <b>' +
        esc(r.due) +
        "</b> (from the request) · Can collect: " +
        esc(r.collectors.map(([roll]) => person(roll).name + " (" + roll + ")").join(", ")) +
        '</p><div class="form signin"><label><span>Collector’s roll number</span><input name="roll" required autocomplete="username" placeholder="e.g. EE23B031" /></label><label><span>Campus password</span><input name="password" type="password" required autocomplete="current-password" /></label></div><p class="formerror" role="alert" data-form-error></p><button type="submit" class="primary">Sign in and issue kit</button></form>';
      return html;
    }
    html +=
      '<div class="buttons">' +
      ["Outstanding", "All slips"]
        .map(
          (v, i) =>
            '<button type="button" data-action="scope" data-val="' +
            i +
            '" aria-pressed="' +
            (s.onlyOpen === (i === 0)) +
            '">' +
            v +
            "</button>",
        )
        .join("") +
      "</div>";
    const shown = s.loans
      .filter((l) => !s.onlyOpen || !l.back)
      .slice()
      .reverse();
    if (!shown.length) html += "<p>No outstanding slips.</p>";
    for (const l of shown)
      html += row(
        "L-" + l.num + " · " + l.asset + " · " + getAsset(l.asset).type,
        getAsset(l.asset).model + " · bin " + getAsset(l.asset).bin + " · " + getReq(l.req).club + " (" + l.req + ") · " + l.who + " · Due " + l.due,
        l.back
          ? badge("Returned")
          : btn("Record return", "return", String(l.num)),
      );
    return html;
  }
  function deskbook() {
    let html = head(
      "Desk book",
      "Messages from clubs and notes for the next shift",
    );
    const entries = [
      [
        "Friday · 3:20 pm",
        "Isha Rao · Film Society",
        "Kabir Sen is picking up our whole screening kit. Please issue it in his name. I’m setting up in the courtyard.",
      ],
      [
        "Friday · 3:30 pm",
        "Tara Shah · Debate Union",
        "Our microphone stays with me overnight. I’ll return it by 10 am Saturday.",
      ],
    ];
    if (s.phase >= 1)
      entries.push([
        "Friday · 7:30 pm",
        "Kabir Sen · Film Society",
        "I brought the projector and speaker. Leela Das has our adapter. She’ll be at the counter at 9 am tomorrow.",
      ]);
    for (const n of s.notes)
      entries.push([shifts[n.phase].time, "Counter handover", n.text]);
    for (const [t, author, body] of entries.slice().reverse())
      html +=
        '<article class="record"><small>' +
        esc(t) +
        "</small><h3>" +
        esc(author) +
        "</h3><p>" +
        esc(body) +
        "</p></article>";
    return (
      html +
      '<form data-note><div class="form"><label class="full"><span>Note for the next shift</span><textarea name="note" rows="2" maxlength="400" required></textarea></label></div><button type="submit">Add handover note</button></form>'
    );
  }
  const screens = {
    Requests: requestPage,
    Inventory: inventory,
    "Loan register": register,
    "Desk book": deskbook,
  };
  function paint() {
    const phase = shifts[s.phase];
    q("[data-clock]").textContent = phase.time;
    q("[data-shift-title]").textContent = phase.title;
    q("[data-shift]").textContent = phase.text;
    const advance = q('[data-action="advance"]');
    advance.hidden = !phase.next;
    advance.textContent = phase.next || "";
    q(".shift").hidden = !isAdmin();
    q('[data-action="restart"]').hidden = !isAdmin();
    if (!s.user) {
      q("[data-nav]").innerHTML = "";
      q("[data-page]").innerHTML = loginPage();
      q("[data-status]").textContent = s.notice;
      return;
    }
    // Students only see their requests; desk staff get every screen.
    if (!isAdmin()) s.tab = "Requests";
    q("[data-nav]").innerHTML = pages
      .filter(([n]) => isAdmin() || n === "Requests")
      .map(
        ([n, icon]) =>
          '<button type="button" data-action="tab" data-val="' +
          n +
          '" aria-pressed="' +
          (s.tab === n) +
          '"><svg aria-hidden="true" class="store-icon"><use href="#icon-' +
          icon +
          '"></use></svg>' +
          n +
          "</button>",
      )
      .join("") +
      '<button type="button" data-action="logout" class="signout">Sign out · ' +
      esc(s.user.name) +
      "</button>";
    q("[data-page]").innerHTML = screens[s.tab]();
    if (q("[data-filter]")) q("[data-filter]").value = s.filter;
    if (q("[data-issue-req]")) q("[data-issue-req]").value = s.issueReq;
    q("[data-status]").textContent = s.notice;
  }
  function commit(msg) {
    if (msg) s.notice = msg;
    paint();
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      q("[data-status]").textContent +=
        " Browser storage is unavailable. Progress lasts for this visit.";
    }
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const v = b.dataset.val;
    switch (b.dataset.action) {
      case "restart":
        s = { ...original(), user: s.user };
        break;
      case "logout":
        s.user = null;
        s.selected = "";
        s.composing = false;
        s.editing = false;
        s.notice = "Signed out.";
        break;
      case "newreq":
        s.composing = true;
        break;
      case "cancelreq":
        s.composing = false;
        break;
      case "approve": {
        const r = getReq(v);
        if (!isAdmin() || !r) return;
        r.status = "approved";
        s.notice = r.id + " approved. The desk can now issue it.";
        break;
      }
      case "advance":
        if (s.phase < 2) s.phase++;
        s.notice = "Shift time updated.";
        break;
      case "tab":
        s.tab = v;
        s.editing = false;
        break;
      case "close":
        s.selected = "";
        break;
      case "request":
        s.selected = v;
        break;
      case "new":
        s.editing = true;
        s.issueReq = "";
        break;
      case "issue":
        s.tab = "Loan register";
        s.editing = true;
        s.issueReq = v;
        break;
      case "cancel":
        s.editing = false;
        break;
      case "scope":
        s.onlyOpen = v === "0";
        break;
      case "return": {
        const l = s.loans.find((l) => l.num === Number(v));
        if (!l || l.back) return;
        l.back = true;
        s.notice = l.asset + " returned to stock. Slip L-" + l.num + " closed.";
        break;
      }
    }
    commit();
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-filter]")) {
      s.filter = e.target.value;
      commit();
    }
    if (e.target.matches("[data-issue-req]")) {
      s.issueReq = e.target.value;
      commit();
    }
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const form = new FormData(f);
    const fail = (msg) => {
      q("[data-form-error]").textContent = msg;
    };
    if (f.matches("[data-login]")) {
      const user = await login(String(form.get("roll")).trim().toUpperCase(), String(form.get("password")));
      if (!user) return fail("Roll number or password is wrong.");
      s.user = user;
      s.tab = "Requests";
      s.selected = "";
      commit("Signed in as " + user.name + (user.role === "admin" ? " · desk staff" : "") + ".");
      return;
    }
    if (f.matches("[data-newreq]")) {
      const items = form.getAll("items").map(String).filter((t) => types.includes(t));
      if (!items.length) return fail("Tick at least one piece of equipment.");
      const others = String(form.get("others"))
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter((x) => x && x !== s.user.roll);
      const unknown = others.filter((x) => !person(x) || person(x).role === "admin");
      if (unknown.length) return fail("Unknown roll number: " + unknown.join(", ") + ".");
      const id = "RQ-" + (Math.max(...allReqs().map((r) => Number(r.id.slice(3)))) + 1);
      s.extra.push({
        id,
        club: String(form.get("club")).trim(),
        event: String(form.get("event")).trim(),
        owner: s.user.name,
        due: dues.includes(form.get("due")) ? String(form.get("due")) : dues[0],
        items,
        note: String(form.get("note")).trim() || "No note.",
        collectors: [[s.user.roll, "Filed the request"]].concat(
          [...new Set(others)].map((x) => [x, "Named on the request"]),
        ),
        status: "pending",
      });
      s.composing = false;
      s.selected = id;
      commit(id + " submitted. The desk will approve it before pickup.");
      return;
    }
    if (f.matches("[data-note]")) {
      const text = String(form.get("note")).trim();
      if (!text) return;
      s.notes.push({ phase: s.phase, text });
      commit("Handover note saved.");
      return;
    }
    if (!f.matches("[data-issue]")) return;
    const say = (msg) => {
      q("[data-form-error]").textContent = msg;
      q("[data-status]").textContent = msg;
    };
    const r = getReq(s.issueReq);
    const units = form.getAll("unit").map(getAsset);
    if (!r || !units.length) return say("Pick at least one unit to hand over.");
    // Re-check every unit at save time: approved type, on the shelf, not picked twice, within the approved quantity.
    const free = kit(r).filter((x) => !x.loan).map((x) => x.type);
    if (new Set(units).size !== units.length) return say("Each unit can go out only once.");
    for (const u of units) {
      const i = u ? free.indexOf(u.type) : -1;
      if (i < 0 || u.repair || out(u.id))
        return say((u ? u.id : "A unit") + " can’t go out on " + r.id + ". Pick again.");
      free.splice(i, 1);
    }
    const roll = String(form.get("roll")).trim().toUpperCase();
    const who = await verify(r.id, roll, String(form.get("password")));
    if (!who.ok) return say(who.message);
    let num = Math.max(...s.loans.map((l) => l.num));
    const made = units.map((u) => {
      num += 1;
      s.loans.push({ num, req: r.id, asset: u.id, who: who.name, due: r.due, back: false });
      return u.id + " (L-" + num + ")";
    });
    s.editing = false;
    commit("Issued " + made.join(", ") + " to " + who.name + " · " + who.roll + ". Due " + r.due + ".");
  });
  function restore(d) {
    // Student-filed requests must be known before loans that point at them are checked.
    s.extra =
      d && Array.isArray(d.extra)
        ? d.extra.filter((r) => r && typeof r.id === "string" && Array.isArray(r.items) && Array.isArray(r.collectors))
        : [];
    if (
      !d ||
      d.version !== 1 ||
      !Object.hasOwn(screens, d.tab) ||
      !shifts[d.phase] ||
      (d.selected && !getReq(d.selected)) ||
      !Array.isArray(d.notes) ||
      !d.notes.every(
        (n) => n && shifts[n.phase] && typeof n.text === "string",
      ) ||
      !Array.isArray(d.loans) ||
      !d.loans.length ||
      !d.loans.every(
        (l) =>
          l && getReq(l.req) && getAsset(l.asset) && Number.isInteger(l.num),
      )
    ) {
      s.extra = [];
      return;
    }
    s = {
      ...original(),
      ...d,
      extra: s.extra,
      loans: d.loans.map((l) => ({ ...l })),
      notes: d.notes.map((n) => ({ ...n })),
    };
    const known = s.user && person(s.user.roll);
    s.user = known ? { roll: known.roll, name: known.name, role: known.role || "student" } : null;
    if (!getReq(s.issueReq)) s.issueReq = "";
    paint();
  }
  paint();
  try {
    restore(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    // Keep the fresh shift when storage is unavailable or the saved data is invalid.
  }
})();
