const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const JWT_SECRET = process.env.JWT_SECRET;

if (
  NODE_ENV === 'production' &&
  (!JWT_SECRET || JWT_SECRET.length < 32)
) {
  throw new Error(
    'Production requires a JWT_SECRET of at least 32 characters.'
  );
}

const EFFECTIVE_JWT_SECRET =
  JWT_SECRET ||
  'development-only-change-me-before-production-123456789';

const ROOT = __dirname;

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(ROOT, 'data', 'thebg.sqlite');

const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function rows(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function one(sql, ...params) {
  return db.prepare(sql).get(...params);
}

function oneCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

/* =========================================================
   DATABASE
========================================================= */

db.exec(`
CREATE TABLE IF NOT EXISTS departments(
  id TEXT PRIMARY KEY,
  position TEXT NOT NULL,
  person TEXT NOT NULL,
  responsibility TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  department_id TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS motorcycles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  plate TEXT,
  model TEXT,
  purchase_date TEXT,
  purchase_price REAL DEFAULT 0,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER NOT NULL,
  rider_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id)
);

CREATE TABLE IF NOT EXISTS income(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  motorcycle_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  collection_note TEXT,
  entered_by INTEGER NOT NULL,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY(entered_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  motorcycle_id INTEGER,
  expense_type TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  entered_by INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY(entered_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  responsible_user INTEGER NOT NULL,
  start_date TEXT,
  deadline TEXT,
  priority TEXT DEFAULT 'Normal',
  description TEXT,
  status TEXT DEFAULT 'Not Started',
  created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(responsible_user) REFERENCES users(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activities(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  done TEXT,
  unfinished TEXT,
  reason TEXT,
  time_spent REAL,
  evidence_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'Submitted',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  department_id TEXT,
  target REAL DEFAULT 100,
  achieved REAL DEFAULT 0,
  period TEXT,
  created_by INTEGER NOT NULL,
  FOREIGN KEY(department_id) REFERENCES departments(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS maintenance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER NOT NULL,
  issue TEXT NOT NULL,
  date TEXT NOT NULL,
  mileage REAL,
  parts TEXT,
  cost REAL DEFAULT 0,
  garage TEXT,
  next_service TEXT,
  downtime REAL DEFAULT 0,
  status TEXT DEFAULT 'Completed',
  FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id)
);

CREATE TABLE IF NOT EXISTS odometer(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  mileage REAL NOT NULL,
  entered_by INTEGER NOT NULL,
  FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY(entered_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evidence(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  uploaded_by INTEGER NOT NULL,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  task_id INTEGER,
  report_id INTEGER,
  FOREIGN KEY(uploaded_by) REFERENCES users(id),
  FOREIGN KEY(task_id) REFERENCES tasks(id),
  FOREIGN KEY(report_id) REFERENCES reports(id)
);

CREATE TABLE IF NOT EXISTS finance_changes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  original_json TEXT NOT NULL,
  proposed_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'Pending Approval',
  requested_by INTEGER NOT NULL,
  decided_by INTEGER,
  decision_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  FOREIGN KEY(requested_by) REFERENCES users(id),
  FOREIGN KEY(decided_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id INTEGER,
  original_json TEXT,
  changed_json TEXT,
  reason TEXT,
  who_user INTEGER,
  when_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(who_user) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_closings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  income REAL DEFAULT 0,
  expenses REAL DEFAULT 0,
  net REAL DEFAULT 0,
  closed_by INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(closed_by) REFERENCES users(id)
);
`);

/* =========================================================
   DEPARTMENTS
========================================================= */

const departments = [
  [
    'D1',
    'Chairman & CEO',
    'MANISHIMWE FARADJI',
    'Leadership, vision, major decisions & unity'
  ],
  [
    'D2',
    'Vice Chairman & Deputy CEO',
    'AHMED FAZZIR',
    'Strategy, market research, opportunities & implementation'
  ],
  [
    'D3',
    'Finance & Assets Officer (CFO)',
    'NIYITANGA OSAMA',
    'Finance, assets, taxes, financial records, financial verification & financial reconciliation'
  ],
  [
    'D4',
    'Operations Officer (COO)',
    'KIREZI NASSIB',
    'Daily operations, workers, suppliers, quality, efficiency, motorcycle operations & motorcycle workers / riders'
  ],
  [
    'D5',
    'Legal & Documentation Officer (CLO)',
    'IMANANIYOGISUBIZO YUSSUF',
    'Legal protection, contracts & documentation'
  ]
];

const upDept = db.prepare(`
  INSERT OR IGNORE INTO departments
  (id, position, person, responsibility)
  VALUES (?, ?, ?, ?)
`);

departments.forEach((d) => upDept.run(...d));

/* =========================================================
   INITIAL USERS
========================================================= */

const userCount = oneCount();

const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (userCount === 0) {
  if (
    NODE_ENV === 'production' &&
    (!initialPassword || initialPassword.length < 10)
  ) {
    throw new Error(
      'First production startup requires INITIAL_ADMIN_PASSWORD of at least 10 characters.'
    );
  }

  const seedPassword =
    initialPassword || '1234';

  const upUser = db.prepare(`
    INSERT INTO users
    (name, username, password_hash, department_id)
    VALUES (?, ?, ?, ?)
  `);

  departments.forEach((d) => {
    const username = d[0].toLowerCase();

    upUser.run(
      d[2],
      username,
      bcrypt.hashSync(seedPassword, 12),
      d[0]
    );
  });

  if (NODE_ENV === 'development') {
    console.warn(
      'Development demo accounts created with password 1234. Never use this in production.'
    );
  }
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(express.json({ limit: '2mb' }));
app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb'
  })
);
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  if (NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
});

