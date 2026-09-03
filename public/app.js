/* =========================================================
   THE BG WEB — FRONTEND
   FULL REPLACEMENT APP.JS
   Compatible with the current THE BG WEB server.js
========================================================= */

const app = document.getElementById('app');

const state = {
  me: null,

  data: {
    departments: [],
    users: [],
    tasks: [],
    reports: [],
    activities: [],
    goals: [],
    motorcycles: [],
    income: [],
    expenses: [],
    maintenance: [],
    assignments: [],
    odometer: [],
    dailyClosings: [],
    evidence: [],
    audit: [],
    changes: []
  },

  page: 'dashboard',

  alerts: [],
  fleet: null
};

/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const today = () =>
  new Date().toISOString().slice(0, 10);

const money = value =>
  Number(value || 0).toLocaleString('en-US') + ' RWF';

const esc = value =>
  String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

function safeDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function userName(user) {
  return (
    user?.full_name ||
    user?.name ||
    user?.username ||
    '-'
  );
}

function departmentCode(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    if (/^D[1-5]$/i.test(value)) {
      return value.toUpperCase();
    }
  }

  return '';
}

function findUser(id) {
  return state.data.users.find(
    u => Number(u.id) === Number(id)
  );
}

function getUserNameById(id) {
  const u = findUser(id);
  return u ? userName(u) : '-';
}

function getDepartment(codeOrId) {
  if (
    typeof codeOrId === 'string' &&
    /^D[1-5]$/i.test(codeOrId)
  ) {
    return state.data.departments.find(
      d =>
        String(d.code || '').toUpperCase() ===
        String(codeOrId).toUpperCase()
    );
  }

  return state.data.departments.find(
    d => Number(d.id) === Number(codeOrId)
  );
}

function getDepartmentCodeFromUser(u) {
  if (!u) return '';

  if (u.department_code) {
    return String(u.department_code).toUpperCase();
  }

  if (u.department_id) {
    const d = getDepartment(u.department_id);
    return d?.code || '';
  }

  return '';
}

function getDepartmentName(codeOrId) {
  const d = getDepartment(codeOrId);
  return d?.name || d?.position || '-';
}

function getDepartmentOfficer(d) {
  return (
    d?.officer ||
    d?.person ||
    '-'
  );
}

function getTaskTitle(t) {
  return (
    t?.title ||
    t?.name ||
    '-'
  );
}

function getTaskResponsibleId(t) {
  return (
    t?.responsible_id ??
    t?.responsible_user ??
    null
  );
}

function getTaskDeadline(t) {
  return (
    t?.due_date ||
    t?.deadline ||
    ''
  );
}

function getTaskCreatedBy(t) {
  return (
    t?.created_by ??
    t?.created_by_id ??
    null
  );
}

function getReportTitle(r) {
  return (
    r?.title ||
    r?.type ||
    'Report'
  );
}

function getReportContent(r) {
  return (
    r?.content ||
    r?.body ||
    ''
  );
}

function getReportDate(r) {
  return (
    r?.report_date ||
    r?.date ||
    ''
  );
}

function getActivityDate(a) {
  return (
    a?.activity_date ||
    a?.date ||
    ''
  );
}

function getActivityText(a) {
  return (
    a?.description ||
    a?.done ||
    a?.title ||
    ''
  );
}

function getGoalTarget(g) {
  return Number(
    g?.target ??
    g?.target_value ??
    0
  );
}

function getGoalProgress(g) {
  return Number(
    g?.progress ??
    g?.achieved ??
    0
  );
}

function getMotoPlate(m) {
  return (
    m?.plate_number ||
    m?.plate ||
    '-'
  );
}

function getMotoModel(m) {
  return m?.model || '-';
}

function getMotoStatus(m) {
  return m?.status || '-';
}

function getMotoCode(m) {
  return (
    m?.code ||
    m?.motorcycle_code ||
    m?.plate_number ||
    `MOTO-${m?.id || ''}`
  );
}

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const isForm =
    options.body instanceof FormData;

  const headers = {
    ...(isForm
      ? {}
      : {
          'Content-Type': 'application/json'
        }),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers
  });

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

/* =========================================================
   NORMALIZE DATA
========================================================= */

function normalizeUser(u) {
  if (!u) return null;

  const code =
    u.department_code ||
    departmentCode(u.department_id);

  return {
    ...u,
    name:
      u.full_name ||
      u.name ||
      u.username ||
      '-',

    full_name:
      u.full_name ||
      u.name ||
      u.username ||
      '-',

    department_code:
      code || '',

    department_name:
      u.department_name ||
      getDepartmentName(code || u.department_id)
  };
}

function normalizeDepartment(d) {
  return {
    ...d,

    code:
      d.code ||
      d.id ||
      '',

    name:
      d.name ||
      d.position ||
      '',

    officer:
      d.officer ||
      d.person ||
      '',

    description:
      d.description ||
      d.responsibility ||
      ''
  };
}

function normalizeTask(t) {
  const responsibleId =
    t.responsible_id ??
    t.responsible_user ??
    null;

  const responsible =
    t.responsible_name ||
    t.responsible_full_name ||
    getUserNameById(responsibleId);

  return {
    ...t,

    title:
      t.title ||
      t.name ||
      '-',

    responsible_id:
      responsibleId,

    responsible_name:
      responsible,

    due_date:
      t.due_date ||
      t.deadline ||
      '',

    department_code:
      t.department_code ||
      '',

    description:
      t.description ||
      '',

    status:
      t.status ||
      'Not Started',

    priority:
      t.priority ||
      'Normal'
  };
}

function normalizeReport(r) {
  return {
    ...r,

    title:
      r.title ||
      r.type ||
      'Report',

    content:
      r.content ||
      r.body ||
      '',

    report_date:
      r.report_date ||
      r.date ||
      '',

    user_name:
      r.user_name ||
      r.full_name ||
      getUserNameById(r.user_id),

    status:
      r.status ||
      'Submitted'
  };
}

function normalizeActivity(a) {
  return {
    ...a,

    activity_date:
      a.activity_date ||
      a.date ||
      '',

    description:
      a.description ||
      a.done ||
      a.title ||
      '',

    user_name:
      a.user_name ||
      a.full_name ||
      getUserNameById(a.user_id)
  };
}

function normalizeGoal(g) {
  return {
    ...g,

    title:
      g.title ||
      'Goal',

    description:
      g.description ||
      '',

    target:
      getGoalTarget(g),

    achieved:
      getGoalProgress(g),

    target_date:
      g.target_date ||
      g.period ||
      '',

    status:
      g.status ||
      'Active'
  };
}

function normalizeMoto(m) {
  return {
    ...m,

    code:
      getMotoCode(m),

    plate:
      getMotoPlate(m),

    model:
      getMotoModel(m),

    status:
      getMotoStatus(m)
  };
}

function normalizeIncome(x) {
  return {
    ...x,

    date:
      x.income_date ||
      x.date ||
      '',

    motorcycle_code:
      x.motorcycle_code ||
      x.code ||
      '-',

    entered_by_name:
      x.entered_by_name ||
      x.entered_name ||
      getUserNameById(x.entered_by),

    verified:
      Boolean(
        x.verified_at ||
        x.verified_by ||
        x.status === 'Verified'
      )
  };
}

function normalizeExpense(x) {
  return {
    ...x,

    date:
      x.expense_date ||
      x.date ||
      '',

    expense_type:
      x.category ||
      x.expense_type ||
      'Other',

    motorcycle_code:
      x.motorcycle_code ||
      x.code ||
      '-',

    entered_by_name:
      x.entered_by_name ||
      x.entered_name ||
      getUserNameById(x.entered_by)
  };
}

/* =========================================================
   LOAD
========================================================= */

