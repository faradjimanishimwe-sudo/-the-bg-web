/* ============================================================
   THE BG WEB — FRONTEND APPLICATION
   Full replacement app.js
   Compatible with the current THE BG WEB server.js
   ============================================================ */

'use strict';

/* ============================================================
   CORE
   ============================================================ */

const app = document.getElementById('app');

const state = {
    me: null,
    data: {
        users: [],
        departments: [],
        tasks: [],
        activities: [],
        reports: [],
        goals: [],
        income: [],
        expenses: [],
        motorcycles: [],
        changes: [],
        audit: []
    },
    activities: [],
    goals: [],
    assignments: [],
    odometer: [],
    maintenance: [],
    closings: [],
    alerts: [],
    evidence: [],
    fleet: {},
    page: 'dashboard',
    loading: false
};

const $ = id => document.getElementById(id);

const today = () => new Date().toISOString().slice(0, 10);

const money = value =>
    `${Number(value || 0).toLocaleString('en-US')} RWF`;

const numberValue = value => Number(value || 0);

const esc = value =>
    String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[char]));

const formatDateTime = value => {
    if (!value) return '-';

    try {
        return new Date(value).toLocaleString();
    } catch {
        return String(value);
    }
};

const isD1 = () => state.me?.department_id === 'D1';
const isD2 = () => state.me?.department_id === 'D2';
const isD3 = () => state.me?.department_id === 'D3';
const isD4 = () => state.me?.department_id === 'D4';
const isD5 = () => state.me?.department_id === 'D5';

const canFinance = () => isD1() || isD3();
const canFleet = () => isD1() || isD3() || isD4();
const canFleetOperations = () => isD1() || isD4();
const canAudit = () => isD1() || isD3() || isD4() || isD5();

const canManageTasks = () => isD1();

const canCreateTaskForUser = user => {
    if (!user) return false;
    return isD1() || user.department_id === state.me?.department_id;
};

/* ============================================================
   PERMISSIONS
   ============================================================ */

const permissions = {
    D1: {
        dashboard: true,
        departments: true,
        tasks: true,
        activities: true,
        reports: true,
        goals: true,
        performance: true,
        finance: true,
        fleet: true,
        evidence: true,
        audit: true
    },

    D2: {
        dashboard: true,
        departments: true,
        tasks: true,
        activities: true,
        reports: true,
        goals: true,
        performance: true,
        finance: false,
        fleet: false,
        evidence: true,
        audit: false
    },

    D3: {
        dashboard: true,
        departments: true,
        tasks: true,
        activities: true,
        reports: true,
        goals: true,
        performance: true,
        finance: true,
        fleet: true,
        evidence: true,
        audit: true
    },

    D4: {
        dashboard: true,
        departments: true,
        tasks: true,
        activities: true,
        reports: true,
        goals: true,
        performance: true,
        finance: false,
        fleet: true,
        evidence: true,
        audit: true
    },

    D5: {
        dashboard: true,
        departments: true,
        tasks: true,
        activities: true,
        reports: true,
        goals: true,
        performance: true,
        finance: false,
        fleet: false,
        evidence: true,
        audit: true
    }
};

function allowed(page) {
    const department = state.me?.department_id;
    return Boolean(
        department &&
        permissions[department] &&
        permissions[department][page]
    );
}

/* ============================================================
   API
   ============================================================ */

async function api(url, options = {}) {
    const config = {
        credentials: 'include',
        ...options,
        headers: {
            ...(options.body instanceof FormData
                ? {}
                : { 'Content-Type': 'application/json' }),
            ...(options.headers || {})
        }
    };

    let response;

    try {
        response = await fetch(url, config);
    } catch (error) {
        throw new Error('Unable to connect to the server.');
    }

    const contentType =
        response.headers.get('content-type') || '';

    let result = {};

    if (contentType.includes('application/json')) {
        result = await response.json().catch(() => ({}));
    } else {
        const text = await response.text().catch(() => '');
        result = text ? { message: text } : {};
    }

    if (!response.ok) {
        const message =
            result.error ||
            result.message ||
            `Request failed (${response.status})`;

        throw new Error(message);
    }

    return result;
}

/* ============================================================
   RESPONSE NORMALIZATION
   ============================================================ */

function extractArray(response, key) {
    if (Array.isArray(response)) return response;

    if (!response || typeof response !== 'object') {
        return [];
    }

    if (Array.isArray(response[key])) {
        return response[key];
    }

    if (Array.isArray(response.data)) {
        return response.data;
    }

    if (response.data && Array.isArray(response.data[key])) {
        return response.data[key];
    }

    return [];
}

function extractObject(response, key) {
    if (!response || typeof response !== 'object') {
        return {};
    }

    if (response[key] && typeof response[key] === 'object') {
        return response[key];
    }

    if (response.data && response.data[key]) {
        return response.data[key];
    }

    return response;
}

/* ============================================================
   LOAD DATA
   ============================================================ */

async function load() {
    state.loading = true;

    try {
        const bootstrap = await api('/api/bootstrap');

        state.data = {
            users: extractArray(bootstrap, 'users'),
            departments: extractArray(bootstrap, 'departments'),
            tasks: extractArray(bootstrap, 'tasks'),
            activities: extractArray(bootstrap, 'activities'),
            reports: extractArray(bootstrap, 'reports'),
            goals: extractArray(bootstrap, 'goals'),
            income: extractArray(bootstrap, 'income'),
            expenses: extractArray(bootstrap, 'expenses'),
            motorcycles: extractArray(bootstrap, 'motorcycles'),
            changes: extractArray(bootstrap, 'changes'),
            audit: extractArray(bootstrap, 'audit')
        };

        const resources = {
            activities: '/api/activities',
            goals: '/api/goals',
            assignments: '/api/assignments',
            odometer: '/api/odometer',
            maintenance: '/api/maintenance',
            closings: '/api/daily-closings',
            alerts: '/api/alerts',
            evidence: '/api/evidence'
        };

        for (const [key, url] of Object.entries(resources)) {
            try {
                const result = await api(url);

                state[key] = extractArray(result, key);

                if (!state[key].length) {
                    state[key] = extractArray(result, 'items');
                }
            } catch {
                state[key] = [];
            }
        }

        state.activities =
            state.activities.length
                ? state.activities
                : state.data.activities;

        state.goals =
            state.goals.length
                ? state.goals
                : state.data.goals;

        try {
            const fleetResult = await api('/api/fleet-summary');

            state.fleet =
                extractObject(fleetResult, 'summary');

            if (!state.fleet ||
                Object.keys(state.fleet).length === 0) {
                state.fleet = fleetResult || {};
            }
        } catch {
            state.fleet = {};
        }

    } finally {
        state.loading = false;
    }
}