/* =========================================================
   LOGIN RATE LIMITER
========================================================= */

const loginAttempts = new Map();

function loginGuard(req, res, next) {
  const key = String(req.ip || 'unknown');
  const now = Date.now();

  let state =
    loginAttempts.get(key) || {
      n: 0,
      t: now
    };

  if (now - state.t > 15 * 60 * 1000) {
    state = {
      n: 0,
      t: now
    };
  }

  if (state.n >= 10) {
    return res.status(429).json({
      error: 'Too many login attempts. Try again later.'
    });
  }

  req._loginKey = key;
  req._loginState = state;

  next();
}

/* =========================================================
   UPLOADS
========================================================= */

const allowedMime = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,

    filename: (req, file, cb) => {
      const safeExt =
        path.extname(file.originalname).toLowerCase();

      cb(
        null,
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${safeExt}`
      );
    }
  }),

  fileFilter: (req, file, cb) => {
    if (!allowedMime.has(file.mimetype)) {
      return cb(
        new Error('File type is not allowed.')
      );
    }

    cb(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/* =========================================================
   AUTH
========================================================= */

function auth(req, res, next) {
  try {
    const token = req.cookies.bg_token;

    if (!token) {
      throw new Error('No token');
    }

    req.user = jwt.verify(
      token,
      EFFECTIVE_JWT_SECRET
    );

    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Not authenticated'
    });
  }
}

function d1(req) {
  return req.user.department_id === 'D1';
}

function deptOnly(req, ids) {
  return (
    d1(req) ||
    ids.includes(req.user.department_id)
  );
}

function sameDept(req, userId) {
  const u = one(
    'SELECT department_id FROM users WHERE id=?',
    userId
  );

  return (
    d1(req) ||
    u?.department_id === req.user.department_id
  );
}

function log(
  req,
  action,
  type,
  id,
  original = null,
  changed = null,
  reason = ''
) {
  db.prepare(`
    INSERT INTO audit
    (
      action,
      record_type,
      record_id,
      original_json,
      changed_json,
      reason,
      who_user
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    action,
    type,
    id,
    original
      ? JSON.stringify(original)
      : null,
    changed
      ? JSON.stringify(changed)
      : null,
    reason,
    req.user.id
  );
}

/* =========================================================
   LOGIN
========================================================= */

app.post(
  '/api/login',
  loginGuard,
  (req, res) => {
    const username = String(
      req.body.username || ''
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ''
    );

    const u = one(
      'SELECT * FROM users WHERE username=? AND active=1',
      username
    );

    if (
      !u ||
      !bcrypt.compareSync(
        password,
        u.password_hash
      )
    ) {
      req._loginState.n++;

      loginAttempts.set(
        req._loginKey,
        req._loginState
      );

      return res.status(401).json({
        error: 'Invalid login'
      });
    }

    loginAttempts.delete(req._loginKey);

    const token = jwt.sign(
      {
        id: u.id,
        name: u.name,
        username: u.username,
        department_id: u.department_id
      },
      EFFECTIVE_JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    res.cookie(
      'bg_token',
      token,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
      }
    );

    res.json({
      user: {
        id: u.id,
        name: u.name,
        username: u.username,
        department_id: u.department_id
      }
    });
  }
);

/* =========================================================
   LOGOUT / HEALTH / ME
========================================================= */

app.post(
  '/api/logout',
  (req, res) => {
    res.clearCookie(
      'bg_token',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: NODE_ENV === 'production',
        path: '/'
      }
    );

    res.json({ ok: true });
  }
);

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: true,
      service: 'THE BG WEB',
      environment: NODE_ENV
    });
  }
);

app.get(
  '/api/me',
  auth,
  (req, res) => {
    res.json({
      user: req.user,
      department: one(
        'SELECT * FROM departments WHERE id=?',
        req.user.department_id
      )
    });
  }
);

/* =========================================================
   BOOTSTRAP
========================================================= */

app.get(
  '/api/bootstrap',
  auth,
  (req, res) => {
    const users = rows(`
      SELECT
        id,
        name,
        username,
        department_id,
        active
      FROM users
    `);

    res.json({
      departments: rows(
        'SELECT * FROM departments'
      ),

      users,

      motorcycles: rows(`
        SELECT *
        FROM motorcycles
        ORDER BY id DESC
      `),

      tasks: rows(`
        SELECT
          t.*,
          u.name AS responsible_name
        FROM tasks t
        JOIN users u
          ON u.id=t.responsible_user
        ORDER BY t.id DESC
      `),

      reports: rows(`
        SELECT
          r.*,
          u.name AS user_name
        FROM reports r
        JOIN users u
          ON u.id=r.user_id
        ORDER BY r.id DESC
      `),

      income: rows(`
        SELECT
          i.*,
          m.code AS motorcycle_code,
          u.name AS entered_name
        FROM income i
        JOIN motorcycles m
          ON m.id=i.motorcycle_id
        JOIN users u
          ON u.id=i.entered_by
        ORDER BY i.date DESC, i.id DESC
      `),

      expenses: rows(`
        SELECT
          e.*,
          m.code AS motorcycle_code,
          u.name AS entered_name
        FROM expenses e
        LEFT JOIN motorcycles m
          ON m.id=e.motorcycle_id
        JOIN users u
          ON u.id=e.entered_by
        ORDER BY e.date DESC, e.id DESC
      `),

      maintenance: rows(`
        SELECT
          m.*,
          x.code AS motorcycle_code
        FROM maintenance m
        JOIN motorcycles x
          ON x.id=m.motorcycle_id
        ORDER BY m.date DESC
      `),

      audit: rows(`
        SELECT
          a.*,
          u.name AS user_name
        FROM audit a
        LEFT JOIN users u
          ON u.id=a.who_user
        ORDER BY a.id DESC
        LIMIT 1000
      `),

      changes: rows(`
        SELECT
          f.*,
          u.name AS requested_name
        FROM finance_changes f
        JOIN users u
          ON u.id=f.requested_by
        WHERE f.status='Pending Approval'
        ORDER BY f.id DESC
      `)
    });
  }
);