async function load() {
  const bootstrap =
    await api('/api/bootstrap');

  const departments =
    Array.isArray(bootstrap.departments)
      ? bootstrap.departments.map(normalizeDepartment)
      : [];

  state.data.departments =
    departments;

  const users =
    Array.isArray(bootstrap.users)
      ? bootstrap.users.map(normalizeUser)
      : [];

  state.data.users =
    users;

  state.data.tasks =
    Array.isArray(bootstrap.tasks)
      ? bootstrap.tasks.map(normalizeTask)
      : [];

  state.data.reports =
    Array.isArray(bootstrap.reports)
      ? bootstrap.reports.map(normalizeReport)
      : [];

  state.data.activities =
    Array.isArray(bootstrap.activities)
      ? bootstrap.activities.map(normalizeActivity)
      : [];

  state.data.goals =
    Array.isArray(bootstrap.goals)
      ? bootstrap.goals.map(normalizeGoal)
      : [];

  state.data.motorcycles =
    Array.isArray(bootstrap.motorcycles)
      ? bootstrap.motorcycles.map(normalizeMoto)
      : [];

  state.data.income =
    Array.isArray(bootstrap.income)
      ? bootstrap.income.map(normalizeIncome)
      : [];

  state.data.expenses =
    Array.isArray(bootstrap.expenses)
      ? bootstrap.expenses.map(normalizeExpense)
      : [];

  state.data.maintenance =
    Array.isArray(bootstrap.maintenance)
      ? bootstrap.maintenance
      : [];

  state.data.assignments =
    Array.isArray(bootstrap.assignments)
      ? bootstrap.assignments
      : [];

  state.data.odometer =
    Array.isArray(bootstrap.odometer)
      ? bootstrap.odometer
      : [];

  state.data.dailyClosings =
    Array.isArray(bootstrap.dailyClosings)
      ? bootstrap.dailyClosings
      : [];

  state.data.evidence =
    Array.isArray(bootstrap.evidence)
      ? bootstrap.evidence
      : [];

  state.data.audit =
    Array.isArray(bootstrap.audit)
      ? bootstrap.audit
      : [];

  state.data.changes =
    Array.isArray(
      bootstrap.financeChanges
    )
      ? bootstrap.financeChanges
      : Array.isArray(bootstrap.changes)
        ? bootstrap.changes
        : [];

  try {
    const result =
      await api('/api/alerts');

    state.alerts =
      Array.isArray(result.alerts)
        ? result.alerts
        : [];
  } catch {
    state.alerts = [];
  }

  try {
    const result =
      await api('/api/fleet-summary');

    state.fleet =
      result.summary || null;
  } catch {
    state.fleet = null;
  }
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function boot() {
  try {
    const result =
      await api('/api/me');

    if (!result.user) {
      throw new Error(
        'Not authenticated'
      );
    }

    state.me =
      normalizeUser(result.user);

    await load();

    render();
  } catch (error) {
    state.me = null;
    login();
  }
}

function login() {
  app.innerHTML = `
    <div class="login">
      <div class="loginbox">

        <div class="brand">
          THE BG
        </div>

        <div class="sub">
          ONE COMPANY MANAGEMENT PLATFORM
        </div>

        <h2>
          Sign in
        </h2>

        <form
          class="form"
          onsubmit="doLogin(event)"
        >

          <label>
            Account
          </label>

          <select
            id="username"
            required
          >

            <option value="d1">
              D1 — MANISHIMWE FARADJI
            </option>

            <option value="d2">
              D2 — AHMED FAZZIR
            </option>

            <option value="d3">
              D3 — NIYITANGA OSAMA
            </option>

            <option value="d4">
              D4 — KIREZI NASSIB
            </option>

            <option value="d5">
              D5 — IMANANIYOGISUBIZO YUSSUF
            </option>

          </select>

          <label>
            Password
          </label>

          <input
            id="password"
            type="password"
            placeholder="Password"
            required
            autocomplete="current-password"
          >

          <button
            class="btn"
            type="submit"
          >
            Sign in
          </button>

        </form>

        <p class="muted">
          Sign in with your THE BG account.
        </p>

      </div>
    </div>
  `;
}

async function doLogin(event) {
  event.preventDefault();

  const username =
    $('username')?.value;

  const password =
    $('password')?.value;

  try {
    await api('/api/login', {
      method: 'POST',

      body: JSON.stringify({
        username,
        password
      })
    });

    await boot();
  } catch (error) {
    alert(
      error.message ||
      'Sign in failed.'
    );
  }
}

async function logout() {
  try {
    await api('/api/logout', {
      method: 'POST'
    });
  } catch {}

  state.me = null;
  state.page = 'dashboard';

  login();
}

/* =========================================================
   PERMISSIONS
========================================================= */

const permissions = {
  D1: [
    'dashboard',
    'departments',
    'tasks',
    'activities',
    'reports',
    'goals',
    'performance',
    'finance',
    'fleet',
    'evidence',
    'audit'
  ],

  D2: [
    'dashboard',
    'departments',
    'tasks',
    'activities',
    'reports',
    'goals',
    'performance',
    'evidence'
  ],

  D3: [
    'dashboard',
    'departments',
    'tasks',
    'activities',
    'reports',
    'goals',
    'performance',
    'finance',
    'fleet',
    'evidence',
    'audit'
  ],

  D4: [
    'dashboard',
    'departments',
    'tasks',
    'activities',
    'reports',
    'goals',
    'performance',
    'fleet',
    'evidence',
    'audit'
  ],

  D5: [
    'dashboard',
    'departments',
    'tasks',
    'activities',
    'reports',
    'goals',
    'performance',
    'evidence',
    'audit'
  ]
};

function myDepartmentCode() {
  return (
    state.me?.department_code ||
    ''
  ).toUpperCase();
}

function can(page) {
  if (!state.me) {
    return false;
  }

  const code =
    myDepartmentCode();

  return (
    permissions[code] || []
  ).includes(page);
}

/* =========================================================
   NAVIGATION
========================================================= */

const nav = [
  ['dashboard', 'Dashboard'],
  ['departments', 'Departments'],
  ['tasks', 'Tasks'],
  ['activities', 'Daily Work'],
  ['reports', 'Reports'],
  ['goals', 'Goals'],
  ['performance', 'Performance'],
  ['finance', 'Finance'],
  ['fleet', 'Motorcycle Fleet'],
  ['evidence', 'Evidence'],
  ['audit', 'Audit Trail']
];

function go(page) {
  if (!can(page)) {
    page = 'dashboard';
  }

  state.page = page;

  render();
}

/* =========================================================
   SHELL
========================================================= */

function shell(title, body) {
  if (!state.me) {
    login();
    return;
  }

  const code =
    myDepartmentCode();

  const dept =
    getDepartment(code);

  const allowed =
    nav.filter(([id]) => can(id));

  const name =
    userName(state.me);

  app.innerHTML = `
    <div class="layout">

      <aside class="sidebar">

        <div class="brand">
          THE BG
        </div>

        <div class="sub">
          MANAGEMENT WEB
        </div>

        <div class="user">

          <b>
            ${esc(name)}
          </b>

          <span>
            ${esc(code)}
            —
            ${esc(
              dept?.name ||
              state.me.department_name ||
              ''
            )}
          </span>

        </div>

        <div class="nav">

          ${allowed.map(
            ([id, label]) => `
              <button
                class="${
                  state.page === id
                    ? 'active'
                    : ''
                }"
                onclick="go('${id}')"
              >
                ${esc(label)}
              </button>
            `
          ).join('')}

          <button
            onclick="logout()"
          >
            Logout
          </button>

        </div>

      </aside>

      <main class="main">

        <header class="top">

          <div>

            <div class="eyebrow">
              THE BG WEB
            </div>

            <h1>
              ${esc(title)}
            </h1>

          </div>

          <div class="badge">

            <b>
              ${esc(code)}
            </b>

            ·

            ${esc(name)}

          </div>

        </header>

        ${body}

      </main>

    </div>

    <nav class="mobile">

      ${[
        ['dashboard', 'Home'],
        ['tasks', 'Tasks'],
        ['finance', 'Finance'],
        ['fleet', 'Fleet'],
        ['audit', 'Audit']
      ]
      .filter(
        ([id]) => can(id)
      )
      .map(
        ([id, label]) => `
          <button
            onclick="go('${id}')"
          >
            ${esc(label)}
          </button>
        `
      )
      .join('')}

    </nav>
  `;
}

const card = (label, value) => `
  <div class="card stat">

    <span>
      ${esc(label)}
    </span>

    <strong>
      ${esc(value)}
    </strong>

  </div>
`;

/* =========================================================
   DASHBOARD
========================================================= */