/* ============================================================
   BOOT
   ============================================================ */

async function boot() {
    try {
        const response = await api('/api/me');

        if (!response?.user) {
            throw new Error('No authenticated user.');
        }

        state.me = response.user;

        await load();

        if (!allowed(state.page)) {
            state.page = 'dashboard';
        }

        render();

    } catch {
        state.me = null;
        login();
    }
}

/* ============================================================
   LOGIN
   ============================================================ */

function login() {
    app.innerHTML = `
        <div class="login">
            <div class="loginbox">
                <div class="brand">THE BG</div>
                <div class="sub">
                    ONE COMPANY MANAGEMENT PLATFORM
                </div>

                <h2>Sign in</h2>

                <form onsubmit="doLogin(event)" class="form">

                    <select id="username" required>
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

                    <input
                        id="password"
                        type="password"
                        placeholder="Password"
                        autocomplete="current-password"
                        required
                    >

                    <button class="btn" type="submit">
                        Sign in
                    </button>
                </form>

                <p class="muted">
                    Production deployment uses the password
                    configured by the administrator.
                </p>
            </div>
        </div>
    `;
}

async function doLogin(event) {
    event.preventDefault();

    const username = $('username')?.value;
    const password = $('password')?.value;

    if (!username || !password) {
        alert('Username and password are required.');
        return;
    }

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
        alert(error.message);
    }
}

async function logout() {
    try {
        await api('/api/logout', {
            method: 'POST'
        });
    } catch {
        // Continue to local logout even if server request fails.
    }

    state.me = null;
    state.data = {
        users: [],
        departments: [],
        tasks: [],
        activities: [],
        reports: [],
        goals: [],
        income: [],
        expenses: [],
        motorcycles: [],
        changes: [],
        audit: []
    };

    state.page = 'dashboard';

    login();
}

/* ============================================================
   NAVIGATION
   ============================================================ */

const navItems = [
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

function visibleNav() {
    return navItems.filter(([id]) => allowed(id));
}

function go(page) {
    if (!allowed(page)) {
        alert('You do not have permission to access this section.');
        return;
    }

    state.page = page;
    render();
}

/* ============================================================
   SHELL
   ============================================================ */

function shell(title, body) {
    const navigation = visibleNav();

    app.innerHTML = `
        <div class="layout">

            <aside class="sidebar">

                <div class="brand">THE BG</div>

                <div class="sub">
                    MANAGEMENT WEB
                </div>

                <div class="user">
                    <b>${esc(state.me?.name || '')}</b>
                    <span>
                        ${esc(state.me?.department_id || '')}
                    </span>
                </div>

                <div class="nav">

                    ${navigation.map(([id, label]) => `
                        <button
                            class="${state.page === id ? 'active' : ''}"
                            onclick="go('${id}')"
                        >
                            ${esc(label)}
                        </button>
                    `).join('')}

                    <button onclick="logout()">
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

                        <h1>${esc(title)}</h1>
                    </div>

                    <span class="badge">
                        ${esc(state.me?.department_id || '')}
                        ·
                        ${esc(state.me?.name || '')}
                    </span>

                </header>

                ${body}

            </main>
        </div>

        <nav class="mobile">
            ${navigation
                .slice(0, 5)
                .map(([id, label]) => `
                    <button onclick="go('${id}')">
                        ${esc(label)}
                    </button>
                `)
                .join('')}
        </nav>
    `;
}

/* ============================================================
   COMMON UI
   ============================================================ */

const card = (label, value) => `
    <div class="card stat">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
    </div>
`;

function empty(message = 'No records found.') {
    return `
        <p class="muted">
            ${esc(message)}
        </p>
    `;
}

function refreshButton() {
    return `
        <button
            class="btn light"
            type="button"
            onclick="refresh()"
        >
            Refresh
        </button>
    `;
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function dashboard() {
    const d = state.data;

    const income = d.income.reduce(
        (total, item) =>
            total + numberValue(item.amount),
        0
    );

    const expenses = d.expenses.reduce(
        (total, item) =>
            total + numberValue(item.amount),
        0
    );

    const completed = d.tasks.filter(
        task => task.status === 'Completed'
    ).length;

    const overdue = d.tasks.filter(task =>
        task.status !== 'Completed' &&
        task.deadline &&
        task.deadline < today()
    ).length;

    const departments = d.departments || [];

    shell(
        'THE BG TODAY',
        `
        <div class="grid">

            ${card(
                'Active Users',
                d.users.filter(user => user.active).length
            )}

            ${card('Tasks', d.tasks.length)}

            ${card('Completed', completed)}

            ${card('Overdue', overdue)}

            ${card('Income', money(income))}

            ${card('Expenses', money(expenses))}

            ${card('Net Result', money(income - expenses))}

            ${card(
                'Motorcycles',
                d.motorcycles.length
            )}

        </div>

        <div class="section grid2">

            <div class="card">

                <h2>Department Performance</h2>

                ${
                    departments.length
                        ? departments.map(department => {

                            const tasks = d.tasks.filter(
                                task =>
                                    task.responsible_name ===
                                    department.person
                            );

                            const score = tasks.length
                                ? Math.round(
                                    tasks.filter(
                                        task =>
                                            task.status ===
                                            'Completed'
                                    ).length /
                                    tasks.length *
                                    100
                                )
                                : 0;

                            return `
                                <div class="row">
                                    <b>
                                        ${esc(department.id)}
                                    </b>

                                    <span>
                                        ${esc(department.person)}
                                    </span>

                                    <b>${score}%</b>
                                </div>
                            `;
                        }).join('')
                        : empty()
                }

            </div>

            <div class="card">

                <h2>Alerts</h2>

                ${
                    state.alerts.length
                        ? state.alerts
                            .slice(0, 10)
                            .map(alertItem => `
                                <div class="alert ${esc(
                                    alertItem.level || ''
                                )}">
                                    ${esc(alertItem.text)}
                                </div>
                            `)
                            .join('')
                        : empty('No active alerts.')
                }

            </div>

        </div>
        `
    );
}