/* =========================================================
   MOTORCYCLES
========================================================= */

app.post(
  '/api/motorcycles',
  auth,
  (req, res) => {
    if (!['D1', 'D4'].includes(
      req.user.department_id
    )) {
      return res.status(403).json({
        error: 'D4 Operations or D1 only'
      });
    }

    const {
      code,
      plate,
      model,
      purchase_date,
      purchase_price,
      status = 'Active'
    } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Motorcycle code required'
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO motorcycles
        (
          code,
          plate,
          model,
          purchase_date,
          purchase_price,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        String(code).trim(),
        plate || '',
        model || '',
        purchase_date || null,
        Number(purchase_price || 0),
        status
      );

      log(
        req,
        'CREATE',
        'Motorcycle',
        result.lastInsertRowid,
        null,
        req.body
      );

      res.json({
        ok: true,
        id: result.lastInsertRowid
      });
    } catch (error) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   MOTORCYCLE STATUS
========================================================= */

app.post(
  '/api/motorcycles/:id/status',
  auth,
  (req, res) => {
    if (!deptOnly(req, ['D4'])) {
      return res.status(403).json({
        error: 'D4 Operations or D1 only'
      });
    }

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      req.params.id
    );

    if (!motorcycle) {
      return res.status(404).json({
        error: 'Motorcycle not found'
      });
    }

    const allowed = [
      'Active',
      'Inactive',
      'Under Maintenance',
      'Sold / Retired'
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        error: 'Invalid status'
      });
    }

    db.prepare(`
      UPDATE motorcycles
      SET status=?
      WHERE id=?
    `).run(
      req.body.status,
      motorcycle.id
    );

    log(
      req,
      'CHANGE',
      'Motorcycle',
      motorcycle.id,
      motorcycle,
      {
        ...motorcycle,
        status: req.body.status
      },
      req.body.reason || ''
    );

    res.json({ ok: true });
  }
);

/* =========================================================
   INCOME
========================================================= */