function dashboard() {
  const d = state.data;

  const income = d.income.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const expenses = d.expenses.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const net = income - expenses;

  const completed = d.tasks.filter(x => x.status === 'Completed').length;

  const overdue = d.tasks.filter(t => {
    const deadline = getTaskDeadline(t);
    return deadline && deadline < today() && t.status !== 'Completed';
  }).length;

  const taskRate = d.tasks.length
    ? Math.round((completed / d.tasks.length) * 100)
    : 0;

  let myPerformance = 0;
  try {
    myPerformance = calculatePerformance(state.me) || 0;
  } catch (e) {
    myPerformance = 0;
  }

  const priorityTasks = [...d.tasks]
    .filter(t => t.status !== 'Completed')
    .sort((a, b) => {
      const priority = { High: 3, Medium: 2, Low: 1 };
      const pa = priority[a.priority] || 0;
      const pb = priority[b.priority] || 0;

      if (pa !== pb) return pb - pa;

      const da = getTaskDeadline(a) || '9999-12-31';
      const db = getTaskDeadline(b) || '9999-12-31';

      return da.localeCompare(db);
    })
    .slice(0, 5);

  const recentActivities = [...d.activities]
    .sort((a, b) => {
      const da = a.activity_date || a.created_at || '';
      const db = b.activity_date || b.created_at || '';
      return String(db).localeCompare(String(da));
    })
    .slice(0, 5);

  const fleetCount = d.motorcycles.length;

  const fleetIncome = d.income
    .filter(x => x.source === 'fleet' || x.type === 'fleet')
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);

  const activeGoals = d.goals
    .filter(g => {
      const status = String(g.status || '').toLowerCase();
      return status !== 'completed' && status !== 'closed';
    })
    .slice(0, 4);

  const departmentRows = d.departments.map(dept => {
    const code = String(dept.code || '').toUpperCase();

    const tasks = d.tasks.filter(t => {
      const taskCode = String(t.department_code || '').toUpperCase();

      if (taskCode === code) return true;

      const user = findUser(getTaskResponsibleId(t));

      return user && getDepartmentCodeFromUser(user) === code;
    });

    const done = tasks.filter(t => t.status === 'Completed').length;

    const score = tasks.length
      ? Math.round((done / tasks.length) * 100)
      : 0;

    return {
      code,
      officer: getDepartmentOfficer(dept),
      tasks: tasks.length,
      done,
      score
    };
  });

  const userName = state.me
    ? userName(state.me)
    : 'User';

  const userDepartment = state.me?.department_code
    ? String(state.me.department_code).toUpperCase()
    : '';

  const userRole = state.me?.role || '';

  shell('THE BG WEB', `
    <div class="dash-wrap">

      <!-- HEADER -->
      <section class="dash-hero">
        <div>
          <div class="dash-eyebrow">THE BG WEB · COMMAND CENTER</div>
          <h1>Good day, ${esc(userName)}</h1>
          <p>
            ${esc(userDepartment)}
            ${userRole ? ` · ${esc(userRole)}` : ''}
          </p>
        </div>

        <div class="dash-hero-badge">
          <span class="dash-live-dot"></span>
          SYSTEM ACTIVE
        </div>
      </section>


      <!-- KPI AREA -->
      <section class="dash-kpis">

        <div class="dash-kpi revenue">
          <div class="dash-kpi-top">
            <span>REVENUE</span>
            <span class="dash-icon">↗</span>
          </div>
          <strong>${money(income)}</strong>
          <small>Total recorded income</small>
        </div>

        <div class="dash-kpi expenses">
          <div class="dash-kpi-top">
            <span>EXPENSES</span>
            <span class="dash-icon">↘</span>
          </div>
          <strong>${money(expenses)}</strong>
          <small>Total recorded expenses</small>
        </div>

        <div class="dash-kpi net">
          <div class="dash-kpi-top">
            <span>NET RESULT</span>
            <span class="dash-icon">◆</span>
          </div>
          <strong>${money(net)}</strong>
          <small>${net >= 0 ? 'Positive business result' : 'Attention required'}</small>
        </div>

        <div class="dash-kpi tasks">
          <div class="dash-kpi-top">
            <span>TASK PERFORMANCE</span>
            <span class="dash-icon">✓</span>
          </div>

          <strong>${taskRate}%</strong>

          <div class="dash-progress">
            <span style="width:${Math.min(taskRate, 100)}%"></span>
          </div>

          <small>${completed} completed · ${overdue} overdue</small>
        </div>

      </section>


      <!-- MAIN AREA -->
      <section class="dash-main-grid">

        <!-- BUSINESS PERFORMANCE -->
        <div class="dash-panel dash-overview">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">BUSINESS OVERVIEW</span>
              <h2>Performance Overview</h2>
            </div>

            <div class="dash-score">
              <strong>${myPerformance}%</strong>
              <span>My Score</span>
            </div>
          </div>

          <div class="dash-overview-body">

            <div class="dash-big-number">
              <span>NET BUSINESS RESULT</span>
              <strong>${money(net)}</strong>
              <p>
                Revenue ${money(income)}
                <span>−</span>
                Expenses ${money(expenses)}
              </p>
            </div>

            <div class="dash-mini-grid">

              <div class="dash-mini">
                <span>ALL TASKS</span>
                <strong>${d.tasks.length}</strong>
              </div>

              <div class="dash-mini">
                <span>COMPLETED</span>
                <strong>${completed}</strong>
              </div>

              <div class="dash-mini">
                <span>OVERDUE</span>
                <strong>${overdue}</strong>
              </div>

              <div class="dash-mini">
                <span>ACTIVE USERS</span>
                <strong>${d.users.filter(x => x.active).length}</strong>
              </div>

            </div>

          </div>

        </div>


        <!-- PRIORITY TASKS -->
        <div class="dash-panel dash-priority">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">WORK CONTROL</span>
              <h2>Priority Tasks</h2>
            </div>

            <span class="dash-count">${priorityTasks.length}</span>
          </div>

          <div class="dash-task-list">

            ${
              priorityTasks.length
                ? priorityTasks.map(task => {
                    const title = getTaskTitle(task);
                    const responsible = findUser(getTaskResponsibleId(task));
                    const responsibleName = responsible
                      ? userName(responsible)
                      : 'Unassigned';

                    const deadline = getTaskDeadline(task);
                    const isOverdue =
                      deadline &&
                      deadline < today() &&
                      task.status !== 'Completed';

                    const p = String(task.priority || 'Normal');

                    return `
                      <div class="dash-task-item">

                        <div class="dash-task-mark ${p.toLowerCase()}"></div>

                        <div class="dash-task-content">
                          <strong>${esc(title)}</strong>

                          <span>
                            ${esc(responsibleName)}
                            ${deadline ? ` · ${esc(deadline)}` : ''}
                          </span>
                        </div>

                        <div class="dash-task-status ${isOverdue ? 'danger' : ''}">
                          ${isOverdue ? 'OVERDUE' : esc(p.toUpperCase())}
                        </div>

                      </div>
                    `;
                  }).join('')
                : `
                  <div class="dash-empty">
                    <strong>No pending priority tasks</strong>
                    <span>Everything is currently under control.</span>
                  </div>
                `
            }

          </div>

        </div>

      </section>


      <!-- SECOND AREA -->
      <section class="dash-secondary-grid">

        <!-- FLEET -->
        <div class="dash-panel dash-fleet">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">FLEET MANAGEMENT</span>
              <h2>Motorcycle Fleet</h2>
            </div>

            <span class="dash-panel-number">${fleetCount}</span>
          </div>

          <div class="dash-fleet-main">

            <div class="dash-fleet-ring">
              <strong>${fleetCount}</strong>
              <span>BIKES</span>
            </div>

            <div class="dash-fleet-info">

              <div>
                <span>Registered Motorcycles</span>
                <strong>${fleetCount}</strong>
              </div>

              <div>
                <span>Fleet Income</span>
                <strong>${money(fleetIncome)}</strong>
              </div>

            </div>

          </div>

        </div>


        <!-- RECENT ACTIVITY -->
        <div class="dash-panel dash-activity">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">LIVE WORKSPACE</span>
              <h2>Recent Activity</h2>
            </div>
          </div>

          <div class="dash-activity-list">

            ${
              recentActivities.length
                ? recentActivities.map(activity => `
                    <div class="dash-activity-item">

                      <div class="dash-activity-dot"></div>

                      <div>
                        <strong>
                          ${esc(
                            activity.user_name ||
                            activity.user ||
                            getUserNameById(activity.user_id) ||
                            'User'
                          )}
                        </strong>

                        <p>
                          ${esc(
                            activity.description ||
                            activity.details ||
                            activity.activity ||
                            'Work activity recorded'
                          )}
                        </p>

                        <small>
                          ${esc(
                            activity.activity_date ||
                            activity.created_at ||
                            ''
                          )}
                        </small>
                      </div>

                    </div>
                  `).join('')
                : `
                    <div class="dash-empty">
                      <strong>No recent activity</strong>
                      <span>New work activity will appear here.</span>
                    </div>
                  `
            }

          </div>

        </div>

      </section>


      <!-- LOWER AREA -->
      <section class="dash-lower-grid">

        <!-- DEPARTMENTS -->
        <div class="dash-panel dash-departments">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">ORGANIZATION</span>
              <h2>Department Performance</h2>
            </div>
          </div>

          <div class="dash-department-list">

            ${
              departmentRows.length
                ? departmentRows.map(row => `
                    <div class="dash-department">

                      <div class="dash-dept-code">
                        ${esc(row.code)}
                      </div>

                      <div class="dash-dept-info">
                        <strong>${esc(row.officer)}</strong>

                        <span>
                          ${row.done}/${row.tasks} tasks completed
                        </span>

                        <div class="dash-progress">
                          <span style="width:${Math.min(row.score, 100)}%"></span>
                        </div>
                      </div>

                      <strong class="dash-dept-score">
                        ${row.score}%
                      </strong>

                    </div>
                  `).join('')
                : `
                    <div class="dash-empty">
                      <strong>No department data</strong>
                    </div>
                  `
            }

          </div>

        </div>


        <!-- GOALS -->
        <div class="dash-panel dash-goals">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">STRATEGY</span>
              <h2>Active Goals</h2>
            </div>

            <span class="dash-count">${activeGoals.length}</span>
          </div>

          <div class="dash-goal-list">

            ${
              activeGoals.length
                ? activeGoals.map(goal => {

                    const progress = Math.max(
                      0,
                      Math.min(
                        100,
                        Number(
                          goal.progress ||
                          goal.percentage ||
                          goal.completion ||
                          0
                        )
                      )
                    );

                    return `
                      <div class="dash-goal">

                        <div class="dash-goal-head">
                          <strong>
                            ${esc(
                              goal.title ||
                              goal.name ||
                              'Untitled Goal'
                            )}
                          </strong>

                          <span>${progress}%</span>
                        </div>

                        <div class="dash-progress">
                          <span style="width:${progress}%"></span>
                        </div>

                      </div>
                    `;
                  }).join('')
                : `
                    <div class="dash-empty">
                      <strong>No active goals</strong>
                      <span>Strategic goals will appear here.</span>
                    </div>
                  `
            }

          </div>

        </div>


        <!-- ALERTS -->
        <div class="dash-panel dash-alerts">

          <div class="dash-panel-head">
            <div>
              <span class="dash-label">SYSTEM MONITOR</span>
              <h2>Alerts</h2>
            </div>

            <span class="dash-count">
              ${state.alerts.length}
            </span>
          </div>

          <div class="dash-alert-list">

            ${
              state.alerts.length
                ? state.alerts.slice(0, 5).map(alert => `
                    <div class="dash-alert-item ${esc(alert.severity || 'info')}">

                      <div class="dash-alert-symbol">!</div>

                      <div>
                        <strong>${esc(alert.title || '')}</strong>
                        <span>${esc(alert.message || '')}</span>
                      </div>

                    </div>
                  `).join('')
                : `
                    <div class="dash-empty">
                      <strong>All clear</strong>
                      <span>No active system alerts.</span>
                    </div>
                  `
            }

          </div>

        </div>

      </section>

    </div>
  `);
}
                );

              const tasks =
                departmentTasks.length
                  ? departmentTasks
                  : responsibleTasks;

              const score =
                tasks.length
                  ? Math.round(
                      tasks.filter(
                        t =>
                          t.status ===
                          'Completed'
                      ).length /
                      tasks.length *
                      100
                    )
                  : 0;

              return `
                <div class="row">

                  <b>
                    ${esc(code)}
                  </b>

                  <span>
                    ${esc(
                      getDepartmentOfficer(
                        dept
                      )
                    )}
                  </span>

                  <b>
                    ${score}%
                  </b>

                </div>
              `;
            }
          ).join('')}

        </div>

        <div class="card">

          <h2>
            Alerts
          </h2>

          ${
            state.alerts.length
              ? state.alerts
                  .slice(0, 8)
                  .map(
                    alert => `
                      <div
                        class="alert ${
                          esc(
                            alert.severity ||
                            'info'
                          )
                        }"
                      >

                        <b>
                          ${esc(
                            alert.title ||
                            ''
                          )}
                        </b>

                        <div>
                          ${esc(
                            alert.message ||
                            ''
                          )}
                        </div>

                      </div>
                    `
                  )
                  .join('')
              : `
                <p class="muted">
                  No active alerts.
                </p>
              `
          }

        </div>

      </div>
    `
  );
}

/* =========================================================
   DEPARTMENTS
========================================================= */

function departments() {
  const myCode =
    myDepartmentCode();

  shell(
    'Departments',
    `
      <div class="grid">

        ${state.data.departments.map(
          d => {

            const code =
              String(
                d.code || ''
              ).toUpperCase();

            const mine =
              code === myCode;

            const departmentUsers =
              state.data.users.filter(
                u =>
                  getDepartmentCodeFromUser(
                    u
                  ) === code
              );

            const departmentTasks =
              state.data.tasks.filter(
                t => {
                  const responsible =
                    findUser(
                      getTaskResponsibleId(t)
                    );

                  return (
                    String(
                      t.department_code ||
                      ''
                    ).toUpperCase() ===
                      code ||
                    (
                      responsible &&
                      getDepartmentCodeFromUser(
                        responsible
                      ) === code
                    )
                  );
                }
              );

            const reports =
              state.data.reports.filter(
                r => {
                  const u =
                    findUser(
                      r.user_id
                    );

                  return (
                    u &&
                    getDepartmentCodeFromUser(
                      u
                    ) === code
                  );
                }
              );

            return `
              <div class="card">

                <span class="eyebrow">

                  ${esc(code)}

                  ${
                    mine
                      ? ' · YOUR WORKSPACE'
                      : ''
                  }

                </span>

                <h2>
                  ${esc(
                    d.name
                  )}
                </h2>

                <h3>
                  ${esc(
                    getDepartmentOfficer(
                      d
                    )
                  )}
                </h3>

                <p>
                  ${esc(
                    d.description
                  )}
                </p>

                <div class="tag">
                  ${departmentUsers.length}
                  account(s)
                </div>

                <div class="row">

                  <span>
                    Tasks
                  </span>

                  <b>
                    ${departmentTasks.length}
                  </b>

                </div>

                <div class="row">

                  <span>
                    Reports
                  </span>

                  <b>
                    ${reports.length}
                  </b>

                </div>

              </div>
            `;
          }
        ).join('')}

      </div>

      ${
        myCode === 'D1'
          ? `
            <div class="section card">

              <h2>
                Account Control
              </h2>

              <p>
                D1 is the system-level administration
                department. User account management is
                controlled through the secure server API.
              </p>

              <div class="tablewrap">

                <table class="table">

                  <tr>
                    <th>Account</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Status</th>
                  </tr>

                  ${state.data.users.map(
                    u => `
                      <tr>

                        <td>
                          ${esc(
                            u.username
                          )}
                        </td>

                        <td>
                          ${esc(
                            userName(u)
                          )}
                        </td>

                        <td>
                          ${esc(
                            getDepartmentCodeFromUser(
                              u
                            )
                          )}
                        </td>

                        <td>
                          ${
                            u.active
                              ? 'Active'
                              : 'Inactive'
                          }
                        </td>

                      </tr>
                    `
                  ).join('')}

                </table>

              </div>

            </div>
          `
          : ''
      }
    `
  );
}

/* =========================================================
   TASKS
========================================================= */

function tasks() {
  const myCode =
    myDepartmentCode();

  const users =
    state.data.users.filter(
      u =>
        u.active &&
        (
          myCode === 'D1' ||
          getDepartmentCodeFromUser(
            u
          ) === myCode
        )
    );

  const statuses = [
    'Not Started',
    'Accepted',
    'Rejected',
    'In Progress',
    'Completed',
    'Cancelled',
    'On Hold'
  ];

  shell(
    'Tasks',
    `
      <div class="card">

        <h2>
          Create Task
        </h2>

        <form
          class="form"
          onsubmit="createTask(event)"
        >

          <div class="two">

            <input
              id="tn"
              placeholder="Task title"
              required
            >

            <select
              id="tu"
              required
            >

              ${
                users.length
                  ? users.map(
                      u => `
                        <option
                          value="${u.id}"
                        >
                          ${esc(
                            getDepartmentCodeFromUser(
                              u
                            )
                          )}
                          —
                          ${esc(
                            userName(u)
                          )}
                        </option>
                      `
                    ).join('')
                  : `
                    <option value="">
                      No available users
                    </option>
                  `
              }

            </select>

          </div>

          <div class="two">

            <input
              id="ts"
              type="date"
              value="${today()}"
              required
            >

            <input
              id="td"
              type="date"
            >

          </div>

          <div class="two">

            <select id="tp">
              <option>Normal</option>
              <option>High</option>
              <option>Low</option>
            </select>

            <textarea
              id="tx"
              placeholder="Description"
            ></textarea>

          </div>

          <button
            class="btn"
            type="submit"
          >
            Create Task
          </button>

        </form>

      </div>

      <div class="card section tablewrap">

        <h2>
          Task Register
        </h2>

        <table class="table">

          <tr>

            <th>
              Task
            </th>

            <th>
              Responsible
            </th>

            <th>
              Deadline
            </th>

            <th>
              Priority
            </th>

            <th>
              Status
            </th>

          </tr>

          ${
            state.data.tasks.length
              ? state.data.tasks.map(
                  t => {

                    const responsibleId =
                      getTaskResponsibleId(t);

                    const isResponsible =
                      Number(
                        responsibleId
                      ) ===
                      Number(
                        state.me.id
                      );

                    const canControl =
                      myCode === 'D1' ||
                      isResponsible;

                    return `
                      <tr>

                        <td>

                          <b>
                            ${esc(
                              getTaskTitle(t)
                            )}
                          </b>

                          <small>
                            ${esc(
                              t.description ||
                              ''
                            )}
                          </small>

                        </td>

                        <td>
                          ${esc(
                            t.responsible_name ||
                            getUserNameById(
                              responsibleId
                            )
                          )}
                        </td>

                        <td>
                          ${esc(
                            getTaskDeadline(t) ||
                            '-'
                          )}
                        </td>

                        <td>
                          ${esc(
                            t.priority ||
                            'Normal'
                          )}
                        </td>

                        <td>

                          ${
                            canControl
                              ? `
                                <select
                                  onchange="changeTask(
                                    ${t.id},
                                    this.value
                                  )"
                                >

                                  ${statuses.map(
                                    s => `
                                      <option
                                        value="${esc(
                                          s
                                        )}"
                                        ${
                                          s ===
                                          t.status
                                            ? 'selected'
                                            : ''
                                        }
                                      >
                                        ${esc(s)}
                                      </option>
                                    `
                                  ).join('')}

                                </select>
                              `
                              : `
                                <span class="tag">
                                  ${esc(
                                    t.status
                                  )}
                                </span>
                              `
                          }

                        </td>

                      </tr>
                    `;
                  }
                ).join('')
              : `
                <tr>
                  <td colspan="5">
                    <p class="muted">
                      No tasks available.
                    </p>
                  </td>
                </tr>
              `
          }

        </table>

      </div>
    `
  );
}

async function createTask(event) {
  event.preventDefault();

  try {
    await api('/api/tasks', {
      method: 'POST',

      body: JSON.stringify({
        title:
          $('tn').value,

        responsible_id:
          Number(
            $('tu').value
          ),

        department_id:
          Number(
            findUser(
              Number(
                $('tu').value
              )
            )?.department_id ||
            state.me.department_id
          ),

        start_date:
          $('ts').value,

        due_date:
          $('td').value || null,

        priority:
          $('tp').value,

        description:
          $('tx').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function changeTask(
  id,
  status
) {
  try {
    let reason = '';

    if (status === 'Rejected') {
      reason =
        prompt(
          'Reason for rejecting this task:'
        ) || '';

      if (!reason.trim()) {
        await refresh();
        return;
      }
    }

    await api(
      `/api/tasks/${id}`,
      {
        method: 'PATCH',

        body: JSON.stringify({
          status,
          rejection_reason:
            reason,
          reason
        })
      }
    );

    await refresh();

  } catch (error) {
    alert(error.message);
    await refresh();
  }
}

/* =========================================================
   DAILY WORK
========================================================= */

function activities() {
  shell(
    'Daily Work',
    `
      <div class="card">

        <h2>
          Daily Activity
        </h2>

        <form
          class="form"
          onsubmit="saveActivity(event)"
        >

          <input
            id="adate"
            type="date"
            value="${today()}"
            required
          >

          <textarea
            id="adone"
            placeholder="What did you complete today?"
            required
          ></textarea>

          <textarea
            id="aunfinished"
            placeholder="What remains unfinished?"
          ></textarea>

          <textarea
            id="areason"
            placeholder="Reason if unfinished"
          ></textarea>

          <input
            id="atime"
            type="number"
            min="0"
            step="0.5"
            placeholder="Time spent (hours)"
          >

          <button
            class="btn"
            type="submit"
          >
            Save Daily Activity
          </button>

        </form>

      </div>

      <div class="section grid">

        ${
          state.data.activities.length
            ? state.data.activities
                .slice(0, 30)
                .map(
                  a => `
                    <div class="card">

                      <b>
                        ${esc(
                          a.user_name ||
                          getUserNameById(
                            a.user_id
                          )
                        )}
                      </b>

                      ·

                      ${esc(
                        getActivityDate(a)
                      )}

                      <p>
                        ${esc(
                          getActivityText(a)
                        )}
                      </p>

                      ${
                        a.unfinished
                          ? `
                            <small>
                              Unfinished:
                              ${esc(
                                a.unfinished
                              )}
                            </small>
                          `
                          : ''
                      }

                    </div>
                  `
                )
                .join('')
            : `
              <div class="card">
                <p class="muted">
                  No daily activities yet.
                </p>
              </div>
            `
        }

      </div>
    `
  );
}

async function saveActivity(event) {
  event.preventDefault();

  try {
    await api('/api/activities', {
      method: 'POST',

      body: JSON.stringify({
        activity_date:
          $('adate').value,

        title:
          'Daily Work',

        description:
          $('adone').value,

        unfinished:
          $('aunfinished').value,

        reason:
          $('areason').value,

        time_spent:
          Number(
            $('atime').value || 0
          )
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================================================
   REPORTS
========================================================= */

function reports() {
  shell(
    'Reports',
    `
      <div class="card">

        <h2>
          Submit Report
        </h2>

        <form
          class="form"
          onsubmit="createReport(event)"
        >

          <div class="two">

            <select id="rt">

              <option>
                Daily Report
              </option>

              <option>
                Weekly Report
              </option>

              <option>
                Monthly Report
              </option>

              <option>
                Project Report
              </option>

              <option>
                Financial Report
              </option>

            </select>

            <input
              id="rdate"
              type="date"
              value="${today()}"
              required
            >

          </div>

          <textarea
            id="rb"
            rows="7"
            placeholder="Write report..."
            required
          ></textarea>

          <button
            class="btn"
            type="submit"
          >
            Submit Report
          </button>

        </form>

      </div>

      <div class="section grid">

        ${
          state.data.reports.length
            ? state.data.reports.map(
                r => `
                  <div class="card">

                    <span class="tag">
                      ${esc(
                        getReportTitle(r)
                      )}
                    </span>

                    <p>
                      ${esc(
                        getReportContent(r)
                      )}
                    </p>

                    <small>
                      ${esc(
                        r.user_name ||
                        getUserNameById(
                          r.user_id
                        )
                      )}

                      ·

                      ${esc(
                        getReportDate(r)
                      )}

                      ·

                      ${esc(
                        r.status ||
                        'Submitted'
                      )}

                    </small>

                  </div>
                `
              ).join('')
            : `
              <div class="card">
                <p class="muted">
                  No reports yet.
                </p>
              </div>
            `
        }

      </div>
    `
  );
}

async function createReport(event) {
  event.preventDefault();

  try {
    await api('/api/reports', {
      method: 'POST',

      body: JSON.stringify({
        title:
          $('rt').value,

        content:
          $('rb').value,

        report_date:
          $('rdate').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================================================
   GOALS
========================================================= */

function goals() {
  shell(
    'Goals & Objectives',
    `
      <div class="card">

        <h2>
          Create Goal
        </h2>

        <form
          class="form"
          onsubmit="createGoal(event)"
        >

          <input
            id="gt"
            placeholder="Goal title"
            required
          >

          <textarea
            id="gd"
            placeholder="Goal description"
          ></textarea>

          <div class="two">

            <input
              id="gtarget"
              type="number"
              min="1"
              value="100"
              placeholder="Target"
              required
            >

            <input
              id="gdate"
              type="date"
            >

          </div>

          <button
            class="btn"
            type="submit"
          >
            Create Goal
          </button>

        </form>

      </div>

      <div class="section grid">

        ${
          state.data.goals.length
            ? state.data.goals.map(
                g => {

                  const target =
                    getGoalTarget(g);

                  const achieved =
                    getGoalProgress(g);

                  const percentage =
                    target > 0
                      ? Math.min(
                          100,
                          Math.round(
                            achieved /
                            target *
                            100
                          )
                        )
                      : 0;

                  return `
                    <div class="card">

                      <b>
                        ${esc(
                          g.title
                        )}
                      </b>

                      <p>
                        ${esc(
                          g.description ||
                          ''
                        )}
                      </p>

                      <div class="progress">
                        <i
                          style="width:${percentage}%"
                        ></i>
                      </div>

                      <div class="row">

                        <span>
                          ${achieved}
                          /
                          ${target}
                        </span>

                        <b>
                          ${percentage}%
                        </b>

                      </div>

                      <button
                        class="btn light"
                        onclick="updateGoal(
                          ${g.id},
                          ${achieved}
                        )"
                      >
                        Update achievement
                      </button>

                    </div>
                  `;
                }
              ).join('')
            : `
              <div class="card">
                <p class="muted">
                  No goals yet.
                </p>
              </div>
            `
        }

      </div>
    `
  );
}

async function createGoal(event) {
  event.preventDefault();

  try {
    await api('/api/goals', {
      method: 'POST',

      body: JSON.stringify({
        title:
          $('gt').value,

        description:
          $('gd').value,

        department_id:
          Number(
            state.me.department_id
          ),

        target_date:
          $('gdate').value ||
          null,

        progress: 0
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function updateGoal(
  id,
  current
) {
  const value =
    prompt(
      'New progress value:',
      current
    );

  if (value === null) {
    return;
  }

  const progress =
    Number(value);

  if (
    !Number.isFinite(progress) ||
    progress < 0
  ) {
    alert(
      'Please enter a valid number.'
    );
    return;
  }

  try {
    await api(
      `/api/goals/${id}`,
      {
        method: 'PATCH',

        body: JSON.stringify({
          progress
        })
      }
    );

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================================================
   PERFORMANCE
========================================================= */

function calculatePerformance(user) {
  const tasks =
    state.data.tasks.filter(
      t =>
        Number(
          getTaskResponsibleId(t)
        ) ===
        Number(user.id)
    );

  const completed =
    tasks.filter(
      t =>
        t.status ===
        'Completed'
    );

  const rejected =
    tasks.filter(
      t =>
        t.status ===
        'Rejected'
    );

  const activities =
    state.data.activities.filter(
      a =>
        Number(a.user_id) ===
        Number(user.id)
    );

  const reports =
    state.data.reports.filter(
      r =>
        Number(r.user_id) ===
        Number(user.id)
    );

  const completedOnTime =
    completed.filter(
      t => {

        const deadline =
          getTaskDeadline(t);

        if (!deadline) {
          return true;
        }

        const completedAt =
          safeDate(
            t.completed_at
          );

        if (!completedAt) {
          return false;
        }

        return (
          completedAt <=
          safeDate(deadline)
        );
      }
    );

  const completionScore =
    tasks.length
      ? completed.length /
        tasks.length *
        60
      : 0;

  const timingScore =
    tasks.length
      ? completedOnTime.length /
        tasks.length *
        20
      : 0;

  const activityScore =
    activities.length
      ? 10
      : 0;

  const reportScore =
    reports.length
      ? 10
      : 0;

  const score =
    Math.min(
      100,
      Math.round(
        completionScore +
        timingScore +
        activityScore +
        reportScore
      )
    );

  return {
    user,
    tasks: tasks.length,
    completed: completed.length,
    rejected: rejected.length,
    activities: activities.length,
    reports: reports.length,
    score
  };
}

function performance() {
  const all =
    state.data.users
      .filter(u => u.active)
      .map(
        calculatePerformance
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const mine =
    calculatePerformance(
      state.me
    );

  shell(
    'Performance',
    `
      <div class="grid">

        ${card(
          'Your Score',
          `${mine.score}%`
        )}

        ${card(
          'Your Tasks',
          mine.tasks
        )}

        ${card(
          'Completed',
          mine.completed
        )}

        ${card(
          'Rejected',
          mine.rejected
        )}

        ${card(
          'Daily Activities',
          mine.activities
        )}

        ${card(
          'Reports',
          mine.reports
        )}

      </div>

      <div class="section card">

        <h2>
          My Performance
        </h2>

        <div class="card">

          <h3>
            ${esc(
              userName(
                state.me
              )
            )}
          </h3>

          <p>
            ${esc(
              myDepartmentCode()
            )}
            —
            ${esc(
              state.me.department_name ||
              getDepartmentName(
                myDepartmentCode()
              )
            )}
          </p>

          <div class="progress">
            <i
              style="width:${mine.score}%"
            ></i>
          </div>

          <h2>
            ${mine.score}%
          </h2>

        </div>

      </div>

      <div class="section card">

        <h2>
          System Performance Ranking
        </h2>

        <p class="muted">
          Score is calculated from task completion,
          on-time completion, daily work activity
          and submitted reports.
        </p>

        <div class="tablewrap">

          <table class="table">

            <tr>

              <th>
                #
              </th>

              <th>
                Person
              </th>

              <th>
                Department
              </th>

              <th>
                Tasks
              </th>

              <th>
                Completed
              </th>

              <th>
                Rejected
              </th>

              <th>
                Score
              </th>

            </tr>

            ${all.map(
              (item, index) => `
                <tr>

                  <td>
                    ${index + 1}
                  </td>

                  <td>
                    <b>
                      ${esc(
                        userName(
                          item.user
                        )
                      )}
                    </b>
                  </td>

                  <td>
                    ${esc(
                      getDepartmentCodeFromUser(
                        item.user
                      )
                    )}
                  </td>

                  <td>
                    ${item.tasks}
                  </td>

                  <td>
                    ${item.completed}
                  </td>

                  <td>
                    ${item.rejected}
                  </td>

                  <td>
                    <b>
                      ${item.score}%
                    </b>
                  </td>

                </tr>
              `
            ).join('')}

          </table>

        </div>

      </div>
    `
  );
}

/* =========================================================
   FINANCE
========================================================= */

function finance() {
  const d =
    state.data;

  const income =
    d.income.reduce(
      (sum, x) =>
        sum +
        Number(x.amount || 0),
      0
    );

  const expenses =
    d.expenses.reduce(
      (sum, x) =>
        sum +
        Number(x.amount || 0),
      0
    );

  shell(
    'Finance',
    `
      <div class="grid">

        ${card(
          'Total Income',
          money(income)
        )}

        ${card(
          'Total Expenses',
          money(expenses)
        )}

        ${card(
          'Net Result',
          money(
            income -
            expenses
          )
        )}

        ${card(
          'Pending Changes',
          d.changes.length
        )}

      </div>

      <div class="section card">

        <h2>
          Add Expense
        </h2>

        <form
          class="form"
          onsubmit="addExpense(event)"
        >

          <div class="two">

            <input
              id="edate"
              type="date"
              value="${today()}"
              required
            >

            <input
              id="eamount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount (RWF)"
              required
            >

          </div>

          <div class="two">

            <select id="etype">

              <option>
                Fuel
              </option>

              <option>
                Maintenance
              </option>

              <option>
                Repairs
              </option>

              <option>
                Salary / Commission
              </option>

              <option>
                Other
              </option>

            </select>

            <select id="emoto">

              <option value="">
                Company expense / no motorcycle
              </option>

              ${d.motorcycles.map(
                m => `
                  <option
                    value="${m.id}"
                  >
                    ${esc(
                      getMotoCode(m)
                    )}
                    —
                    ${esc(
                      getMotoPlate(m)
                    )}
                  </option>
                `
              ).join('')}

            </select>

          </div>

          <input
            id="edesc"
            placeholder="Description"
          >

          <button
            class="btn"
            type="submit"
          >
            Save Expense
          </button>

        </form>

      </div>

      ${
        myDepartmentCode() === 'D1'
          ? `
            <div class="section card">

              <h2>
                Pending Finance Changes
              </h2>

              ${
                d.changes.length
                  ? d.changes.map(
                      c => `
                        <div class="change">

                          <b>
                            ${esc(
                              c.reference_type ||
                              c.record_type ||
                              ''
                            )}
                            #${
                              c.reference_id ||
                              c.record_id ||
                              ''
                            }
                          </b>

                          <p>
                            ${esc(
                              c.description ||
                              c.reason ||
                              ''
                            )}
                          </p>

                          <button
                            class="btn"
                            onclick="decision(
                              ${c.id},
                              'Approved'
                            )"
                          >
                            Approve
                          </button>

                          <button
                            class="btn danger"
                            onclick="decision(
                              ${c.id},
                              'Rejected'
                            )"
                          >
                            Reject
                          </button>

                        </div>
                      `
                    ).join('')
                  : `
                    <p class="muted">
                      No pending changes.
                    </p>
                  `
              }

            </div>
          `
          : ''
      }

      <div class="section card tablewrap">

        <h2>
          Expenses
        </h2>

        <table class="table">

          <tr>

            <th>
              Date
            </th>

            <th>
              Type
            </th>

            <th>
              Moto
            </th>

            <th>
              Amount
            </th>

            <th>
              By
            </th>

          </tr>

          ${d.expenses.map(
            x => `
              <tr>

                <td>
                  ${esc(
                    x.date
                  )}
                </td>

                <td>
                  ${esc(
                    x.expense_type
                  )}
                </td>

                <td>
                  ${esc(
                    x.motorcycle_code ||
                    '-'
                  )}
                </td>

                <td>
                  ${money(
                    x.amount
                  )}
                </td>

                <td>
                  ${esc(
                    x.entered_by_name ||
                    '-'
                  )}
                </td>

              </tr>
            `
          ).join('')}

        </table>

      </div>
    `
  );
}

async function addExpense(event) {
  event.preventDefault();

  try {
    await api('/api/expenses', {
      method: 'POST',

      body: JSON.stringify({
        expense_date:
          $('edate').value,

        motorcycle_id:
          $('emoto').value
            ? Number(
                $('emoto').value
              )
            : null,

        category:
          $('etype').value,

        amount:
          Number(
            $('eamount').value
          ),

        description:
          $('edesc').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function decision(
  id,
  decisionValue
) {
  const note =
    prompt(
      'Decision note:'
    ) || '';

  try {
    await api(
      `/api/finance-changes/${id}/decision`,
      {
        method: 'POST',

        body: JSON.stringify({
          decision:
            decisionValue,

          decision_reason:
            note,

          decision_note:
            note
        })
      }
    );

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================================================
   FLEET
========================================================= */

function fleet() {
  const d =
    state.data;

  const summary =
    state.fleet || {};

  const total =
    d.motorcycles.length;

  const active =
    d.motorcycles.filter(
      m =>
        String(
          m.status || ''
        ).toLowerCase() ===
        'active'
    ).length;

  const maintenanceCount =
    d.motorcycles.filter(
      m =>
        String(
          m.status || ''
        ).toLowerCase()
          .includes(
            'maintenance'
          )
    ).length;

  const todayIncome =
    d.income
      .filter(
        x =>
          safeDate(
            x.income_date ||
            x.date
          ) === today()
      )
      .reduce(
        (sum, x) =>
          sum +
          Number(
            x.amount || 0
          ),
        0
      );

  const todayExpenses =
    d.expenses
      .filter(
        x =>
          safeDate(
            x.expense_date ||
            x.date
          ) === today()
      )
      .reduce(
        (sum, x) =>
          sum +
          Number(
            x.amount || 0
          ),
        0
      );

  const fleetIncome =
    Number(
      summary.income ??
      d.income.reduce(
        (sum, x) =>
          sum +
          Number(
            x.amount || 0
          ),
        0
      )
    );

  const fleetExpenses =
    Number(
      summary.expenses ??
      d.expenses.reduce(
        (sum, x) =>
          sum +
          Number(
            x.amount || 0
          ),
        0
      )
    );

  const fleetNet =
    Number(
      summary.net ??
      (
        fleetIncome -
        fleetExpenses
      )
    );

  shell(
    'Motorcycle Fleet',
    `
      <div class="grid">

        ${card(
          'Total',
          total
        )}

        ${card(
          'Active',
          active
        )}

        ${card(
          'Maintenance',
          maintenanceCount
        )}

        ${card(
          "Today's Income",
          money(todayIncome)
        )}

        ${card(
          "Today's Expenses",
          money(todayExpenses)
        )}

        ${card(
          "Today's Net",
          money(
            todayIncome -
            todayExpenses
          )
        )}

        ${card(
          'Fleet Net',
          money(fleetNet)
        )}

      </div>

      <div class="section grid2">

        <div class="card">

          <h2>
            Register Motorcycle
          </h2>

          <form
            class="form"
            onsubmit="addMoto(event)"
          >

            <input
              id="mcode"
              placeholder="Motorcycle ID / Number"
              required
            >

            <input
              id="mplate"
              placeholder="Plate Number"
            >

            <input
              id="mmodel"
              placeholder="Model"
            >

            <div class="two">

              <input
                id="mpdate"
                type="date"
              >

              <input
                id="mprice"
                type="number"
                min="0"
                placeholder="Purchase Price"
              >

            </div>

            <button
              class="btn"
              type="submit"
            >
              Register Motorcycle
            </button>

          </form>

        </div>

        <div class="card">

          <h2>
            Daily Closing
          </h2>

          <form
            class="form"
            onsubmit="closeDay(event)"
          >

            <input
              id="cdate"
              type="date"
              value="${today()}"
            >

            <textarea
              id="cnotes"
              placeholder="Closing notes"
            ></textarea>

            <button
              class="btn"
              type="submit"
            >
              Close Day
            </button>

          </form>

        </div>

      </div>

      <div class="section card tablewrap">

        <h2>
          Motorcycles
        </h2>

        <table class="table">

          <tr>

            <th>
              Motorcycle
            </th>

            <th>
              Plate
            </th>

            <th>
              Model
            </th>

            <th>
              Status
            </th>

            <th>
              Actions
            </th>

          </tr>

          ${
            d.motorcycles.length
              ? d.motorcycles.map(
                  m => `
                    <tr>

                      <td>
                        <b>
                          ${esc(
                            getMotoCode(m)
                          )}
                        </b>
                      </td>

                      <td>
                        ${esc(
                          getMotoPlate(m)
                        )}
                      </td>

                      <td>
                        ${esc(
                          getMotoModel(m)
                        )}
                      </td>

                      <td>
                        ${esc(
                          getMotoStatus(m)
                        )}
                      </td>

                      <td>

                        <button
                          class="btn light"
                          onclick="viewMoto(
                            ${m.id}
                          )"
                        >
                          History
                        </button>

                        ${
                          ['D1', 'D4']
                            .includes(
                              myDepartmentCode()
                            )
                            ? `
                              <button
                                class="btn light"
                                onclick="addIncome(
                                  ${m.id}
                                )"
                              >
                                Income
                              </button>
                            `
                            : ''
                        }

                      </td>

                    </tr>
                  `
                ).join('')
              : `
                <tr>
                  <td colspan="5">
                    <p class="muted">
                      No motorcycles registered yet.
                    </p>
                  </td>
                </tr>
              `
          }

        </table>

      </div>

      <div class="section card">

        <h2>
          Odometer / Mileage
        </h2>

        <form
          class="form"
          onsubmit="addOdometer(event)"
        >

          <div class="two">

            <select
              id="om"
              required
            >

              ${
                d.motorcycles.map(
                  m => `
                    <option
                      value="${m.id}"
                    >
                      ${esc(
                        getMotoCode(m)
                      )}
                    </option>
                  `
                ).join('')
              }

            </select>

            <input
              id="odate"
              type="date"
              value="${today()}"
              required
            >

          </div>

          <input
            id="omile"
            type="number"
            min="0"
            step="0.1"
            placeholder="Current mileage"
            required
          >

          <button
            class="btn"
            type="submit"
          >
            Save Mileage
          </button>

        </form>

      </div>

      <div class="section grid2">

        <div class="card">

          <h2>
            Rider Assignment
          </h2>

          <form
            class="form"
            onsubmit="assignRider(event)"
          >

            <select
              id="am"
              required
            >

              ${d.motorcycles.map(
                m => `
                  <option
                    value="${m.id}"
                  >
                    ${esc(
                      getMotoCode(m)
                    )}
                  </option>
                `
              ).join('')}

            </select>

            <input
              id="ar"
              placeholder="Rider / worker name"
              required
            >

            <input
              id="ap"
              placeholder="Rider phone"
            >

            <input
              id="as"
              type="date"
              value="${today()}"
              required
            >

            <input
              id="an"
              placeholder="Notes"
            >

            <button
              class="btn"
              type="submit"
            >
              Assign
            </button>

          </form>

        </div>

        <div class="card">

          <h2>
            Maintenance
          </h2>

          <form
            class="form"
            onsubmit="addMaintenance(event)"
          >

            <select
              id="mm"
              required
            >

              ${d.motorcycles.map(
                m => `
                  <option
                    value="${m.id}"
                  >
                    ${esc(
                      getMotoCode(m)
                    )}
                  </option>
                `
              ).join('')}

            </select>

            <input
              id="mi"
              placeholder="Problem / issue"
              required
            >

            <div class="two">

              <input
                id="md"
                type="date"
                value="${today()}"
                required
              >

              <input
                id="mileage"
                type="number"
                min="0"
                placeholder="Mileage"
              >

            </div>

            <input
              id="mparts"
              placeholder="Parts used"
            >

            <div class="two">

              <input
                id="mcost"
                type="number"
                min="0"
                placeholder="Cost"
              >

              <input
                id="mgarage"
                placeholder="Garage / mechanic"
              >

            </div>

            <div class="two">

              <input
                id="mnext"
                type="date"
              >

              <input
                id="mdown"
                type="number"
                min="0"
                placeholder="Downtime (hours)"
              >

            </div>

            <select id="mstatus">

              <option>
                Completed
              </option>

              <option>
                In Progress
              </option>

            </select>

            <button
              class="btn"
              type="submit"
            >
              Save Maintenance
            </button>

          </form>

        </div>

      </div>

      <div class="section card tablewrap">

        <h2>
          Recent Income
        </h2>

        <table class="table">

          <tr>

            <th>
              Date
            </th>

            <th>
              Moto
            </th>

            <th>
              Amount
            </th>

            <th>
              Entered by
            </th>

            <th>
              Verified
            </th>

          </tr>

          ${d.income
            .slice(0, 50)
            .map(
              x => `
                <tr>

                  <td>
                    ${esc(
                      x.date
                    )}
                  </td>

                  <td>
                    ${esc(
                      x.motorcycle_code ||
                      '-'
                    )}
                  </td>

                  <td>
                    ${money(
                      x.amount
                    )}
                  </td>

                  <td>
                    ${esc(
                      x.entered_by_name ||
                      '-'
                    )}
                  </td>

                  <td>

                    ${
                      x.verified
                        ? `
                          <span class="tag">
                            Verified
                          </span>
                        `
                        : (
                            myDepartmentCode() ===
                              'D1' ||
                            myDepartmentCode() ===
                              'D3'
                          )
                            ? `
                              <button
                                class="btn light"
                                onclick="verifyIncome(
                                  ${x.id}
                                )"
                              >
                                Verify
                              </button>
                            `
                            : `
                              Pending
                            `
                    }

                  </td>

                </tr>
              `
            )
            .join('')}

        </table>

      </div>
    `
  );
}

/* =========================================================
   FLEET ACTIONS
========================================================= */

async function addMoto(event) {
  event.preventDefault();

  try {
    await api('/api/motorcycles', {
      method: 'POST',

      body: JSON.stringify({
        plate_number:
          $('mplate').value,

        model:
          $('mmodel').value,

        purchase_price:
          Number(
            $('mprice').value || 0
          ),

        purchase_date:
          $('mpdate').value ||
          null,

        status:
          'Active',

        notes:
          $('mcode').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function verifyIncome(id) {
  try {
    await api(
      `/api/income/${id}/verify`,
      {
        method: 'POST',

        body: JSON.stringify({
          reason:
            'Finance verification'
        })
      }
    );

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function addIncome(id) {
  const amount =
    prompt(
      'Daily income (RWF):'
    );

  if (amount === null) {
    return;
  }

  const value =
    Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    alert(
      'Please enter a valid income amount.'
    );
    return;
  }

  const note =
    prompt(
      'Collection note (optional):'
    ) || '';

  try {
    await api('/api/income', {
      method: 'POST',

      body: JSON.stringify({
        motorcycle_id:
          id,

        amount:
          value,

        income_date:
          today(),

        source:
          'Motorcycle Daily Collection',

        description:
          note
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function assignRider(event) {
  event.preventDefault();

  try {
    await api('/api/assignments', {
      method: 'POST',

      body: JSON.stringify({
        motorcycle_id:
          Number(
            $('am').value
          ),

        rider_name:
          $('ar').value,

        rider_phone:
          $('ap').value,

        start_date:
          $('as').value,

        notes:
          $('an').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function addOdometer(event) {
  event.preventDefault();

  try {
    await api('/api/odometer', {
      method: 'POST',

      body: JSON.stringify({
        motorcycle_id:
          Number(
            $('om').value
          ),

        reading:
          Number(
            $('omile').value
          ),

        reading_date:
          $('odate').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function addMaintenance(event) {
  event.preventDefault();

  try {
    await api('/api/maintenance', {
      method: 'POST',

      body: JSON.stringify({
        motorcycle_id:
          Number(
            $('mm').value
          ),

        maintenance_date:
          $('md').value,

        maintenance_type:
          $('mi').value,

        cost:
          Number(
            $('mcost').value || 0
          ),

        description:
          [
            $('mi').value,
            $('mparts').value,
            $('mgarage').value,
            $('mileage').value
              ? `Mileage: ${$('mileage').value}`
              : '',
            $('mnext').value
              ? `Next service: ${$('mnext').value}`
              : '',
            $('mdown').value
              ? `Downtime: ${$('mdown').value} hours`
              : ''
          ]
            .filter(Boolean)
            .join(' | '),

        status:
          $('mstatus').value
      })
    });

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function closeDay(event) {
  event.preventDefault();

  try {
    const result =
      await api(
        '/api/daily-closing',
        {
          method: 'POST',

          body: JSON.stringify({
            closing_date:
              $('cdate').value,

            notes:
              $('cnotes').value
          })
        }
      );

    const closing =
      result.dailyClosing ||
      result.closing ||
      {};

    alert(
      `Day closed: ${
        closing.closing_date ||
        closing.date ||
        $('cdate').value
      }\nNet: ${
        money(
          closing.net || 0
        )
      }`
    );

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

async function viewMoto(id) {
  const moto =
    state.data.motorcycles.find(
      m =>
        Number(m.id) ===
        Number(id)
    );

  if (!moto) {
    return;
  }

  const income =
    state.data.income.filter(
      x =>
        Number(
          x.motorcycle_id
        ) === Number(id)
    );

  const expenses =
    state.data.expenses.filter(
      x =>
        Number(
          x.motorcycle_id
        ) === Number(id)
    );

  const maintenance =
    state.data.maintenance.filter(
      x =>
        Number(
          x.motorcycle_id
        ) === Number(id)
    );

  const odometer =
    state.data.odometer.filter(
      x =>
        Number(
          x.motorcycle_id
        ) === Number(id)
    );

  const assignments =
    state.data.assignments.filter(
      x =>
        Number(
          x.motorcycle_id
        ) === Number(id)
    );

  const incomeTotal =
    income.reduce(
      (sum, x) =>
        sum +
        Number(
          x.amount || 0
        ),
      0
    );

  const expenseTotal =
    expenses.reduce(
      (sum, x) =>
        sum +
        Number(
          x.amount || 0
        ),
      0
    );

  alert(
    [
      `MOTORCYCLE: ${getMotoCode(moto)}`,
      `Plate: ${getMotoPlate(moto)}`,
      `Model: ${getMotoModel(moto)}`,
      `Status: ${getMotoStatus(moto)}`,
      '',
      `Income records: ${income.length}`,
      `Income total: ${money(incomeTotal)}`,
      `Expense records: ${expenses.length}`,
      `Expense total: ${money(expenseTotal)}`,
      `Maintenance records: ${maintenance.length}`,
      `Odometer records: ${odometer.length}`,
      `Assignments: ${assignments.length}`
    ].join('\n')
  );
}

/* =========================================================
   EVIDENCE
========================================================= */

function evidence() {
  shell(
    'Evidence',
    `
      <div class="card">

        <h2>
          Upload Evidence
        </h2>

        <form
          class="form"
          onsubmit="uploadEvidence(event)"
        >

          <input
            id="efile"
            type="file"
            required
          >

          <select id="etask">

            <option value="">
              No task link
            </option>

            ${state.data.tasks.map(
              t => `
                <option
                  value="${t.id}"
                >
                  ${esc(
                    getTaskTitle(t)
                  )}
                </option>
              `
            ).join('')}

          </select>

          <button
            class="btn"
            type="submit"
          >
            Upload
          </button>

        </form>

      </div>

      <div class="section grid">

        ${
          state.data.evidence.length
            ? state.data.evidence.map(
                item => `
                  <div class="card">

                    <b>
                      ${esc(
                        item.filename ||
                        item.original_name ||
                        'Evidence'
                      )}
                    </b>

                    <p>
                      ${esc(
                        item.created_at ||
                        item.uploaded_at ||
                        ''
                      )}
                    </p>

                    <a
                      class="btn light"
                      href="/api/evidence/${
                        item.id
                      }/file"
                      target="_blank"
                      rel="noopener"
                    >
                      Open Evidence
                    </a>

                  </div>
                `
              ).join('')
            : `
              <div class="card">
                <p class="muted">
                  No evidence uploaded yet.
                </p>
              </div>
            `
        }

      </div>
    `
  );
}

async function uploadEvidence(event) {
  event.preventDefault();

  const file =
    $('efile')?.files?.[0];

  if (!file) {
    alert(
      'Please select a file.'
    );
    return;
  }

  const form =
    new FormData();

  form.append(
    'file',
    file
  );

  if ($('etask').value) {
    form.append(
      'task_id',
      $('etask').value
    );
  }

  try {
    const response =
      await fetch(
        '/api/evidence',
        {
          method: 'POST',
          credentials: 'include',
          body: form
        }
      );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error ||
        'Evidence upload failed.'
      );
    }

    await refresh();

  } catch (error) {
    alert(error.message);
  }
}

/* =========================================================
   AUDIT
========================================================= */

function audit() {
  shell(
    'Audit Trail',
    `
      <div class="card">

        <h2>
          System Audit Trail
        </h2>

        <input
          id="aq"
          placeholder="Search audit information..."
          oninput="filterAudit()"
        >

        <div
          id="auditbox"
          class="tablewrap"
          style="margin-top:14px"
        ></div>

      </div>
    `
  );

  filterAudit();
}

function filterAudit() {
  const box =
    $('auditbox');

  if (!box) {
    return;
  }

  const query =
    (
      $('aq')?.value ||
      ''
    )
      .toLowerCase()
      .trim();

  const records =
    state.data.audit.filter(
      item =>
        JSON.stringify(item)
          .toLowerCase()
          .includes(query)
    );

  box.innerHTML = `
    <table class="table">

      <tr>

        <th>
          Date/Time
        </th>

        <th>
          Action
        </th>

        <th>
          Record
        </th>

        <th>
          ID
        </th>

        <th>
          Who
        </th>

        <th>
          Details
        </th>

      </tr>

      ${
        records.length
          ? records.map(
              item => `
                <tr>

                  <td>
                    ${esc(
                      item.created_at ||
                      item.when_at ||
                      ''
                    )}
                  </td>

                  <td>
                    ${esc(
                      item.action ||
                      ''
                    )}
                  </td>

                  <td>
                    ${esc(
                      item.entity_type ||
                      item.record_type ||
                      ''
                    )}
                  </td>

                  <td>
                    ${
                      item.entity_id ||
                      item.record_id ||
                      '-'
                    }
                  </td>

                  <td>
                    ${esc(
                      item.user_name ||
                      getUserNameById(
                        item.user_id
                      ) ||
                      '-'
                    )}
                  </td>

                  <td>
                    ${esc(
                      item.details ||
                      item.reason ||
                      ''
                    )}
                  </td>

                </tr>
              `
            ).join('')
          : `
            <tr>
              <td colspan="6">
                <p class="muted">
                  No audit records found.
                </p>
              </td>
            </tr>
          `
      }

    </table>
  `;
}

/* =========================================================
   REFRESH
========================================================= */

async function refresh() {
  try {
    await load();
    render();
  } catch (error) {
    alert(
      error.message ||
      'Could not refresh data.'
    );
  }
}

/* =========================================================
   RENDER
========================================================= */

function render() {
  if (!state.me) {
    login();
    return;
  }

  if (!can(state.page)) {
    state.page =
      'dashboard';
  }

  const pages = {
    dashboard,
    departments,
    tasks,
    activities,
    reports,
    goals,
    performance,
    finance,
    fleet,
    evidence,
    audit
  };

  const selected =
    pages[state.page] ||
    dashboard;

  selected();
}

/* =========================================================
   START
========================================================= */

(async function start() {
  await boot();
})();