/* ============================================================
   DEPARTMENTS
   ============================================================ */

function departments() {
    shell(
        'Departments',
        `
        <div class="grid">

            ${
                state.data.departments.length
                    ? state.data.departments.map(department => {

                        const mine =
                            department.id ===
                            state.me.department_id;

                        const taskCount =
                            state.data.tasks.filter(
                                task =>
                                    task.responsible_name ===
                                    department.person
                            ).length;

                        const reportCount =
                            state.data.reports.filter(
                                report =>
                                    report.user_name ===
                                    department.person
                            ).length;

                        return `
                            <div class="card">

                                <span class="eyebrow">
                                    ${esc(department.id)}
                                    ${
                                        mine
                                            ? ' · YOUR WORKSPACE'
                                            : ''
                                    }
                                </span>

                                <h2>
                                    ${esc(department.position)}
                                </h2>

                                <h3>
                                    ${esc(department.person)}
                                </h3>

                                <p>
                                    ${esc(
                                        department.responsibility
                                    )}
                                </p>

                                <div class="tag">
                                    One responsible person
                                </div>

                                <div class="row">
                                    <span>Tasks</span>
                                    <b>${taskCount}</b>
                                </div>

                                <div class="row">
                                    <span>Reports</span>
                                    <b>${reportCount}</b>
                                </div>

                            </div>
                        `;
                    }).join('')
                    : empty()
            }

        </div>

        ${
            isD1()
                ? `
                    <div class="section card">
                        <h2>Accounts</h2>

                        <p class="muted">
                            Account administration is protected
                            by the secure backend.
                        </p>
                    </div>
                `
                : ''
        }
        `
    );
}

/* ============================================================
   TASKS
   ============================================================ */

function taskStatusOptions(task) {
    const statuses = [
        'Not Started',
        'Accepted',
        'Rejected',
        'In Progress',
        'Completed'
    ];

    if (isD1()) {
        return [
            ...statuses,
            'Delayed'
        ];
    }

    return statuses;
}

function taskActionCell(task) {
    const responsible =
        Number(task.responsible_user) ===
        Number(state.me?.id);

    const manager = isD1();

    if (!manager && !responsible) {
        return esc(task.status || '-');
    }

    return `
        <select
            onchange="changeTask(
                ${Number(task.id)},
                this.value
            )"
        >
            ${taskStatusOptions(task).map(status => `
                <option
                    value="${esc(status)}"
                    ${
                        status === task.status
                            ? 'selected'
                            : ''
                    }
                >
                    ${esc(status)}
                </option>
            `).join('')}
        </select>
    `;
}