app.post(
  '/api/income',
  auth,
  (req, res) => {
    if (!['D1', 'D4'].includes(
      req.user.department_id
    )) {
      return res.status(403).json({
        error:
          'Daily motorcycle income is entered by D4 Operations.'
      });
    }

    const {
      date,
      motorcycle_id,
      amount,
      collection_note = ''
    } = req.body;

    if (
      !date ||
      !motorcycle_id ||
      Number(amount) < 0
    ) {
      return res.status(400).json({
        error:
          'Date, motorcycle and valid amount required'
      });
    }

    const motorcycle = one(
      'SELECT id FROM motorcycles WHERE id=?',
      motorcycle_id
    );

    if (!motorcycle) {
      return res.status(400).json({
        error: 'Motorcycle not found'
      });
    }

    const result = db.prepare(`
      INSERT INTO income
      (
        date,
        motorcycle_id,
        amount,
        collection_note,
        entered_by
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      date,
      motorcycle_id,
      Number(amount),
      collection_note,
      req.user.id
    );

    log(
      req,
      'CREATE',
      'Fleet Income',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

/* =========================================================
   INCOME VERIFICATION
========================================================= */

app.post(
  '/api/income/:id/verify',
  auth,
  (req, res) => {
    if (!['D1', 'D3'].includes(
      req.user.department_id
    )) {
      return res.status(403).json({
        error:
          'Only D3 Finance or D1 can verify income'
      });
    }

    const income = one(
      'SELECT * FROM income WHERE id=?',
      req.params.id
    );

    if (!income) {
      return res.status(404).json({
        error: 'Income record not found'
      });
    }

    db.prepare(`
      UPDATE income
      SET verified=1
      WHERE id=?
    `).run(income.id);

    log(
      req,
      'VERIFY',
      'Fleet Income',
      income.id,
      income,
      {
        ...income,
        verified: 1
      },
      req.body.reason || ''
    );

    res.json({ ok: true });
  }
);

/* =========================================================
   EXPENSES
========================================================= */

app.post(
  '/api/expenses',
  auth,
  (req, res) => {
    const {
      date,
      motorcycle_id,
      expense_type,
      amount,
      description = ''
    } = req.body;

    if (
      !date ||
      !expense_type ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({
        error: 'Valid expense required'
      });
    }

    if (motorcycle_id) {
      const motorcycle = one(
        'SELECT id FROM motorcycles WHERE id=?',
        motorcycle_id
      );

      if (!motorcycle) {
        return res.status(400).json({
          error: 'Motorcycle not found'
        });
      }
    }

    const original = {
      date,
      motorcycle_id:
        motorcycle_id || null,
      expense_type,
      amount: Number(amount),
      description
    };

    const result = db.prepare(`
      INSERT INTO expenses
      (
        date,
        motorcycle_id,
        expense_type,
        amount,
        description,
        entered_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      date,
      motorcycle_id || null,
      expense_type,
      Number(amount),
      description,
      req.user.id
    );

    log(
      req,
      'CREATE',
      'Expense',
      result.lastInsertRowid,
      null,
      original
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

/* =========================================================
   TASKS
========================================================= */

app.post(
  '/api/tasks',
  auth,
  (req, res) => {
    const {
      name,
      responsible_user,
      start_date,
      deadline,
      priority = 'Normal',
      description = ''
    } = req.body;

    if (!name || !responsible_user) {
      return res.status(400).json({
        error:
          'Task and responsible person required'
      });
    }

    if (
      !sameDept(req, responsible_user) &&
      !d1(req)
    ) {
      return res.status(403).json({
        error:
          'You can assign tasks only within your department unless you are D1'
      });
    }

    const result = db.prepare(`
      INSERT INTO tasks
      (
        name,
        responsible_user,
        start_date,
        deadline,
        priority,
        description,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      responsible_user,
      start_date || null,
      deadline || null,
      priority,
      description,
      req.user.id
    );

    log(
      req,
      'CREATE',
      'Task',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

app.patch(
  '/api/tasks/:id',
  auth,
  (req, res) => {
    const task = one(
      'SELECT * FROM tasks WHERE id=?',
      req.params.id
    );

    if (!task) {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    if (
      !d1(req) &&
      task.responsible_user !== req.user.id
    ) {
      return res.status(403).json({
        error: 'Not permitted'
      });
    }

    const status =
      req.body.status || task.status;

    const allowedStatuses = [
      'Not Started',
      'In Progress',
      'Completed',
      'Cancelled',
      'On Hold'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid task status'
      });
    }

    db.prepare(`
      UPDATE tasks
      SET status=?
      WHERE id=?
    `).run(status, task.id);

    log(
      req,
      'CHANGE',
      'Task',
      task.id,
      task,
      {
        ...task,
        status
      }
    );

    res.json({ ok: true });
  }
);

/* =========================================================
   REPORTS
========================================================= */

app.post(
  '/api/reports',
  auth,
  (req, res) => {
    const {
      type,
      body,
      date
    } = req.body;

    if (!type || !body) {
      return res.status(400).json({
        error:
          'Report type and body required'
      });
    }

    const result = db.prepare(`
      INSERT INTO reports
      (
        type,
        body,
        user_id,
        date
      )
      VALUES (?, ?, ?, ?)
    `).run(
      type,
      body,
      req.user.id,
      date ||
        new Date()
          .toISOString()
          .slice(0, 10)
    );

    log(
      req,
      'CREATE',
      'Report',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

/* =========================================================
   ACTIVITIES
========================================================= */

app.post(
  '/api/activities',
  auth,
  (req, res) => {
    const {
      date,
      done,
      unfinished,
      reason,
      time_spent
    } = req.body;

    const result = db.prepare(`
      INSERT INTO activities
      (
        user_id,
        date,
        done,
        unfinished,
        reason,
        time_spent
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      date ||
        new Date()
          .toISOString()
          .slice(0, 10),
      done || '',
      unfinished || '',
      reason || '',
      Number(time_spent || 0)
    );

    log(
      req,
      'CREATE',
      'Daily Activity',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

app.get(
  '/api/activities',
  auth,
  (req, res) => {
    const data = rows(
      d1(req)
        ? `
          SELECT
            a.*,
            u.name AS user_name,
            u.department_id
          FROM activities a
          JOIN users u
            ON u.id=a.user_id
          ORDER BY a.id DESC
        `
        : `
          SELECT
            a.*,
            u.name AS user_name,
            u.department_id
          FROM activities a
          JOIN users u
            ON u.id=a.user_id
          WHERE u.department_id=?
          ORDER BY a.id DESC
        `,
      ...(d1(req)
        ? []
        : [req.user.department_id])
    );

    res.json(data);
  }
);

/* =========================================================
   GOALS
========================================================= */

app.get(
  '/api/goals',
  auth,
  (req, res) => {
    res.json(
      rows(
        d1(req)
          ? `
            SELECT
              g.*,
              u.name AS creator_name
            FROM goals g
            JOIN users u
              ON u.id=g.created_by
            ORDER BY g.id DESC
          `
          : `
            SELECT
              g.*,
              u.name AS creator_name
            FROM goals g
            JOIN users u
              ON u.id=g.created_by
            WHERE g.department_id=?
               OR g.department_id IS NULL
            ORDER BY g.id DESC
          `,
        ...(d1(req)
          ? []
          : [req.user.department_id])
      )
    );
  }
);

app.post(
  '/api/goals',
  auth,
  (req, res) => {
    if (
      !d1(req) &&
      ![
        'D2',
        'D3',
        'D4',
        'D5'
      ].includes(req.user.department_id)
    ) {
      return res.status(403).json({
        error: 'Not permitted'
      });
    }

    const {
      title,
      scope = 'Department',
      department_id,
      target = 100,
      achieved = 0,
      period = ''
    } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Title required'
      });
    }

    const dept =
      department_id ||
      req.user.department_id;

    if (
      !d1(req) &&
      dept !== req.user.department_id
    ) {
      return res.status(403).json({
        error: 'Only your department'
      });
    }

    const result = db.prepare(`
      INSERT INTO goals
      (
        title,
        scope,
        department_id,
        target,
        achieved,
        period,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      scope,
      dept,
      Number(target),
      Number(achieved),
      period,
      req.user.id
    );

    log(
      req,
      'CREATE',
      'Goal',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

app.patch(
  '/api/goals/:id',
  auth,
  (req, res) => {
    const goal = one(
      'SELECT * FROM goals WHERE id=?',
      req.params.id
    );

    if (!goal) {
      return res.status(404).json({
        error: 'Goal not found'
      });
    }

    if (
      !d1(req) &&
      goal.department_id !==
        req.user.department_id
    ) {
      return res.status(403).json({
        error: 'Not permitted'
      });
    }

    const next = {
      ...goal,
      achieved:
        req.body.achieved === undefined
          ? goal.achieved
          : Number(req.body.achieved),

      title:
        req.body.title ?? goal.title,

      target:
        req.body.target === undefined
          ? goal.target
          : Number(req.body.target)
    };

    db.prepare(`
      UPDATE goals
      SET
        title=?,
        target=?,
        achieved=?
      WHERE id=?
    `).run(
      next.title,
      next.target,
      next.achieved,
      goal.id
    );

    log(
      req,
      'CHANGE',
      'Goal',
      goal.id,
      goal,
      next
    );

    res.json({ ok: true });
  }
);

/* =========================================================
   ASSIGNMENTS
========================================================= */

app.get(
  '/api/assignments',
  auth,
  (req, res) => {
    if (d1(req)) {
      return res.json(
        rows(`
          SELECT
            a.*,
            m.code AS motorcycle_code
          FROM assignments a
          JOIN motorcycles m
            ON m.id=a.motorcycle_id
          ORDER BY a.id DESC
        `)
      );
    }

    res.json(
      rows(`
        SELECT
          a.*,
          m.code AS motorcycle_code
        FROM assignments a
        JOIN motorcycles m
          ON m.id=a.motorcycle_id
        ORDER BY a.id DESC
      `)
    );
  }
);

app.post(
  '/api/assignments',
  auth,
  (req, res) => {
    if (!deptOnly(req, ['D4'])) {
      return res.status(403).json({
        error: 'D4 Operations or D1 only'
      });
    }

    const {
      motorcycle_id,
      rider_name,
      start_date,
      end_date,
      notes = ''
    } = req.body;

    if (
      !motorcycle_id ||
      !rider_name ||
      !start_date
    ) {
      return res.status(400).json({
        error:
          'Motorcycle, rider and start date required'
      });
    }

    const motorcycle = one(
      'SELECT id FROM motorcycles WHERE id=?',
      motorcycle_id
    );

    if (!motorcycle) {
      return res.status(400).json({
        error: 'Motorcycle not found'
      });
    }

    db.prepare(`
      UPDATE assignments
      SET end_date=?
      WHERE motorcycle_id=?
        AND end_date IS NULL
    `).run(
      start_date,
      motorcycle_id
    );

    const result = db.prepare(`
      INSERT INTO assignments
      (
        motorcycle_id,
        rider_name,
        start_date,
        end_date,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      motorcycle_id,
      rider_name,
      start_date,
      end_date || null,
      notes
    );

    log(
      req,
      'CREATE',
      'Rider Assignment',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

/* =========================================================
   ODOMETER
========================================================= */

app.post(
  '/api/odometer',
  auth,
  (req, res) => {
    const {
      motorcycle_id,
      date,
      mileage
    } = req.body;

    if (
      !motorcycle_id ||
      !date ||
      Number(mileage) < 0
    ) {
      return res.status(400).json({
        error: 'Invalid odometer'
      });
    }

    const motorcycle = one(
      'SELECT id FROM motorcycles WHERE id=?',
      motorcycle_id
    );

    if (!motorcycle) {
      return res.status(400).json({
        error: 'Motorcycle not found'
      });
    }

    const prev = one(`
      SELECT mileage
      FROM odometer
      WHERE motorcycle_id=?
      ORDER BY date DESC, id DESC
      LIMIT 1
    `, motorcycle_id);

    if (
      prev &&
      Number(mileage) < Number(prev.mileage)
    ) {
      return res.status(400).json({
        error:
          'Mileage cannot go backwards'
      });
    }

    const result = db.prepare(`
      INSERT INTO odometer
      (
        motorcycle_id,
        date,
        mileage,
        entered_by
      )
      VALUES (?, ?, ?, ?)
    `).run(
      motorcycle_id,
      date,
      Number(mileage),
      req.user.id
    );

    log(
      req,
      'CREATE',
      'Odometer',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

app.get(
  '/api/odometer',
  auth,
  (req, res) => {
    res.json(
      rows(`
        SELECT
          o.*,
          m.code AS motorcycle_code,
          u.name AS entered_name
        FROM odometer o
        JOIN motorcycles m
          ON m.id=o.motorcycle_id
        JOIN users u
          ON u.id=o.entered_by
        ORDER BY o.date DESC, o.id DESC
      `)
    );
  }
);

/* =========================================================
   MAINTENANCE
========================================================= */

app.post(
  '/api/maintenance',
  auth,
  (req, res) => {
    const {
      motorcycle_id,
      issue,
      date,
      mileage,
      parts,
      cost,
      garage,
      next_service,
      downtime,
      status = 'Completed'
    } = req.body;

    if (
      !motorcycle_id ||
      !issue ||
      !date
    ) {
      return res.status(400).json({
        error:
          'Motorcycle, issue and date required'
      });
    }

    const motorcycle = one(
      'SELECT id FROM motorcycles WHERE id=?',
      motorcycle_id
    );

    if (!motorcycle) {
      return res.status(400).json({
        error: 'Motorcycle not found'
      });
    }

    const result = db.prepare(`
      INSERT INTO maintenance
      (
        motorcycle_id,
        issue,
        date,
        mileage,
        parts,
        cost,
        garage,
        next_service,
        downtime,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      motorcycle_id,
      issue,
      date,
      mileage || null,
      parts || '',
      Number(cost || 0),
      garage || '',
      next_service || null,
      Number(downtime || 0),
      status
    );

    if (status === 'In Progress') {
      db.prepare(`
        UPDATE motorcycles
        SET status='Under Maintenance'
        WHERE id=?
      `).run(motorcycle_id);
    }

    if (
      status === 'Completed' ||
      status === 'Cancelled'
    ) {
      const openMaintenance = one(`
        SELECT id
        FROM maintenance
        WHERE motorcycle_id=?
          AND status='In Progress'
        ORDER BY date DESC, id DESC
        LIMIT 1
      `, motorcycle_id);

      if (!openMaintenance) {
        db.prepare(`
          UPDATE motorcycles
          SET status='Active'
          WHERE id=?
            AND status='Under Maintenance'
        `).run(motorcycle_id);
      }
    }

    log(
      req,
      'CREATE',
      'Maintenance',
      result.lastInsertRowid,
      null,
      req.body
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

app.get(
  '/api/maintenance',
  auth,
  (req, res) => {
    res.json(
      rows(`
        SELECT
          m.*,
          x.code AS motorcycle_code
        FROM maintenance m
        JOIN motorcycles x
          ON x.id=m.motorcycle_id
        ORDER BY m.date DESC, m.id DESC
      `)
    );
  }
);

/* =========================================================
   FLEET DETAIL
========================================================= */

app.get(
  '/api/fleet-detail/:id',
  auth,
  (req, res) => {
    const id = req.params.id;

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      id
    );

    if (!motorcycle) {
      return res.status(404).json({
        error: 'Motorcycle not found'
      });
    }

    res.json({
      motorcycle,

      income: rows(`
        SELECT
          i.*,
          u.name AS entered_name
        FROM income i
        JOIN users u
          ON u.id=i.entered_by
        WHERE i.motorcycle_id=?
        ORDER BY i.date DESC, i.id DESC
      `, id),

      expenses: rows(`
        SELECT
          e.*,
          u.name AS entered_name
        FROM expenses e
        JOIN users u
          ON u.id=e.entered_by
        WHERE e.motorcycle_id=?
        ORDER BY e.date DESC, e.id DESC
      `, id),

      maintenance: rows(`
        SELECT *
        FROM maintenance
        WHERE motorcycle_id=?
        ORDER BY date DESC, id DESC
      `, id),

      odometer: rows(`
        SELECT
          o.*,
          u.name AS entered_name
        FROM odometer o
        JOIN users u
          ON u.id=o.entered_by
        WHERE o.motorcycle_id=?
        ORDER BY date DESC, id DESC
      `, id),

      assignments: rows(`
        SELECT *
        FROM assignments
        WHERE motorcycle_id=?
        ORDER BY start_date DESC, id DESC
      `, id)
    });
  }
);

/* =========================================================
   DAILY CLOSING
========================================================= */

app.post(
  '/api/daily-closing',
  auth,
  (req, res) => {
    if (!deptOnly(req, ['D4'])) {
      return res.status(403).json({
        error:
          'D4 Operations or D1 only'
      });
    }

    const date =
      req.body.date ||
      new Date()
        .toISOString()
        .slice(0, 10);

    const income = one(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM income
      WHERE date=?
    `, date).total;

    const expenses = one(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE date=?
    `, date).total;

    const net =
      Number(income) -
      Number(expenses);

    try {
      const result = db.prepare(`
        INSERT INTO daily_closings
        (
          date,
          income,
          expenses,
          net,
          closed_by,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        date,
        income,
        expenses,
        net,
        req.user.id,
        req.body.notes || ''
      );

      log(
        req,
        'CREATE',
        'Daily Closing',
        result.lastInsertRowid,
        null,
        {
          date,
          income,
          expenses,
          net,
          notes: req.body.notes || ''
        }
      );

      res.json({
        ok: true,
        id: result.lastInsertRowid,
        income,
        expenses,
        net
      });
    } catch (error) {
      res.status(400).json({
        error:
          'Closing already exists for this date'
      });
    }
  }
);

app.get(
  '/api/daily-closings',
  auth,
  (req, res) => {
    res.json(
      rows(`
        SELECT
          c.*,
          u.name AS closed_by_name
        FROM daily_closings c
        JOIN users u
          ON u.id=c.closed_by
        ORDER BY c.date DESC, c.id DESC
      `)
    );
  }
);

/* =========================================================
   EVIDENCE
========================================================= */

app.post(
  '/api/evidence',
  auth,
  (req, res) => {
    upload.single('file')(
      req,
      res,
      (error) => {
        if (error) {
          return res.status(400).json({
            error: error.message
          });
        }

        if (!req.file) {
          return res.status(400).json({
            error: 'File required'
          });
        }

        const result = db.prepare(`
          INSERT INTO evidence
          (
            filename,
            original_name,
            mime,
            uploaded_by,
            task_id,
            report_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.user.id,
          req.body.task_id ||
            null,
          req.body.report_id ||
            null
        );

        log(
          req,
          'CREATE',
          'Evidence',
          result.lastInsertRowid,
          null,
          {
            original_name:
              req.file.originalname,
            task_id:
              req.body.task_id,
            report_id:
              req.body.report_id
          }
        );

        res.json({
          ok: true,
          id: result.lastInsertRowid,
          url:
            '/uploads/' +
            req.file.filename
        });
      }
    );
  }
);

app.get(
  '/api/evidence',
  auth,
  (req, res) => {
    res.json(
      rows(
        d1(req)
          ? `
            SELECT
              e.*,
              u.name AS uploaded_name
            FROM evidence e
            JOIN users u
              ON u.id=e.uploaded_by
            ORDER BY e.id DESC
          `
          : `
            SELECT
              e.*,
              u.name AS uploaded_name
            FROM evidence e
            JOIN users u
              ON u.id=e.uploaded_by
            WHERE u.department_id=?
            ORDER BY e.id DESC
          `,
        ...(d1(req)
          ? []
          : [req.user.department_id])
      )
    );
  }
);

/* =========================================================
   AUDIT
========================================================= */

app.get(
  '/api/audit',
  auth,
  (req, res) => {
    const q = String(
      req.query.q || ''
    ).toLowerCase();

    const data = rows(
      d1(req)
        ? `
          SELECT
            a.*,
            u.name AS user_name
          FROM audit a
          LEFT JOIN users u
            ON u.id=a.who_user
          ORDER BY a.id DESC
        `
        : `
          SELECT
            a.*,
            u.name AS user_name
          FROM audit a
          LEFT JOIN users u
            ON u.id=a.who_user
          WHERE u.department_id=?
          ORDER BY a.id DESC
        `,
      ...(d1(req)
        ? []
        : [req.user.department_id])
    );

    res.json(
      data.filter((item) =>
        JSON.stringify(item)
          .toLowerCase()
          .includes(q)
      )
    );
  }
);

/* =========================================================
   FINANCE CHANGES
========================================================= */

app.post(
  '/api/finance-changes',
  auth,
  (req, res) => {
    if (
      !['D3', 'D4'].includes(
        req.user.department_id
      ) &&
      !d1(req)
    ) {
      return res.status(403).json({
        error:
          'Finance changes are restricted'
      });
    }

    const {
      record_type,
      record_id,
      original,
      proposed,
      reason
    } = req.body;

    if (
      !record_type ||
      !record_id ||
      !reason
    ) {
      return res.status(400).json({
        error:
          'Record type, record ID and reason are mandatory'
      });
    }

    const result = db.prepare(`
      INSERT INTO finance_changes
      (
        record_type,
        record_id,
        original_json,
        proposed_json,
        reason,
        requested_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record_type,
      record_id,
      JSON.stringify(
        original || {}
      ),
      JSON.stringify(
        proposed || {}
      ),
      reason,
      req.user.id
    );

    log(
      req,
      'PROPOSE_CHANGE',
      record_type,
      record_id,
      original || {},
      proposed || {},
      reason
    );

    res.json({
      ok: true,
      id: result.lastInsertRowid
    });
  }
);

app.post(
  '/api/finance-changes/:id/decision',
  auth,
  (req, res) => {
    if (!d1(req)) {
      return res.status(403).json({
        error:
          'Only D1 can approve or reject'
      });
    }

    const change = one(
      'SELECT * FROM finance_changes WHERE id=?',
      req.params.id
    );

    if (
      !change ||
      change.status !==
        'Pending Approval'
    ) {
      return res.status(404).json({
        error: 'Change not pending'
      });
    }

    const decision =
      req.body.decision;

    if (
      !['Approved', 'Rejected'].includes(
        decision
      )
    ) {
      return res.status(400).json({
        error:
          'Decision must be Approved or Rejected'
      });
    }

    db.prepare(`
      UPDATE finance_changes
      SET
        status=?,
        decided_by=?,
        decision_note=?,
        decided_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      decision,
      req.user.id,
      req.body.note || '',
      change.id
    );

    log(
      req,
      'FINANCE_DECISION',
      change.record_type,
      change.record_id,
      JSON.parse(
        change.original_json
      ),
      JSON.parse(
        change.proposed_json
      ),
      `${decision}: ${
        req.body.note || ''
      }`
    );

    res.json({
      ok: true,
      status: decision
    });
  }
);

/* =========================================================
   USERS / ACCOUNT MANAGEMENT
========================================================= */

app.get(
  '/api/users',
  auth,
  (req, res) => {
    if (!d1(req)) {
      return res.status(403).json({
        error:
          'Only D1 can manage accounts'
      });
    }

    res.json(
      rows(`
        SELECT
          id,
          name,
          username,
          department_id,
          active,
          created_at
        FROM users
        ORDER BY id
      `)
    );
  }
);

app.post(
  '/api/users',
  auth,
  (req, res) => {
    if (!d1(req)) {
      return res.status(403).json({
        error:
          'Only D1 can create accounts'
      });
    }

    const {
      name,
      username,
      password,
      department_id
    } = req.body;

    if (
      !name ||
      !username ||
      !password ||
      !department_id ||
      password.length < 10
    ) {
      return res.status(400).json({
        error:
          'Name, username, department and password (10+ chars) are required'
      });
    }

    const department = one(
      'SELECT id FROM departments WHERE id=?',
      department_id
    );

    if (!department) {
      return res.status(400).json({
        error:
          'Invalid department'
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO users
        (
          name,
          username,
          password_hash,
          department_id
        )
        VALUES (?, ?, ?, ?)
      `).run(
        name.trim(),
        username.trim().toLowerCase(),
        bcrypt.hashSync(password, 12),
        department_id
      );

      log(
        req,
        'CREATE',
        'User',
        result.lastInsertRowid,
        null,
        {
          name,
          username,
          department_id
        }
      );

      res.json({
        ok: true,
        id: result.lastInsertRowid
      });
    } catch (error) {
      res.status(400).json({
        error:
          'Username already exists or invalid department'
      });
    }
  }
);

app.patch(
  '/api/users/:id',
  auth,
  (req, res) => {
    if (!d1(req)) {
      return res.status(403).json({
        error:
          'Only D1 can update accounts'
      });
    }

    const user = one(
      'SELECT * FROM users WHERE id=?',
      req.params.id
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const department_id =
      req.body.department_id ||
      user.department_id;

    const active =
      req.body.active === undefined
        ? user.active
        : req.body.active
          ? 1
          : 0;

    const name =
      req.body.name || user.name;

    if (
      !one(
        'SELECT id FROM departments WHERE id=?',
        department_id
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid department'
      });
    }

    const changed = {
      name,
      department_id,
      active
    };

    const newPassword =
      req.body.password
        ? bcrypt.hashSync(
            req.body.password,
            12
          )
        : null;

    db.prepare(`
      UPDATE users
      SET
        name=?,
        department_id=?,
        active=?,
        password_hash=
          CASE
            WHEN ? IS NULL
              THEN password_hash
            ELSE ?
          END
      WHERE id=?
    `).run(
      name,
      department_id,
      active,
      newPassword,
      newPassword,
      user.id
    );

    log(
      req,
      'CHANGE',
      'User',
      user.id,
      user,
      changed,
      req.body.reason || ''
    );

    res.json({ ok: true });
  }
);

/* =========================================================
   FLEET SUMMARY
========================================================= */

app.get(
  '/api/fleet-summary',
  auth,
  (req, res) => {
    const income = one(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM income
    `).total;

    const expense = one(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE motorcycle_id IS NOT NULL
    `).total;

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const todayIncome = one(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM income
      WHERE date=?
    `, today).total;

    const todayExpenses = one(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE date=?
        AND motorcycle_id IS NOT NULL
    `, today).total;

    res.json({
      totalMotorcycles:
        one(`
          SELECT COUNT(*) AS n
          FROM motorcycles
        `).n,

      active:
        one(`
          SELECT COUNT(*) AS n
          FROM motorcycles
          WHERE status='Active'
        `).n,

      inactive:
        one(`
          SELECT COUNT(*) AS n
          FROM motorcycles
          WHERE status='Inactive'
        `).n,

      maintenance:
        one(`
          SELECT COUNT(*) AS n
          FROM motorcycles
          WHERE status='Under Maintenance'
        `).n,

      sold:
        one(`
          SELECT COUNT(*) AS n
          FROM motorcycles
          WHERE status='Sold / Retired'
        `).n,

      todayIncome,
      todayExpenses,
      todayNet:
        Number(todayIncome) -
        Number(todayExpenses),

      totalIncome: income,
      totalExpenses: expense,

      net:
        Number(income) -
        Number(expense)
    });
  }
);

/* =========================================================
   ALERTS
========================================================= */

app.get(
  '/api/alerts',
  auth,
  (req, res) => {
    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const output = [];

    rows(`
      SELECT *
      FROM motorcycles
      WHERE status='Under Maintenance'
    `).forEach((motorcycle) => {
      output.push({
        level: 'danger',
        text:
          `${motorcycle.code} is under maintenance`
      });
    });

    rows(`
      SELECT *
      FROM maintenance
      WHERE next_service IS NOT NULL
    `).forEach((maintenance) => {
      if (
        maintenance.next_service <= today
      ) {
        output.push({
          level: 'warning',
          text:
            `${maintenance.motorcycle_id} maintenance service due/overdue`
        });
      }
    });

    rows(`
      SELECT *
      FROM tasks
      WHERE status <> 'Completed'
        AND deadline IS NOT NULL
        AND deadline < ?
    `, today).forEach((task) => {
      output.push({
        level: 'danger',
        text:
          `Task overdue: ${task.name}`
      });
    });

    res.json(output);
  }
);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  '/uploads',
  auth,
  express.static(UPLOAD_DIR)
);

app.use(
  express.static(
    path.join(ROOT, 'public'),
    {
      index: 'index.html'
    }
  )
);

/* =========================================================
   API 404
========================================================= */

app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      error: 'API endpoint not found'
    });
  }
);

/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.use(
  (req, res) => {
    const indexPath =
      path.join(
        ROOT,
        'public',
        'index.html'
      );

    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }

    res.status(404).send(
      'THE BG WEB frontend is not installed.'
    );
  }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      error:
        NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message
    });
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      `THE BG WEB running on port ${PORT}`
    );
  }
);