function tasks() {
    const users = state.data.users.filter(user => {

        if (!user.active) return false;

        if (isD1()) return true;

        return user.department_id ===
            state.me.department_id;
    });

    shell(
        'Tasks',
        `
        <div class="card">

            <h2>Create Task</h2>

            <form
                class="form"
                onsubmit="createTask(event)"
            >

                <div class="two">

                    <input
                        id="tn"
                        placeholder="Task name"
                        required
                    >

                    <select id="tu" required>
                        ${
                            users.length
                                ? users.map(user => `
                                    <option
                                        value="${Number(user.id)}"
                                    >
                                        ${esc(
                                            user.department_id
                                        )}
                                        —
                                        ${esc(user.name)}
                                    </option>
                                `).join('')
                                : `
                                    <option value="">
                                        No eligible users
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
                        <option value="Normal">
                            Normal
                        </option>

                        <option value="High">
                            High
                        </option>

                        <option value="Low">
                            Low
                        </option>
                    </select>

                    <textarea
                        id="tx"
                        placeholder="Description"
                    ></textarea>

                </div>

                <button
                    class="btn"
                    type="submit"
                    ${
                        users.length
                            ? ''
                            : 'disabled'
                    }
                >
                    Create Task
                </button>

            </form>

        </div>

        <div class="card section tablewrap">

            <div class="row">
                <h2>Task Register</h2>
                ${refreshButton()}
            </div>

            <table class="table">

                <tr>
                    <th>Task</th>
                    <th>Responsible</th>
                    <th>Deadline</th>
                    <th>Priority</th>
                    <th>Status</th>
                </tr>

                ${
                    state.data.tasks.length
                        ? state.data.tasks.map(task => `
                            <tr>

                                <td>
                                    <b>
                                        ${esc(task.name)}
                                    </b>

                                    ${
                                        task.description
                                            ? `
                                                <small>
                                                    ${esc(
                                                        task.description
                                                    )}
                                                </small>
                                            `
                                            : ''
                                    }

                                    ${
                                        task.rejection_reason
                                            ? `
                                                <small>
                                                    Rejection:
                                                    ${esc(
                                                        task.rejection_reason
                                                    )}
                                                </small>
                                            `
                                            : ''
                                    }
                                </td>

                                <td>
                                    ${esc(
                                        task.responsible_name ||
                                        '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        task.deadline || '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        task.priority || '-'
                                    )}
                                </td>

                                <td>
                                    ${taskActionCell(task)}
                                </td>

                            </tr>
                        `).join('')
                        : `
                            <tr>
                                <td colspan="5">
                                    ${empty('No tasks found.')}
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

    const responsibleUser =
        Number($('tu')?.value);

    if (!responsibleUser) {
        alert('Please select a responsible user.');
        return;
    }

    const targetUser =
        state.data.users.find(
            user => Number(user.id) === responsibleUser
        );

    if (!canCreateTaskForUser(targetUser)) {
        alert(
            'You cannot assign this task to that department.'
        );
        return;
    }

    try {
        await api('/api/tasks', {
            method: 'POST',
            body: JSON.stringify({
                name: $('tn').value.trim(),
                responsible_user: responsibleUser,
                start_date: $('ts').value,
                deadline: $('td').value || null,
                priority: $('tp').value,
                description: $('tx').value.trim()
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function changeTask(id, status) {
    const task =
        state.data.tasks.find(
            item => Number(item.id) === Number(id)
        );

    if (!task) return;

    const responsible =
        Number(task.responsible_user) ===
        Number(state.me?.id);

    if (!isD1() && !responsible) {
        alert(
            'You can only update tasks assigned to you.'
        );

        render();
        return;
    }

    let rejectionReason = '';

    if (status === 'Rejected') {
        rejectionReason =
            prompt(
                'Reason for rejecting this task:'
            )?.trim() || '';

        if (!rejectionReason) {
            alert(
                'A rejection reason is required.'
            );

            render();
            return;
        }
    }

    try {
        await api(`/api/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                status,
                rejection_reason:
                    rejectionReason || undefined
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
        render();
    }
}

/* ============================================================
   DAILY ACTIVITIES
   ============================================================ */

function activities() {
    shell(
        'Daily Work',
        `
        <div class="card">

            <h2>Daily Activity</h2>

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

                <button class="btn" type="submit">
                    Save Daily Activity
                </button>

            </form>

        </div>

        <div class="section grid">

            ${
                state.activities.length
                    ? state.activities
                        .slice(0, 50)
                        .map(activity => `
                            <div class="card">

                                <b>
                                    ${esc(
                                        activity.user_name ||
                                        '-'
                                    )}
                                </b>

                                ·

                                ${esc(activity.date || '-')}

                                <p>
                                    ${esc(
                                        activity.done || ''
                                    )}
                                </p>

                                ${
                                    activity.unfinished
                                        ? `
                                            <small>
                                                Unfinished:
                                                ${esc(
                                                    activity.unfinished
                                                )}
                                            </small>
                                        `
                                        : ''
                                }

                                ${
                                    activity.reason
                                        ? `
                                            <small>
                                                Reason:
                                                ${esc(
                                                    activity.reason
                                                )}
                                            </small>
                                        `
                                        : ''
                                }

                            </div>
                        `).join('')
                    : empty()
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
                date: $('adate').value,
                done: $('adone').value.trim(),
                unfinished:
                    $('aunfinished').value.trim(),
                reason:
                    $('areason').value.trim(),
                time_spent:
                    Number($('atime').value || 0)
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   REPORTS
   ============================================================ */

function reports() {
    shell(
        'Reports',
        `
        <div class="card">

            <h2>Submit Report</h2>

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
                    ? state.data.reports.map(report => `
                        <div class="card">

                            <span class="tag">
                                ${esc(report.type)}
                            </span>

                            <p>
                                ${esc(report.body)}
                            </p>

                            <small>
                                ${esc(
                                    report.user_name || '-'
                                )}
                                ·
                                ${esc(report.date || '-')}
                                ·
                                ${esc(report.status || '-')}
                            </small>

                        </div>
                    `).join('')
                    : empty()
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
                type: $('rt').value,
                body: $('rb').value.trim(),
                date: $('rdate').value
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   GOALS
   ============================================================ */

function goals() {
    shell(
        'Goals & Objectives',
        `
        <div class="card">

            <h2>Create Goal</h2>

            <form
                class="form"
                onsubmit="createGoal(event)"
            >

                <div class="two">

                    <input
                        id="gt"
                        placeholder="Goal title"
                        required
                    >

                    <select id="gs">
                        <option value="Department">
                            Department
                        </option>

                        <option value="Individual">
                            Individual
                        </option>

                        <option value="Monthly">
                            Monthly
                        </option>

                        <option value="Yearly">
                            Yearly
                        </option>
                    </select>

                </div>

                <div class="two">

                    <input
                        id="gperiod"
                        placeholder="Period e.g. Sep 2026"
                    >

                    <input
                        id="gtarget"
                        type="number"
                        min="1"
                        value="100"
                        placeholder="Target"
                        required
                    >

                </div>

                <button class="btn" type="submit">
                    Create Goal
                </button>

            </form>

        </div>

        <div class="section grid">

            ${
                state.goals.length
                    ? state.goals.map(goal => {

                        const achieved =
                            numberValue(goal.achieved);

                        const target =
                            Math.max(
                                1,
                                numberValue(goal.target)
                            );

                        const percentage =
                            Math.min(
                                100,
                                Math.round(
                                    achieved /
                                    target *
                                    100
                                )
                            );

                        return `
                            <div class="card">

                                <b>
                                    ${esc(goal.title)}
                                </b>

                                <p>
                                    ${esc(
                                        goal.scope || ''
                                    )}
                                    ·
                                    ${esc(
                                        goal.period ||
                                        'No period'
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
                                        ${Number(goal.id)},
                                        ${achieved}
                                    )"
                                >
                                    Update achievement
                                </button>

                            </div>
                        `;
                    }).join('')
                    : empty()
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
                title: $('gt').value.trim(),
                scope: $('gs').value,
                period: $('gperiod').value.trim(),
                target: Number(
                    $('gtarget').value
                ),
                achieved: 0,
                department_id:
                    state.me.department_id
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function updateGoal(id, current) {
    const value =
        prompt(
            'New achieved value:',
            String(current)
        );

    if (value === null) return;

    const achieved = Number(value);

    if (!Number.isFinite(achieved) || achieved < 0) {
        alert('Please enter a valid number.');
        return;
    }

    try {
        await api(`/api/goals/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                achieved
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   PERFORMANCE
   ============================================================ */

function performance() {
    const data = state.data;

    const ranking = data.users
        .filter(user => user.active)
        .map(user => {

            const tasks =
                data.tasks.filter(
                    task =>
                        Number(task.responsible_user) ===
                        Number(user.id)
                );

            const completed =
                tasks.filter(
                    task =>
                        task.status === 'Completed'
                );

            const delayed =
                tasks.filter(
                    task =>
                        task.status === 'Delayed'
                );

            const userActivities =
                state.activities.filter(
                    activity =>
                        Number(activity.user_id) ===
                        Number(user.id)
                );

            const userReports =
                data.reports.filter(
                    report =>
                        Number(report.user_id) ===
                        Number(user.id)
                );

            const taskScore =
                tasks.length
                    ? completed.length /
                      tasks.length *
                      60
                    : 0;

            const completedOnTime =
                completed.filter(task => {

                    if (!task.deadline) {
                        return true;
                    }

                    const completedDate =
                        task.completed_at ||
                        task.updated_at ||
                        task.date ||
                        today();

                    return (
                        String(completedDate)
                            .slice(0, 10) <=
                        String(task.deadline)
                            .slice(0, 10)
                    );
                });

            const timingScore =
                tasks.length
                    ? completedOnTime.length /
                      tasks.length *
                      20
                    : 0;

            const activityScore =
                userActivities.length
                    ? 10
                    : 0;

            const reportScore =
                userReports.length
                    ? 10
                    : 0;

            const score = Math.round(
                Math.min(
                    100,
                    taskScore +
                    timingScore +
                    activityScore +
                    reportScore
                )
            );

            return {
                user,
                score,
                delayed: delayed.length
            };
        })
        .sort(
            (a, b) =>
                b.score - a.score
        );

    shell(
        'Performance',
        `
        <div class="card">

            <h2>System Data Ranking</h2>

            <p class="muted">
                Performance is calculated from stored
                task completion, timing, daily activity
                and report records.
            </p>

            <div class="tablewrap">

                <table class="table">

                    <tr>
                        <th>#</th>
                        <th>Person</th>
                        <th>Department</th>
                        <th>Score</th>
                        <th>Delayed</th>
                    </tr>

                    ${
                        ranking.length
                            ? ranking.map(
                                (item, index) => `
                                    <tr>

                                        <td>
                                            ${index + 1}
                                        </td>

                                        <td>
                                            ${esc(
                                                item.user.name
                                            )}
                                        </td>

                                        <td>
                                            ${esc(
                                                item.user
                                                    .department_id
                                            )}
                                        </td>

                                        <td>
                                            <b>
                                                ${item.score}%
                                            </b>
                                        </td>

                                        <td>
                                            ${item.delayed}
                                        </td>

                                    </tr>
                                `
                            ).join('')
                            : `
                                <tr>
                                    <td colspan="5">
                                        ${empty()}
                                    </td>
                                </tr>
                            `
                    }

                </table>

            </div>

        </div>
        `
    );
}

/* ============================================================
   FINANCE
   ============================================================ */

function finance() {
    if (!canFinance()) {
        state.page = 'dashboard';
        return dashboard();
    }

    const data = state.data;

    const income =
        data.income.reduce(
            (total, item) =>
                total + numberValue(item.amount),
            0
        );

    const expenses =
        data.expenses.reduce(
            (total, item) =>
                total + numberValue(item.amount),
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
                money(income - expenses)
            )}

            ${card(
                'Pending Changes',
                data.changes.length
            )}

        </div>

        <div class="section card">

            <h2>Add Expense</h2>

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

                        <option value="Fuel">
                            Fuel
                        </option>

                        <option value="Maintenance">
                            Maintenance
                        </option>

                        <option value="Repairs">
                            Repairs
                        </option>

                        <option value="Salary / Commission">
                            Salary / Commission
                        </option>

                        <option value="Other">
                            Other
                        </option>

                    </select>

                    <select id="emoto">

                        <option value="">
                            Company expense /
                            no motorcycle
                        </option>

                        ${
                            data.motorcycles.map(
                                motorcycle => `
                                    <option
                                        value="${Number(
                                            motorcycle.id
                                        )}"
                                    >
                                        ${esc(
                                            motorcycle.code
                                        )}
                                        —
                                        ${esc(
                                            motorcycle.plate ||
                                            ''
                                        )}
                                    </option>
                                `
                            ).join('')
                        }

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
            isD1()
                ? `
                    <div class="section card">

                        <h2>
                            Pending Finance Changes
                        </h2>

                        ${
                            data.changes.length
                                ? data.changes.map(
                                    change => `
                                        <div class="change">

                                            <b>
                                                ${esc(
                                                    change.record_type
                                                )}
                                                #
                                                ${esc(
                                                    change.record_id
                                                )}
                                            </b>

                                            <p>
                                                ${esc(
                                                    change.reason
                                                )}
                                            </p>

                                            <button
                                                class="btn"
                                                onclick="decision(
                                                    ${Number(
                                                        change.id
                                                    )},
                                                    'Approved'
                                                )"
                                            >
                                                Approve
                                            </button>

                                            <button
                                                class="btn danger"
                                                onclick="decision(
                                                    ${Number(
                                                        change.id
                                                    )},
                                                    'Rejected'
                                                )"
                                            >
                                                Reject
                                            </button>

                                        </div>
                                    `
                                ).join('')
                                : empty(
                                    'No pending finance changes.'
                                )
                        }

                    </div>
                `
                : ''
        }

        <div class="section card tablewrap">

            <h2>Expenses</h2>

            <table class="table">

                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Moto</th>
                    <th>Amount</th>
                    <th>By</th>
                </tr>

                ${
                    data.expenses.length
                        ? data.expenses.map(
                            expense => `
                                <tr>

                                    <td>
                                        ${esc(
                                            expense.date ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${esc(
                                            expense.expense_type ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${esc(
                                            expense.motorcycle_code ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${money(
                                            expense.amount
                                        )}
                                    </td>

                                    <td>
                                        ${esc(
                                            expense.entered_by_name ||
                                            expense.entered_name ||
                                            '-'
                                        )}
                                    </td>

                                </tr>
                            `
                        ).join('')
                        : `
                            <tr>
                                <td colspan="5">
                                    ${empty()}
                                </td>
                            </tr>
                        `
                }

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
                date: $('edate').value,
                motorcycle_id:
                    $('emoto').value
                        ? Number($('emoto').value)
                        : null,
                expense_type:
                    $('etype').value,
                amount:
                    Number($('eamount').value),
                description:
                    $('edesc').value.trim()
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function decision(id, decisionValue) {
    let note =
        prompt(
            'Decision note:'
        );

    if (note === null) {
        return;
    }

    note = note.trim();

    if (
        decisionValue === 'Rejected' &&
        !note
    ) {
        alert(
            'A decision note is required when rejecting.'
        );
        return;
    }

    try {
        await api(
            `/api/finance-changes/${id}/decision`,
            {
                method: 'POST',
                body: JSON.stringify({
                    decision: decisionValue,
                    note
                })
            }
        );

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   FLEET
   ============================================================ */

function fleet() {
    if (!canFleet()) {
        state.page = 'dashboard';
        return dashboard();
    }

    const data = state.data;
    const summary = state.fleet || {};

    const total =
        summary.totalMotorcycles ??
        summary.total ??
        data.motorcycles.length;

    const active =
        summary.active ??
        data.motorcycles.filter(
            motorcycle =>
                motorcycle.status === 'Active'
        ).length;

    const maintenance =
        summary.maintenance ??
        data.motorcycles.filter(
            motorcycle =>
                motorcycle.status === 'Maintenance'
        ).length;

    const todayIncome =
        summary.todayIncome ??
        summary.today_income ??
        0;

    const todayExpenses =
        summary.todayExpenses ??
        summary.today_expenses ??
        0;

    const todayNet =
        summary.todayNet ??
        summary.today_net ??
        todayIncome - todayExpenses;

    const fleetNet =
        summary.net ??
        summary.fleetNet ??
        summary.fleet_net ??
        0;

    shell(
        'Motorcycle Fleet',
        `
        <div class="grid">

            ${card('Total', total)}

            ${card('Active', active)}

            ${card(
                'Maintenance',
                maintenance
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
                money(todayNet)
            )}

            ${card(
                'Fleet Net',
                money(fleetNet)
            )}

        </div>

        <div class="section grid2">

            ${
                canFleetOperations()
                    ? `
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
                                    Register
                                </button>

                            </form>

                        </div>
                    `
                    : ''
            }

            ${
                canFleetOperations()
                    ? `
                        <div class="card">

                            <h2>Daily Closing</h2>

                            <form
                                class="form"
                                onsubmit="closeDay(event)"
                            >

                                <input
                                    id="cdate"
                                    type="date"
                                    value="${today()}"
                                    required
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
                    `
                    : ''
            }

        </div>

        <div class="section card tablewrap">

            <h2>Motorcycles</h2>

            <table class="table">

                <tr>
                    <th>Moto</th>
                    <th>Plate</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>

                ${
                    data.motorcycles.length
                        ? data.motorcycles.map(
                            motorcycle => `
                                <tr>

                                    <td>
                                        <b>
                                            ${esc(
                                                motorcycle.code
                                            )}
                                        </b>
                                    </td>

                                    <td>
                                        ${esc(
                                            motorcycle.plate ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${esc(
                                            motorcycle.model ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${esc(
                                            motorcycle.status ||
                                            '-'
                                        )}
                                    </td>

                                    <td>

                                        <button
                                            class="btn light"
                                            onclick="viewMoto(
                                                ${Number(
                                                    motorcycle.id
                                                )}
                                            )"
                                        >
                                            History
                                        </button>

                                        ${
                                            canFleetOperations()
                                                ? `
                                                    <button
                                                        class="btn light"
                                                        onclick="addIncome(
                                                            ${Number(
                                                                motorcycle.id
                                                            )}
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
                                    ${empty(
                                        'No motorcycles registered.'
                                    )}
                                </td>
                            </tr>
                        `
                }

            </table>

        </div>

        ${
            canFleetOperations()
                ? `
                    <div class="section card">

                        <h2>
                            Odometer / Mileage
                        </h2>

                        <form
                            class="form"
                            onsubmit="addOdometer(event)"
                        >

                            <div class="two">

                                <select id="om">
                                    ${
                                        data.motorcycles.map(
                                            motorcycle => `
                                                <option
                                                    value="${Number(
                                                        motorcycle.id
                                                    )}"
                                                >
                                                    ${esc(
                                                        motorcycle.code
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
                `
                : ''
        }

        ${
            canFleetOperations()
                ? `
                    <div class="section grid2">

                        <div class="card">

                            <h2>
                                Rider Assignment
                            </h2>

                            <form
                                class="form"
                                onsubmit="assignRider(event)"
                            >

                                <select id="am">
                                    ${
                                        data.motorcycles.map(
                                            motorcycle => `
                                                <option
                                                    value="${Number(
                                                        motorcycle.id
                                                    )}"
                                                >
                                                    ${esc(
                                                        motorcycle.code
                                                    )}
                                                </option>
                                            `
                                        ).join('')
                                    }
                                </select>

                                <input
                                    id="ar"
                                    placeholder="Rider / worker name"
                                    required
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

                            <h2>Maintenance</h2>

                            <form
                                class="form"
                                onsubmit="addMaintenance(event)"
                            >

                                <select id="mm">
                                    ${
                                        data.motorcycles.map(
                                            motorcycle => `
                                                <option
                                                    value="${Number(
                                                        motorcycle.id
                                                    )}"
                                                >
                                                    ${esc(
                                                        motorcycle.code
                                                    )}
                                                </option>
                                            `
                                        ).join('')
                                    }
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

                                    <option value="Completed">
                                        Completed
                                    </option>

                                    <option value="In Progress">
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
                `
                : ''
        }

        <div class="section card tablewrap">

            <h2>Recent Income</h2>

            <table class="table">

                <tr>
                    <th>Date</th>
                    <th>Moto</th>
                    <th>Amount</th>
                    <th>Entered by</th>
                    <th>Verified</th>
                </tr>

                ${
                    data.income.length
                        ? data.income
                            .slice(0, 50)
                            .map(
                                income => `
                                    <tr>

                                        <td>
                                            ${esc(
                                                income.date ||
                                                '-'
                                            )}
                                        </td>

                                        <td>
                                            ${esc(
                                                income.motorcycle_code ||
                                                '-'
                                            )}
                                        </td>

                                        <td>
                                            ${money(
                                                income.amount
                                            )}
                                        </td>

                                        <td>
                                            ${esc(
                                                income.entered_by_name ||
                                                income.entered_name ||
                                                '-'
                                            )}
                                        </td>

                                        <td>

                                            ${
                                                income.verified
                                                    ? 'Verified'
                                                    : (
                                                        isD1() ||
                                                        isD3()
                                                    )
                                                        ? `
                                                            <button
                                                                class="btn light"
                                                                onclick="verifyIncome(
                                                                    ${Number(
                                                                        income.id
                                                                    )}
                                                                )"
                                                            >
                                                                Verify
                                                            </button>
                                                        `
                                                        : 'Pending'
                                            }

                                        </td>

                                    </tr>
                                `
                            )
                            .join('')
                        : `
                            <tr>
                                <td colspan="5">
                                    ${empty()}
                                </td>
                            </tr>
                        `
                }

            </table>

        </div>
        `
    );
}

/* ============================================================
   FLEET ACTIONS
   ============================================================ */

async function addMoto(event) {
    event.preventDefault();

    if (!canFleetOperations()) {
        alert('You do not have permission.');
        return;
    }

    try {
        await api('/api/motorcycles', {
            method: 'POST',
            body: JSON.stringify({
                code:
                    $('mcode').value.trim(),
                plate:
                    $('mplate').value.trim(),
                model:
                    $('mmodel').value.trim(),
                purchase_price:
                    Number(
                        $('mprice').value || 0
                    ),
                purchase_date:
                    $('mpdate').value || null,
                status: 'Active'
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function verifyIncome(id) {
    if (!(isD1() || isD3())) {
        alert(
            'Only D1 and D3 can verify income.'
        );
        return;
    }

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
    if (!canFleetOperations()) {
        alert(
            'Only D1 and D4 can enter motorcycle income.'
        );
        return;
    }

    const amount =
        prompt(
            'Daily income (RWF):'
        );

    if (amount === null) return;

    const numericAmount =
        Number(amount);

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
    ) {
        alert(
            'Enter a valid positive amount.'
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
                date: today(),
                motorcycle_id: Number(id),
                amount: numericAmount,
                collection_note:
                    note.trim()
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function assignRider(event) {
    event.preventDefault();

    if (!canFleetOperations()) {
        alert('You do not have permission.');
        return;
    }

    try {
        await api('/api/assignments', {
            method: 'POST',
            body: JSON.stringify({
                motorcycle_id:
                    Number($('am').value),
                rider_name:
                    $('ar').value.trim(),
                start_date:
                    $('as').value,
                notes:
                    $('an').value.trim()
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function addOdometer(event) {
    event.preventDefault();

    if (!canFleetOperations()) {
        alert('You do not have permission.');
        return;
    }

    try {
        await api('/api/odometer', {
            method: 'POST',
            body: JSON.stringify({
                motorcycle_id:
                    Number($('om').value),
                date:
                    $('odate').value,
                mileage:
                    Number($('omile').value)
            })
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function addMaintenance(event) {
    event.preventDefault();

    if (!canFleetOperations()) {
        alert('You do not have permission.');
        return;
    }

    try {
        await api('/api/maintenance', {
            method: 'POST',
            body: JSON.stringify({
                motorcycle_id:
                    Number($('mm').value),
                issue:
                    $('mi').value.trim(),
                date:
                    $('md').value,
                mileage:
                    $('mileage').value
                        ? Number(
                            $('mileage').value
                        )
                        : null,
                parts:
                    $('mparts').value.trim(),
                cost:
                    Number(
                        $('mcost').value || 0
                    ),
                garage:
                    $('mgarage').value.trim(),
                next_service:
                    $('mnext').value || null,
                downtime:
                    Number(
                        $('mdown').value || 0
                    ),
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

    if (!canFleetOperations()) {
        alert('You do not have permission.');
        return;
    }

    try {
        const response =
            await api('/api/daily-closing', {
                method: 'POST',
                body: JSON.stringify({
                    date:
                        $('cdate').value,
                    notes:
                        $('cnotes').value.trim()
                })
            });

        const closing =
            response.dailyClosing ||
            response.closing ||
            response;

        const closingDate =
            closing.date ||
            $('cdate').value;

        const net =
            closing.net ??
            closing.todayNet ??
            0;

        alert(
            `Closed ${closingDate}: ${money(net)}`
        );

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function viewMoto(id) {
    try {
        const response =
            await api(
                `/api/fleet-detail/${id}`
            );

        const detail =
            response.fleetDetail ||
            response;

        const motorcycle =
            detail.motorcycle ||
            {};

        const income =
            detail.income ||
            [];

        const expenses =
            detail.expenses ||
            [];

        const maintenance =
            detail.maintenance ||
            [];

        const odometer =
            detail.odometer ||
            [];

        const assignments =
            detail.assignments ||
            [];

        const text = [
            `MOTORCYCLE ${
                motorcycle.code || '-'
            }`,
            `Status: ${
                motorcycle.status || '-'
            }`,
            `Income records: ${
                income.length
            }`,
            `Expense records: ${
                expenses.length
            }`,
            `Maintenance records: ${
                maintenance.length
            }`,
            `Odometer records: ${
                odometer.length
            }`,
            `Assignments: ${
                assignments.length
            }`
        ].join('\n');

        alert(text);

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   EVIDENCE
   ============================================================ */

function evidence() {
    shell(
        'Evidence',
        `
        <div class="card">

            <h2>Upload Evidence</h2>

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

                    ${
                        state.data.tasks.map(
                            task => `
                                <option
                                    value="${Number(task.id)}"
                                >
                                    ${esc(task.name)}
                                </option>
                            `
                        ).join('')
                    }

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
                state.evidence.length
                    ? state.evidence.map(
                        item => `
                            <div class="card">

                                <b>
                                    ${esc(
                                        item.original_name ||
                                        item.filename ||
                                        'Evidence'
                                    )}
                                </b>

                                <p>
                                    ${esc(
                                        item.uploaded_at ||
                                        '-'
                                    )}
                                </p>

                                <button
                                    class="btn light"
                                    onclick="openEvidence(
                                        ${Number(item.id)}
                                    )"
                                >
                                    Open
                                </button>

                            </div>
                        `
                    ).join('')
                    : empty(
                        'No evidence uploaded yet.'
                    )
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
        alert('Please select a file.');
        return;
    }

    const formData =
        new FormData();

    formData.append(
        'file',
        file
    );

    if ($('etask').value) {
        formData.append(
            'task_id',
            $('etask').value
        );
    }

    try {
        await api('/api/evidence', {
            method: 'POST',
            body: formData
        });

        await refresh();

    } catch (error) {
        alert(error.message);
    }
}

async function openEvidence(id) {
    try {
        const response =
            await fetch(
                `/api/evidence/${id}/file`,
                {
                    credentials: 'include'
                }
            );

        if (!response.ok) {
            const body =
                await response.json()
                    .catch(() => ({}));

            throw new Error(
                body.error ||
                'Unable to open evidence.'
            );
        }

        const blob =
            await response.blob();

        const url =
            URL.createObjectURL(blob);

        window.open(
            url,
            '_blank',
            'noopener'
        );

        setTimeout(
            () => URL.revokeObjectURL(url),
            60000
        );

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   AUDIT
   ============================================================ */

function audit() {
    if (!canAudit()) {
        state.page = 'dashboard';
        return dashboard();
    }

    shell(
        'Audit Trail',
        `
        <div class="card">

            <div class="row">

                <h2>Audit Trail</h2>

                ${refreshButton()}

            </div>

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

    if (!box) return;

    const query =
        (
            $('aq')?.value ||
            ''
        )
            .toLowerCase()
            .trim();

    const auditRecords =
        Array.isArray(state.data.audit)
            ? state.data.audit
            : [];

    const filtered =
        auditRecords.filter(record =>
            JSON.stringify(record)
                .toLowerCase()
                .includes(query)
        );

    box.innerHTML = `
        <table class="table">

            <tr>
                <th>Date/Time</th>
                <th>Action</th>
                <th>Record</th>
                <th>ID</th>
                <th>Who</th>
                <th>Reason</th>
            </tr>

            ${
                filtered.length
                    ? filtered.map(
                        record => `
                            <tr>

                                <td>
                                    ${esc(
                                        record.when_at ||
                                        record.created_at ||
                                        '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        record.action ||
                                        '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        record.record_type ||
                                        '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        record.record_id ??
                                        '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        record.user_name ||
                                        '-'
                                    )}
                                </td>

                                <td>
                                    ${esc(
                                        record.reason ||
                                        ''
                                    )}
                                </td>

                            </tr>
                        `
                    ).join('')
                    : `
                        <tr>
                            <td colspan="6">
                                ${empty(
                                    'No audit records found.'
                                )}
                            </td>
                        </tr>
                    `
            }

        </table>
    `;
}

/* ============================================================
   REFRESH
   ============================================================ */

async function refresh() {
    try {
        await load();

        if (!allowed(state.page)) {
            state.page = 'dashboard';
        }

        render();

    } catch (error) {
        alert(error.message);
    }
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
    if (!state.me) {
        login();
        return;
    }

    if (!allowed(state.page)) {
        state.page = 'dashboard';
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

    const pageRenderer =
        pages[state.page] ||
        dashboard;

    try {
        pageRenderer();
    } catch (error) {
        console.error(
            'THE BG WEB render error:',
            error
        );

        shell(
            'System Error',
            `
                <div class="card">

                    <h2>
                        Unable to display this section
                    </h2>

                    <p class="muted">
                        The application encountered
                        an unexpected display error.
                    </p>

                    <button
                        class="btn"
                        onclick="refresh()"
                    >
                        Reload
                    </button>

                </div>
            `
        );
    }
}

/* ============================================================
   GLOBAL ERROR HANDLING
   ============================================================ */

window.addEventListener(
    'unhandledrejection',
    event => {
        console.error(
            'THE BG WEB unhandled rejection:',
            event.reason
        );
    }
);

window.addEventListener(
    'error',
    event => {
        console.error(
            'THE BG WEB frontend error:',
            event.error
        );
    }
);

/* ============================================================
   START APPLICATION
   ============================================================ */

(async function start() {
    try {
        const response =
            await api('/api/me');

        if (response?.user) {
            state.me =
                response.user;

            await load();

            state.page =
                allowed(state.page)
                    ? state.page
                    : 'dashboard';

            render();
        } else {
            login();
        }

    } catch {
        login();
    }
})();
