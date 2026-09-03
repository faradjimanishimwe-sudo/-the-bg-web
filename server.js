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

if (NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error('Production requires a JWT_SECRET of at least 32 characters.');
}

const EFFECTIVE_JWT_SECRET =
  JWT_SECRET || 'development-only-change-me-before-production-123456789';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const DB_PATH =
  process.env.DATABASE_PATH || path.join(ROOT, 'data', 'thebg.sqlite');

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

function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function json(value) {
  return JSON.stringify(value == null ? null : value);
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

/* =========================================================
   DATABASE SCHEMA
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
   SAFE MIGRATIONS
========================================================= */

try {
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();

  if (!taskColumns.some(c => c.name === 'rejection_reason')) {
    db.exec('ALTER TABLE tasks ADD COLUMN rejection_reason TEXT');
  }
} catch (error) {
  console.error('TASK MIGRATION ERROR:', error);
  throw error;
}

/* =========================================================
   SEED DEPARTMENTS / INITIAL USERS
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

const insertDept = db.prepare(`
  INSERT OR IGNORE INTO departments
  (id, position, person, responsibility)
  VALUES (?, ?, ?, ?)
`);

for (const d of departments) {
  insertDept.run(...d);
}

if (one('SELECT COUNT(*) AS n FROM users').n === 0) {
  const initialPassword =
    process.env.INITIAL_ADMIN_PASSWORD ||
    (NODE_ENV === 'production' ? null : '1234');

  if (!initialPassword) {
    throw new Error(
      'Set INITIAL_ADMIN_PASSWORD before first production start.'
    );
  }

  const hash = bcrypt.hashSync(initialPassword, 12);

  const insertUser = db.prepare(`
    INSERT INTO users
    (name, username, password_hash, department_id, active)
    VALUES (?, ?, ?, ?, 1)
  `);

  for (const d of departments) {
    insertUser.run(
      d[2],
      d[0].toLowerCase(),
      hash,
      d[0]
    );
  }
}

/* =========================================================
   MIDDLEWARE / SECURITY
========================================================= */

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
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
   LOGIN RATE LIMIT
========================================================= */

const loginAttempts = new Map();

function loginLimiter(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;

  let record = loginAttempts.get(key);

  if (!record || now - record.startedAt > windowMs) {
    record = {
      startedAt: now,
      count: 0
    };
  }

  record.count += 1;
  loginAttempts.set(key, record);

  if (record.count > maxAttempts) {
    return res.status(429).json({
      ok: false,
      error: 'Too many login attempts. Try again later.'
    });
  }

  next();
}

/* =========================================================
   FILE UPLOAD
========================================================= */

const allowedMimeTypes = new Set([
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

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const base =
      path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 60) || 'file';

    cb(
      null,
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${base}${ext}`
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (_, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        Object.assign(
          new Error('Unsupported file type.'),
          { status: 400 }
        )
      );
    }

    cb(null, true);
  }
});

/* =========================================================
   HELPERS
========================================================= */

function fail(res, error) {
  console.error(error);

  const status = error.status || 500;

  return res.status(status).json({
    ok: false,
    error:
      status >= 500
        ? 'Internal server error.'
        : error.message
  });
}

function auth(req, res, next) {
  try {
    const token = req.cookies.bg_token;

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required.'
      });
    }

    const payload = jwt.verify(
      token,
      EFFECTIVE_JWT_SECRET
    );

    const user = one(
      `
      SELECT
        id,
        name,
        username,
        department_id,
        active,
        created_at
      FROM users
      WHERE id=?
      `,
      payload.id
    );

    if (!user || !user.active) {
      res.clearCookie('bg_token');
      return res.status(401).json({
        ok: false,
        error: 'Account is inactive or unavailable.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.clearCookie('bg_token');

    return res.status(401).json({
      ok: false,
      error: 'Invalid or expired session.'
    });
  }
}

function d1(req) {
  return req.user && req.user.department_id === 'D1';
}

function hasDept(req, departments) {
  return departments.includes(req.user.department_id);
}

function deptOnly(req, departments) {
  if (!hasDept(req, departments)) {
    throw Object.assign(
      new Error('Permission denied.'),
      { status: 403 }
    );
  }
}

function userCanSeeUser(req, userId) {
  if (d1(req)) return true;

  const target = one(
    'SELECT id, department_id FROM users WHERE id=?',
    userId
  );

  return !!(
    target &&
    (
      target.id === req.user.id ||
      target.department_id === req.user.department_id
    )
  );
}

function taskScope(req) {
  if (d1(req)) {
    return {
      sql: '1=1',
      params: []
    };
  }

  return {
    sql: `
      (
        t.created_by=? OR
        t.responsible_user=? OR
        t.responsible_user IN (
          SELECT id
          FROM users
          WHERE department_id=?
        )
      )
    `,
    params: [
      req.user.id,
      req.user.id,
      req.user.department_id
    ]
  };
}

function reportScope(req) {
  if (d1(req)) {
    return {
      sql: '1=1',
      params: []
    };
  }

  return {
    sql: `
      (
        r.user_id=? OR
        r.user_id IN (
          SELECT id
          FROM users
          WHERE department_id=?
        )
      )
    `,
    params: [
      req.user.id,
      req.user.department_id
    ]
  };
}

function activityScope(req) {
  if (d1(req)) {
    return {
      sql: '1=1',
      params: []
    };
  }

  return {
    sql: `
      (
        a.user_id=? OR
        a.user_id IN (
          SELECT id
          FROM users
          WHERE department_id=?
        )
      )
    `,
    params: [
      req.user.id,
      req.user.department_id
    ]
  };
}

function goalScope(req) {
  if (d1(req)) {
    return {
      sql: '1=1',
      params: []
    };
  }

  return {
    sql: `
      (
        g.created_by=? OR
        g.department_id=? OR
        g.scope='Company'
      )
    `,
    params: [
      req.user.id,
      req.user.department_id
    ]
  };
}

function motorcycleAllowed(req, motorcycleId) {
  if (d1(req)) return true;

  if (hasDept(req, ['D3', 'D4'])) return true;

  return false;
}

function evidenceAllowed(req, evidence) {
  if (d1(req)) return true;

  if (evidence.uploaded_by === req.user.id) {
    return true;
  }

  if (evidence.task_id) {
    const task = one(
      `
      SELECT t.*,
             ru.department_id AS responsible_department
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      WHERE t.id=?
      `,
      evidence.task_id
    );

    if (
      task &&
      (
        task.created_by === req.user.id ||
        task.responsible_user === req.user.id ||
        task.responsible_department === req.user.department_id
      )
    ) {
      return true;
    }
  }

  if (evidence.report_id) {
    const report = one(
      `
      SELECT r.*,
             u.department_id
      FROM reports r
      JOIN users u
        ON u.id=r.user_id
      WHERE r.id=?
      `,
      evidence.report_id
    );

    if (
      report &&
      (
        report.user_id === req.user.id ||
        report.department_id === req.user.department_id
      )
    ) {
      return true;
    }
  }

  return false;
}

function log(
  action,
  recordType,
  recordId,
  original,
  changed,
  reason,
  userId
) {
  run(
    `
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
    `,
    action,
    recordType,
    recordId || null,
    original == null ? null : json(original),
    changed == null ? null : json(changed),
    reason || null,
    userId || null
  );
}

/* =========================================================
   AUTH
========================================================= */

app.post('/api/login', loginLimiter, (req, res) => {
  try {
    const username =
      String(req.body.username || '')
        .trim()
        .toLowerCase();

    const password =
      String(req.body.password || '');

    if (!username || !password) {
      throw Object.assign(
        new Error('Username and password are required.'),
        { status: 400 }
      );
    }

    const user = one(
      `
      SELECT *
      FROM users
      WHERE username=?
      `,
      username
    );

    if (
      !user ||
      !user.active ||
      !bcrypt.compareSync(password, user.password_hash)
    ) {
      throw Object.assign(
        new Error('Invalid username or password.'),
        { status: 401 }
      );
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        department_id: user.department_id
      },
      EFFECTIVE_JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    res.cookie('bg_token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        department_id: user.department_id,
        active: user.active
      }
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('bg_token', {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  res.json({
    ok: true
  });
});

app.get('/api/me', auth, (req, res) => {
  res.json({
    ok: true,
    user: req.user
  });
});

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    service: 'THE BG WEB',
    status: 'healthy',
    time: new Date().toISOString()
  });
});

/* =========================================================
   BOOTSTRAP
========================================================= */

app.get('/api/bootstrap', auth, (req, res) => {
  try {
    const ts = taskScope(req);
    const rs = reportScope(req);
    const as = activityScope(req);
    const gs = goalScope(req);

    const departmentsData = rows(`
      SELECT *
      FROM departments
      ORDER BY id
    `);

    const usersData = d1(req)
      ? rows(`
          SELECT
            id,
            name,
            username,
            department_id,
            active,
            created_at
          FROM users
          ORDER BY department_id, id
        `)
      : rows(
          `
          SELECT
            id,
            name,
            username,
            department_id,
            active,
            created_at
          FROM users
          WHERE department_id=? OR id=?
          ORDER BY department_id, id
          `,
          req.user.department_id,
          req.user.id
        );

    const tasksData = rows(
      `
      SELECT
        t.*,
        ru.name AS responsible_name,
        ru.department_id AS responsible_department,
        cu.name AS created_by_name
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      JOIN users cu
        ON cu.id=t.created_by
      WHERE ${ts.sql}
      ORDER BY
        CASE t.status
          WHEN 'Rejected' THEN 1
          WHEN 'In Progress' THEN 2
          WHEN 'Accepted' THEN 3
          WHEN 'Not Started' THEN 4
          WHEN 'On Hold' THEN 5
          WHEN 'Completed' THEN 6
          ELSE 7
        END,
        CASE t.priority
          WHEN 'Urgent' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Normal' THEN 3
          WHEN 'Low' THEN 4
          ELSE 5
        END,
        t.deadline
      `,
      ...ts.params
    );

    const reportsData = rows(
      `
      SELECT
        r.*,
        u.name AS user_name,
        u.department_id
      FROM reports r
      JOIN users u
        ON u.id=r.user_id
      WHERE ${rs.sql}
      ORDER BY r.date DESC, r.id DESC
      LIMIT 500
      `,
      ...rs.params
    );

    const activitiesData = rows(
      `
      SELECT
        a.*,
        u.name AS user_name,
        u.department_id
      FROM activities a
      JOIN users u
        ON u.id=a.user_id
      WHERE ${as.sql}
      ORDER BY a.date DESC, a.id DESC
      LIMIT 500
      `,
      ...as.params
    );

    const goalsData = rows(
      `
      SELECT
        g.*,
        d.position,
        d.person,
        u.name AS created_by_name
      FROM goals g
      LEFT JOIN departments d
        ON d.id=g.department_id
      JOIN users u
        ON u.id=g.created_by
      WHERE ${gs.sql}
      ORDER BY g.id DESC
      `,
      ...gs.params
    );

    const motorcyclesData = hasDept(
      req,
      ['D1', 'D3', 'D4']
    )
      ? rows(`
          SELECT *
          FROM motorcycles
          ORDER BY id
        `)
      : [];

    const incomeData = d1(req) || req.user.department_id === 'D3'
      ? rows(`
          SELECT
            i.*,
            m.code AS motorcycle_code,
            m.plate AS motorcycle_plate,
            u.name AS entered_by_name
          FROM income i
          JOIN motorcycles m
            ON m.id=i.motorcycle_id
          JOIN users u
            ON u.id=i.entered_by
          ORDER BY i.date DESC, i.id DESC
          LIMIT 1000
        `)
      : req.user.department_id === 'D4'
        ? rows(
            `
            SELECT
              i.*,
              m.code AS motorcycle_code,
              m.plate AS motorcycle_plate,
              u.name AS entered_by_name
            FROM income i
            JOIN motorcycles m
              ON m.id=i.motorcycle_id
            JOIN users u
              ON u.id=i.entered_by
            WHERE i.entered_by=?
            ORDER BY i.date DESC, i.id DESC
            LIMIT 1000
            `,
            req.user.id
          )
        : [];

    const expensesData = d1(req) || req.user.department_id === 'D3'
      ? rows(`
          SELECT
            e.*,
            m.code AS motorcycle_code,
            m.plate AS motorcycle_plate,
            u.name AS entered_by_name
          FROM expenses e
          LEFT JOIN motorcycles m
            ON m.id=e.motorcycle_id
          JOIN users u
            ON u.id=e.entered_by
          ORDER BY e.date DESC, e.id DESC
          LIMIT 1000
        `)
      : req.user.department_id === 'D4'
        ? rows(
            `
            SELECT
              e.*,
              m.code AS motorcycle_code,
              m.plate AS motorcycle_plate,
              u.name AS entered_by_name
            FROM expenses e
            LEFT JOIN motorcycles m
              ON m.id=e.motorcycle_id
            JOIN users u
              ON u.id=e.entered_by
            WHERE e.entered_by=?
            ORDER BY e.date DESC, e.id DESC
            LIMIT 1000
            `,
            req.user.id
          )
        : [];

    const maintenanceData = hasDept(
      req,
      ['D1', 'D3', 'D4']
    )
      ? rows(`
          SELECT
            ma.*,
            m.code AS motorcycle_code,
            m.plate AS motorcycle_plate
          FROM maintenance ma
          JOIN motorcycles m
            ON m.id=ma.motorcycle_id
          ORDER BY ma.date DESC, ma.id DESC
          LIMIT 1000
        `)
      : [];

    const assignmentsData = hasDept(
      req,
      ['D1', 'D3', 'D4']
    )
      ? rows(`
          SELECT
            a.*,
            m.code AS motorcycle_code,
            m.plate AS motorcycle_plate
          FROM assignments a
          JOIN motorcycles m
            ON m.id=a.motorcycle_id
          ORDER BY
            CASE WHEN a.end_date IS NULL THEN 0 ELSE 1 END,
            a.start_date DESC,
            a.id DESC
        `)
      : [];

    const odometerData = hasDept(
      req,
      ['D1', 'D3', 'D4']
    )
      ? rows(`
          SELECT
            o.*,
            m.code AS motorcycle_code,
            m.plate AS motorcycle_plate,
            u.name AS entered_by_name
          FROM odometer o
          JOIN motorcycles m
            ON m.id=o.motorcycle_id
          JOIN users u
            ON u.id=o.entered_by
          ORDER BY o.date DESC, o.id DESC
          LIMIT 1000
        `)
      : [];

    const dailyClosingsData = hasDept(
      req,
      ['D1', 'D3', 'D4']
    )
      ? rows(`
          SELECT
            dc.*,
            u.name AS closed_by_name
          FROM daily_closings dc
          JOIN users u
            ON u.id=dc.closed_by
          ORDER BY dc.date DESC, dc.id DESC
          LIMIT 500
        `)
      : [];

    const evidenceData = d1(req)
      ? rows(`
          SELECT
            e.*,
            u.name AS uploaded_by_name
          FROM evidence e
          JOIN users u
            ON u.id=e.uploaded_by
          ORDER BY e.uploaded_at DESC
          LIMIT 1000
        `)
      : rows(
          `
          SELECT
            e.*,
            u.name AS uploaded_by_name
          FROM evidence e
          JOIN users u
            ON u.id=e.uploaded_by
          WHERE
            u.department_id=? OR
            e.uploaded_by=? OR
            e.task_id IN (
              SELECT id
              FROM tasks
              WHERE responsible_user=? OR created_by=?
            ) OR
            e.report_id IN (
              SELECT id
              FROM reports
              WHERE user_id=?
            )
          ORDER BY e.uploaded_at DESC
          LIMIT 1000
          `,
          req.user.department_id,
          req.user.id,
          req.user.id,
          req.user.id,
          req.user.id
        );

    const auditData = d1(req)
      ? rows(`
          SELECT
            a.*,
            u.name AS who_name,
            u.department_id
          FROM audit a
          LEFT JOIN users u
            ON u.id=a.who_user
          ORDER BY a.when_at DESC, a.id DESC
          LIMIT 1000
        `)
      : rows(
          `
          SELECT
            a.*,
            u.name AS who_name,
            u.department_id
          FROM audit a
          LEFT JOIN users u
            ON u.id=a.who_user
          WHERE
            a.who_user=? OR
            u.department_id=?
          ORDER BY a.when_at DESC, a.id DESC
          LIMIT 500
          `,
          req.user.id,
          req.user.department_id
        );

    const financeChangesData = hasDept(
      req,
      ['D1', 'D3', 'D4']
    )
      ? d1(req)
        ? rows(`
            SELECT
              fc.*,
              ru.name AS requested_by_name,
              du.name AS decided_by_name
            FROM finance_changes fc
            JOIN users ru
              ON ru.id=fc.requested_by
            LEFT JOIN users du
              ON du.id=fc.decided_by
            ORDER BY fc.created_at DESC, fc.id DESC
            LIMIT 1000
          `)
        : rows(
            `
            SELECT
              fc.*,
              ru.name AS requested_by_name,
              du.name AS decided_by_name
            FROM finance_changes fc
            JOIN users ru
              ON ru.id=fc.requested_by
            LEFT JOIN users du
              ON du.id=fc.decided_by
            WHERE
              fc.requested_by=? OR
              ru.department_id=?
            ORDER BY fc.created_at DESC, fc.id DESC
            LIMIT 500
            `,
            req.user.id,
            req.user.department_id
          )
      : [];

    res.json({
      ok: true,
      departments: departmentsData,
      users: usersData,
      tasks: tasksData,
      reports: reportsData,
      activities: activitiesData,
      goals: goalsData,
      motorcycles: motorcyclesData,
      income: incomeData,
      expenses: expensesData,
      maintenance: maintenanceData,
      assignments: assignmentsData,
      odometer: odometerData,
      dailyClosings: dailyClosingsData,
      evidence: evidenceData.map(e => ({
        ...e,
        url: `/api/evidence/${e.id}/file`
      })),
      audit: auditData,
      financeChanges: financeChangesData
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   TASKS
========================================================= */

app.post('/api/tasks', auth, (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const responsibleUser = Number(
      req.body.responsible_user
    );
    const startDate =
      req.body.start_date == null
        ? null
        : String(req.body.start_date);

    const deadline =
      req.body.deadline == null
        ? null
        : String(req.body.deadline);

    const priority =
      String(req.body.priority || 'Normal').trim();

    const description =
      req.body.description == null
        ? null
        : String(req.body.description);

    if (!name || !responsibleUser) {
      throw Object.assign(
        new Error(
          'Task name and responsible user are required.'
        ),
        { status: 400 }
      );
    }

    if (
      !['Low', 'Normal', 'High', 'Urgent'].includes(
        priority
      )
    ) {
      throw Object.assign(
        new Error('Invalid task priority.'),
        { status: 400 }
      );
    }

    const responsible = one(
      `
      SELECT id,name,department_id,active
      FROM users
      WHERE id=?
      `,
      responsibleUser
    );

    if (!responsible || !responsible.active) {
      throw Object.assign(
        new Error('Responsible user is not active.'),
        { status: 400 }
      );
    }

    if (
      !d1(req) &&
      responsible.department_id !== req.user.department_id
    ) {
      throw Object.assign(
        new Error(
          'You can only assign tasks within your department.'
        ),
        { status: 403 }
      );
    }

    const result = run(
      `
      INSERT INTO tasks
      (
        name,
        responsible_user,
        start_date,
        deadline,
        priority,
        description,
        status,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Not Started', ?)
      `,
      name,
      responsibleUser,
      startDate,
      deadline,
      priority,
      description,
      req.user.id
    );

    const task = one(
      `
      SELECT
        t.*,
        ru.name AS responsible_name,
        ru.department_id AS responsible_department,
        cu.name AS created_by_name
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      JOIN users cu
        ON cu.id=t.created_by
      WHERE t.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'task',
      task.id,
      null,
      task,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      task
    });
  } catch (error) {
    fail(res, error);
  }
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  try {
    const id = Number(req.params.id);

    const task = one(
      `
      SELECT
        t.*,
        ru.department_id AS responsible_department
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      WHERE t.id=?
      `,
      id
    );

    if (!task) {
      throw Object.assign(
        new Error('Task not found.'),
        { status: 404 }
      );
    }

    const canManage =
      d1(req) ||
      task.created_by === req.user.id ||
      task.responsible_user === req.user.id ||
      task.responsible_department === req.user.department_id;

    if (!canManage) {
      throw Object.assign(
        new Error('Permission denied.'),
        { status: 403 }
      );
    }

    const requestedStatus =
      req.body.status == null
        ? task.status
        : String(req.body.status).trim();

    const allowedStatuses = [
      'Not Started',
      'Accepted',
      'Rejected',
      'In Progress',
      'Completed',
      'Cancelled',
      'On Hold'
    ];

    if (!allowedStatuses.includes(requestedStatus)) {
      throw Object.assign(
        new Error('Invalid task status.'),
        { status: 400 }
      );
    }

    const rejectionReason =
      req.body.rejection_reason == null
        ? null
        : String(req.body.rejection_reason).trim();

    if (
      requestedStatus === 'Rejected' &&
      !rejectionReason
    ) {
      throw Object.assign(
        new Error(
          'A rejection reason is required.'
        ),
        { status: 400 }
      );
    }

    if (!d1(req)) {
      if (
        requestedStatus === 'Accepted' &&
        task.responsible_user !== req.user.id
      ) {
        throw Object.assign(
          new Error(
            'Only the responsible user can accept the task.'
          ),
          { status: 403 }
        );
      }

      if (
        requestedStatus === 'Rejected' &&
        task.responsible_user !== req.user.id
      ) {
        throw Object.assign(
          new Error(
            'Only the responsible user can reject the task.'
          ),
          { status: 403 }
        );
      }

      if (
        requestedStatus === 'Accepted' &&
        task.status !== 'Not Started'
      ) {
        throw Object.assign(
          new Error(
            'Only Not Started tasks can be accepted.'
          ),
          { status: 409 }
        );
      }

      if (
        requestedStatus === 'In Progress' &&
        task.status !== 'Accepted'
      ) {
        throw Object.assign(
          new Error(
            'Task must be Accepted before it can be In Progress.'
          ),
          { status: 409 }
        );
      }

      if (
        requestedStatus === 'Completed' &&
        task.status !== 'In Progress'
      ) {
        throw Object.assign(
          new Error(
            'Task must be In Progress before it can be Completed.'
          ),
          { status: 409 }
        );
      }

      if (
        task.status === 'Completed' &&
        requestedStatus !== 'Completed'
      ) {
        throw Object.assign(
          new Error(
            'Completed tasks can only be changed by D1.'
          ),
          { status: 403 }
        );
      }

      if (
        requestedStatus === 'Cancelled' &&
        task.created_by !== req.user.id
      ) {
        throw Object.assign(
          new Error(
            'Only the task creator or D1 can cancel a task.'
          ),
          { status: 403 }
        );
      }

      if (
        requestedStatus === 'On Hold' &&
        task.responsible_user !== req.user.id
      ) {
        throw Object.assign(
          new Error(
            'Only the responsible user or D1 can put a task on hold.'
          ),
          { status: 403 }
        );
      }

      if (
        requestedStatus === 'Not Started' &&
        task.status !== 'Not Started'
      ) {
        throw Object.assign(
          new Error(
            'Only D1 can reset a task to Not Started.'
          ),
          { status: 403 }
        );
      }
    }

    const newRejectionReason =
      requestedStatus === 'Rejected'
        ? rejectionReason
        : null;

    const changedBefore = {
      ...task
    };

    run(
      `
      UPDATE tasks
      SET
        status=?,
        rejection_reason=?
      WHERE id=?
      `,
      requestedStatus,
      newRejectionReason,
      id
    );

    const changed = one(
      `
      SELECT
        t.*,
        ru.name AS responsible_name,
        ru.department_id AS responsible_department,
        cu.name AS created_by_name
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      JOIN users cu
        ON cu.id=t.created_by
      WHERE t.id=?
      `,
      id
    );

    log(
      'UPDATE',
      'task',
      id,
      changedBefore,
      changed,
      newRejectionReason,
      req.user.id
    );

    res.json({
      ok: true,
      task: changed
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   REPORTS
========================================================= */

app.get('/api/reports', auth, (req, res) => {
  try {
    const rs = reportScope(req);

    const data = rows(
      `
      SELECT
        r.*,
        u.name AS user_name,
        u.department_id
      FROM reports r
      JOIN users u
        ON u.id=r.user_id
      WHERE ${rs.sql}
      ORDER BY r.date DESC, r.id DESC
      LIMIT 1000
      `,
      ...rs.params
    );

    res.json({
      ok: true,
      reports: data
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/reports', auth, (req, res) => {
  try {
    const type = String(
      req.body.type || ''
    ).trim();

    const body = String(
      req.body.body || ''
    ).trim();

    const date =
      String(req.body.date || today());

    if (!type || !body) {
      throw Object.assign(
        new Error(
          'Report type and body are required.'
        ),
        { status: 400 }
      );
    }

    const result = run(
      `
      INSERT INTO reports
      (type, body, user_id, date, status)
      VALUES (?, ?, ?, ?, 'Submitted')
      `,
      type,
      body,
      req.user.id,
      date
    );

    const report = one(
      `
      SELECT
        r.*,
        u.name AS user_name,
        u.department_id
      FROM reports r
      JOIN users u
        ON u.id=r.user_id
      WHERE r.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'report',
      report.id,
      null,
      report,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      report
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   ACTIVITIES
========================================================= */

app.get('/api/activities', auth, (req, res) => {
  try {
    const as = activityScope(req);

    const data = rows(
      `
      SELECT
        a.*,
        u.name AS user_name,
        u.department_id
      FROM activities a
      JOIN users u
        ON u.id=a.user_id
      WHERE ${as.sql}
      ORDER BY a.date DESC, a.id DESC
      LIMIT 1000
      `,
      ...as.params
    );

    res.json({
      ok: true,
      activities: data
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/activities', auth, (req, res) => {
  try {
    const date =
      String(req.body.date || today());

    const done =
      req.body.done == null
        ? null
        : String(req.body.done);

    const unfinished =
      req.body.unfinished == null
        ? null
        : String(req.body.unfinished);

    const reason =
      req.body.reason == null
        ? null
        : String(req.body.reason);

    const timeSpent =
      req.body.time_spent == null
        ? null
        : Number(req.body.time_spent);

    const evidenceId =
      req.body.evidence_id == null
        ? null
        : Number(req.body.evidence_id);

    if (
      timeSpent !== null &&
      (!Number.isFinite(timeSpent) || timeSpent < 0)
    ) {
      throw Object.assign(
        new Error('Invalid time spent.'),
        { status: 400 }
      );
    }

    const result = run(
      `
      INSERT INTO activities
      (
        user_id,
        date,
        done,
        unfinished,
        reason,
        time_spent,
        evidence_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      req.user.id,
      date,
      done,
      unfinished,
      reason,
      timeSpent,
      evidenceId
    );

    const activity = one(
      `
      SELECT
        a.*,
        u.name AS user_name,
        u.department_id
      FROM activities a
      JOIN users u
        ON u.id=a.user_id
      WHERE a.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'activity',
      activity.id,
      null,
      activity,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      activity
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   GOALS
========================================================= */

app.get('/api/goals', auth, (req, res) => {
  try {
    const gs = goalScope(req);

    const data = rows(
      `
      SELECT
        g.*,
        d.position,
        d.person,
        u.name AS created_by_name
      FROM goals g
      LEFT JOIN departments d
        ON d.id=g.department_id
      JOIN users u
        ON u.id=g.created_by
      WHERE ${gs.sql}
      ORDER BY g.id DESC
      `,
      ...gs.params
    );

    res.json({
      ok: true,
      goals: data
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/goals', auth, (req, res) => {
  try {
    const title =
      String(req.body.title || '').trim();

    const scope =
      String(req.body.scope || 'Department').trim();

    const departmentId =
      req.body.department_id == null
        ? null
        : String(req.body.department_id).trim();

    const target =
      Number(req.body.target ?? 100);

    const achieved =
      Number(req.body.achieved ?? 0);

    const period =
      req.body.period == null
        ? null
        : String(req.body.period);

    if (!title) {
      throw Object.assign(
        new Error('Goal title is required.'),
        { status: 400 }
      );
    }

    if (
      !['Company', 'Department', 'Individual'].includes(
        scope
      )
    ) {
      throw Object.assign(
        new Error('Invalid goal scope.'),
        { status: 400 }
      );
    }

    if (!Number.isFinite(target) || target < 0) {
      throw Object.assign(
        new Error('Invalid goal target.'),
        { status: 400 }
      );
    }

    if (!Number.isFinite(achieved) || achieved < 0) {
      throw Object.assign(
        new Error('Invalid achieved value.'),
        { status: 400 }
      );
    }

    if (
      !d1(req) &&
      departmentId &&
      departmentId !== req.user.department_id
    ) {
      throw Object.assign(
        new Error(
          'You can only create goals for your department.'
        ),
        { status: 403 }
      );
    }

    const finalDepartment =
      scope === 'Company'
        ? null
        : departmentId || req.user.department_id;

    const result = run(
      `
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
      `,
      title,
      scope,
      finalDepartment,
      target,
      achieved,
      period,
      req.user.id
    );

    const goal = one(
      `
      SELECT
        g.*,
        d.position,
        d.person,
        u.name AS created_by_name
      FROM goals g
      LEFT JOIN departments d
        ON d.id=g.department_id
      JOIN users u
        ON u.id=g.created_by
      WHERE g.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'goal',
      goal.id,
      null,
      goal,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      goal
    });
  } catch (error) {
    fail(res, error);
  }
});

app.patch('/api/goals/:id', auth, (req, res) => {
  try {
    const id = Number(req.params.id);

    const goal = one(
      'SELECT * FROM goals WHERE id=?',
      id
    );

    if (!goal) {
      throw Object.assign(
        new Error('Goal not found.'),
        { status: 404 }
      );
    }

    if (
      !d1(req) &&
      goal.created_by !== req.user.id &&
      goal.department_id !== req.user.department_id
    ) {
      throw Object.assign(
        new Error('Permission denied.'),
        { status: 403 }
      );
    }

    const title =
      req.body.title == null
        ? goal.title
        : String(req.body.title).trim();

    const target =
      req.body.target == null
        ? goal.target
        : Number(req.body.target);

    const achieved =
      req.body.achieved == null
        ? goal.achieved
        : Number(req.body.achieved);

    const period =
      req.body.period == null
        ? goal.period
        : String(req.body.period);

    if (!title) {
      throw Object.assign(
        new Error('Goal title is required.'),
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(target) ||
      target < 0 ||
      !Number.isFinite(achieved) ||
      achieved < 0
    ) {
      throw Object.assign(
        new Error('Invalid goal values.'),
        { status: 400 }
      );
    }

    run(
      `
      UPDATE goals
      SET
        title=?,
        target=?,
        achieved=?,
        period=?
      WHERE id=?
      `,
      title,
      target,
      achieved,
      period,
      id
    );

    const changed = one(
      'SELECT * FROM goals WHERE id=?',
      id
    );

    log(
      'UPDATE',
      'goal',
      id,
      goal,
      changed,
      null,
      req.user.id
    );

    res.json({
      ok: true,
      goal: changed
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   MOTORCYCLES
========================================================= */

app.post('/api/motorcycles', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D4']);

    const code =
      String(req.body.code || '').trim();

    const plate =
      req.body.plate == null
        ? null
        : String(req.body.plate).trim();

    const model =
      req.body.model == null
        ? null
        : String(req.body.model).trim();

    const purchaseDate =
      req.body.purchase_date == null
        ? null
        : String(req.body.purchase_date);

    const purchasePrice =
      Number(req.body.purchase_price ?? 0);

    const status =
      String(req.body.status || 'Active').trim();

    if (!code) {
      throw Object.assign(
        new Error('Motorcycle code is required.'),
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0
    ) {
      throw Object.assign(
        new Error('Invalid purchase price.'),
        { status: 400 }
      );
    }

    const allowedStatuses = [
      'Active',
      'Under Maintenance',
      'Inactive',
      'Sold'
    ];

    if (!allowedStatuses.includes(status)) {
      throw Object.assign(
        new Error('Invalid motorcycle status.'),
        { status: 400 }
      );
    }

    if (one('SELECT id FROM motorcycles WHERE code=?', code)) {
      throw Object.assign(
        new Error('Motorcycle code already exists.'),
        { status: 409 }
      );
    }

    const result = run(
      `
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
      `,
      code,
      plate,
      model,
      purchaseDate,
      purchasePrice,
      status
    );

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'motorcycle',
      motorcycle.id,
      null,
      motorcycle,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      motorcycle
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post(
  '/api/motorcycles/:id/status',
  auth,
  (req, res) => {
    try {
      deptOnly(req, ['D1', 'D4']);

      const id = Number(req.params.id);
      const motorcycle = one(
        'SELECT * FROM motorcycles WHERE id=?',
        id
      );

      if (!motorcycle) {
        throw Object.assign(
          new Error('Motorcycle not found.'),
          { status: 404 }
        );
      }

      const status =
        String(req.body.status || '').trim();

      const allowedStatuses = [
        'Active',
        'Under Maintenance',
        'Inactive',
        'Sold'
      ];

      if (!allowedStatuses.includes(status)) {
        throw Object.assign(
          new Error('Invalid motorcycle status.'),
          { status: 400 }
        );
      }

      run(
        'UPDATE motorcycles SET status=? WHERE id=?',
        status,
        id
      );

      const changed = one(
        'SELECT * FROM motorcycles WHERE id=?',
        id
      );

      log(
        'UPDATE',
        'motorcycle',
        id,
        motorcycle,
        changed,
        null,
        req.user.id
      );

      res.json({
        ok: true,
        motorcycle: changed
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

/* =========================================================
   INCOME
========================================================= */

app.post('/api/income', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D4']);

    const date =
      String(req.body.date || today());

    const motorcycleId =
      Number(req.body.motorcycle_id);

    const amount =
      Number(req.body.amount);

    const note =
      req.body.collection_note == null
        ? null
        : String(req.body.collection_note);

    if (!motorcycleId || !Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(
        new Error(
          'Motorcycle and positive amount are required.'
        ),
        { status: 400 }
      );
    }

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      motorcycleId
    );

    if (!motorcycle) {
      throw Object.assign(
        new Error('Motorcycle not found.'),
        { status: 404 }
      );
    }

    const verified = d1(req) ? 1 : 0;

    const result = run(
      `
      INSERT INTO income
      (
        date,
        motorcycle_id,
        amount,
        collection_note,
        entered_by,
        verified
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      date,
      motorcycleId,
      amount,
      note,
      req.user.id,
      verified
    );

    const income = one(
      `
      SELECT
        i.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate,
        u.name AS entered_by_name
      FROM income i
      JOIN motorcycles m
        ON m.id=i.motorcycle_id
      JOIN users u
        ON u.id=i.entered_by
      WHERE i.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'income',
      income.id,
      null,
      income,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      income
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/income/:id/verify', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3']);

    const id = Number(req.params.id);

    const income = one(
      'SELECT * FROM income WHERE id=?',
      id
    );

    if (!income) {
      throw Object.assign(
        new Error('Income record not found.'),
        { status: 404 }
      );
    }

    run(
      'UPDATE income SET verified=1 WHERE id=?',
      id
    );

    const changed = one(
      'SELECT * FROM income WHERE id=?',
      id
    );

    log(
      'VERIFY',
      'income',
      id,
      income,
      changed,
      null,
      req.user.id
    );

    res.json({
      ok: true,
      income: changed
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   EXPENSES
========================================================= */

app.post('/api/expenses', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const date =
      String(req.body.date || today());

    const motorcycleId =
      req.body.motorcycle_id == null
        ? null
        : Number(req.body.motorcycle_id);

    const expenseType =
      String(req.body.expense_type || '').trim();

    const amount =
      Number(req.body.amount);

    const description =
      req.body.description == null
        ? null
        : String(req.body.description);

    if (
      !expenseType ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw Object.assign(
        new Error(
          'Expense type and positive amount are required.'
        ),
        { status: 400 }
      );
    }

    if (motorcycleId) {
      const motorcycle = one(
        'SELECT id FROM motorcycles WHERE id=?',
        motorcycleId
      );

      if (!motorcycle) {
        throw Object.assign(
          new Error('Motorcycle not found.'),
          { status: 404 }
        );
      }
    }

    const result = run(
      `
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
      `,
      date,
      motorcycleId,
      expenseType,
      amount,
      description,
      req.user.id
    );

    const expense = one(
      `
      SELECT
        e.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate,
        u.name AS entered_by_name
      FROM expenses e
      LEFT JOIN motorcycles m
        ON m.id=e.motorcycle_id
      JOIN users u
        ON u.id=e.entered_by
      WHERE e.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'expense',
      expense.id,
      null,
      expense,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      expense
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   FLEET SUMMARY
========================================================= */

app.get('/api/fleet-summary', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const motorcycles = rows(`
      SELECT *
      FROM motorcycles
      ORDER BY id
    `);

    const summary = motorcycles.map(m => {
      const income = one(
        `
        SELECT
          COALESCE(SUM(amount), 0) AS total
        FROM income
        WHERE motorcycle_id=?
          AND verified=1
        `,
        m.id
      ).total;

      const expenses = one(
        `
        SELECT
          COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE motorcycle_id=?
        `,
        m.id
      ).total;

      const maintenanceCost = one(
        `
        SELECT
          COALESCE(SUM(cost), 0) AS total
        FROM maintenance
        WHERE motorcycle_id=?
        `,
        m.id
      ).total;

      const currentOdometer = one(
        `
        SELECT mileage
        FROM odometer
        WHERE motorcycle_id=?
        ORDER BY date DESC, id DESC
        LIMIT 1
        `,
        m.id
      );

      const assignment = one(
        `
        SELECT *
        FROM assignments
        WHERE motorcycle_id=?
          AND end_date IS NULL
        ORDER BY id DESC
        LIMIT 1
        `,
        m.id
      );

      return {
        ...m,
        verified_income: income,
        expenses,
        maintenance_cost: maintenanceCost,
        net:
          income -
          expenses -
          maintenanceCost,
        current_mileage:
          currentOdometer
            ? currentOdometer.mileage
            : null,
        current_rider:
          assignment
            ? assignment.rider_name
            : null
      };
    });

    const totals = summary.reduce(
      (acc, m) => {
        acc.income += Number(m.verified_income || 0);
        acc.expenses += Number(m.expenses || 0);
        acc.maintenance += Number(
          m.maintenance_cost || 0
        );
        acc.net += Number(m.net || 0);
        return acc;
      },
      {
        income: 0,
        expenses: 0,
        maintenance: 0,
        net: 0
      }
    );

    res.json({
      ok: true,
      motorcycles: summary,
      totals
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   ASSIGNMENTS
========================================================= */

app.get('/api/assignments', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const data = rows(`
      SELECT
        a.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate
      FROM assignments a
      JOIN motorcycles m
        ON m.id=a.motorcycle_id
      ORDER BY
        CASE WHEN a.end_date IS NULL THEN 0 ELSE 1 END,
        a.start_date DESC,
        a.id DESC
    `);

    res.json({
      ok: true,
      assignments: data
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/assignments', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D4']);

    const motorcycleId =
      Number(req.body.motorcycle_id);

    const riderName =
      String(req.body.rider_name || '').trim();

    const startDate =
      String(req.body.start_date || today());

    const notes =
      req.body.notes == null
        ? null
        : String(req.body.notes);

    if (!motorcycleId || !riderName) {
      throw Object.assign(
        new Error(
          'Motorcycle and rider name are required.'
        ),
        { status: 400 }
      );
    }

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      motorcycleId
    );

    if (!motorcycle) {
      throw Object.assign(
        new Error('Motorcycle not found.'),
        { status: 404 }
      );
    }

    const oldAssignment = one(
      `
      SELECT *
      FROM assignments
      WHERE motorcycle_id=?
        AND end_date IS NULL
      ORDER BY id DESC
      LIMIT 1
      `,
      motorcycleId
    );

    if (oldAssignment) {
      run(
        `
        UPDATE assignments
        SET end_date=?
        WHERE id=?
        `,
        startDate,
        oldAssignment.id
      );
    }

    const result = run(
      `
      INSERT INTO assignments
      (
        motorcycle_id,
        rider_name,
        start_date,
        end_date,
        notes
      )
      VALUES (?, ?, ?, NULL, ?)
      `,
      motorcycleId,
      riderName,
      startDate,
      notes
    );

    const assignment = one(
      `
      SELECT
        a.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate
      FROM assignments a
      JOIN motorcycles m
        ON m.id=a.motorcycle_id
      WHERE a.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'assignment',
      assignment.id,
      oldAssignment,
      assignment,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      assignment
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   ODOMETER
========================================================= */

app.get('/api/odometer', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const data = rows(`
      SELECT
        o.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate,
        u.name AS entered_by_name
      FROM odometer o
      JOIN motorcycles m
        ON m.id=o.motorcycle_id
      JOIN users u
        ON u.id=o.entered_by
      ORDER BY o.date DESC, o.id DESC
      LIMIT 1000
    `);

    res.json({
      ok: true,
      odometer: data
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/odometer', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D4']);

    const motorcycleId =
      Number(req.body.motorcycle_id);

    const date =
      String(req.body.date || today());

    const mileage =
      Number(req.body.mileage);

    if (
      !motorcycleId ||
      !Number.isFinite(mileage) ||
      mileage < 0
    ) {
      throw Object.assign(
        new Error(
          'Motorcycle and valid mileage are required.'
        ),
        { status: 400 }
      );
    }

    const motorcycle = one(
      'SELECT id FROM motorcycles WHERE id=?',
      motorcycleId
    );

    if (!motorcycle) {
      throw Object.assign(
        new Error('Motorcycle not found.'),
        { status: 404 }
      );
    }

    const latest = one(
      `
      SELECT mileage
      FROM odometer
      WHERE motorcycle_id=?
      ORDER BY date DESC, id DESC
      LIMIT 1
      `,
      motorcycleId
    );

    if (
      latest &&
      mileage < Number(latest.mileage)
    ) {
      throw Object.assign(
        new Error(
          'New mileage cannot be lower than the previous mileage.'
        ),
        { status: 409 }
      );
    }

    const result = run(
      `
      INSERT INTO odometer
      (
        motorcycle_id,
        date,
        mileage,
        entered_by
      )
      VALUES (?, ?, ?, ?)
      `,
      motorcycleId,
      date,
      mileage,
      req.user.id
    );

    const odometer = one(
      `
      SELECT
        o.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate,
        u.name AS entered_by_name
      FROM odometer o
      JOIN motorcycles m
        ON m.id=o.motorcycle_id
      JOIN users u
        ON u.id=o.entered_by
      WHERE o.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'odometer',
      odometer.id,
      null,
      odometer,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      odometer
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   MAINTENANCE
========================================================= */

app.get('/api/maintenance', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const data = rows(`
      SELECT
        ma.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate
      FROM maintenance ma
      JOIN motorcycles m
        ON m.id=ma.motorcycle_id
      ORDER BY ma.date DESC, ma.id DESC
      LIMIT 1000
    `);

    res.json({
      ok: true,
      maintenance: data
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/maintenance', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D4']);

    const motorcycleId =
      Number(req.body.motorcycle_id);

    const issue =
      String(req.body.issue || '').trim();

    const date =
      String(req.body.date || today());

    const mileage =
      req.body.mileage == null
        ? null
        : Number(req.body.mileage);

    const parts =
      req.body.parts == null
        ? null
        : String(req.body.parts);

    const cost =
      Number(req.body.cost ?? 0);

    const garage =
      req.body.garage == null
        ? null
        : String(req.body.garage);

    const nextService =
      req.body.next_service == null
        ? null
        : String(req.body.next_service);

    const downtime =
      Number(req.body.downtime ?? 0);

    const status =
      String(
        req.body.status || 'Completed'
      ).trim();

    if (!motorcycleId || !issue) {
      throw Object.assign(
        new Error(
          'Motorcycle and issue are required.'
        ),
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(cost) ||
      cost < 0 ||
      !Number.isFinite(downtime) ||
      downtime < 0
    ) {
      throw Object.assign(
        new Error(
          'Invalid maintenance cost or downtime.'
        ),
        { status: 400 }
      );
    }

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      motorcycleId
    );

    if (!motorcycle) {
      throw Object.assign(
        new Error('Motorcycle not found.'),
        { status: 404 }
      );
    }

    const allowedStatuses = [
      'Completed',
      'In Progress',
      'Cancelled'
    ];

    if (!allowedStatuses.includes(status)) {
      throw Object.assign(
        new Error('Invalid maintenance status.'),
        { status: 400 }
      );
    }

    const result = run(
      `
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
      `,
      motorcycleId,
      issue,
      date,
      mileage,
      parts,
      cost,
      garage,
      nextService,
      downtime,
      status
    );

    if (status === 'In Progress') {
      run(
        `
        UPDATE motorcycles
        SET status='Under Maintenance'
        WHERE id=?
        `,
        motorcycleId
      );
    }

    if (
      status === 'Completed' ||
      status === 'Cancelled'
    ) {
      const open = one(
        `
        SELECT id
        FROM maintenance
        WHERE motorcycle_id=?
          AND status='In Progress'
        LIMIT 1
        `,
        motorcycleId
      );

      if (!open) {
        run(
          `
          UPDATE motorcycles
          SET status='Active'
          WHERE id=?
            AND status='Under Maintenance'
          `,
          motorcycleId
        );
      }
    }

    const maintenance = one(
      `
      SELECT
        ma.*,
        m.code AS motorcycle_code,
        m.plate AS motorcycle_plate
      FROM maintenance ma
      JOIN motorcycles m
        ON m.id=ma.motorcycle_id
      WHERE ma.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'maintenance',
      maintenance.id,
      null,
      maintenance,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      maintenance
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   FLEET DETAIL
========================================================= */

app.get('/api/fleet/:id', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const id = Number(req.params.id);

    const motorcycle = one(
      'SELECT * FROM motorcycles WHERE id=?',
      id
    );

    if (!motorcycle) {
      throw Object.assign(
        new Error('Motorcycle not found.'),
        { status: 404 }
      );
    }

    const assignments = rows(
      `
      SELECT *
      FROM assignments
      WHERE motorcycle_id=?
      ORDER BY start_date DESC, id DESC
      `,
      id
    );

    const income = rows(
      `
      SELECT
        i.*,
        u.name AS entered_by_name
      FROM income i
      JOIN users u
        ON u.id=i.entered_by
      WHERE i.motorcycle_id=?
      ORDER BY i.date DESC, i.id DESC
      LIMIT 500
      `,
      id
    );

    const expenses = rows(
      `
      SELECT
        e.*,
        u.name AS entered_by_name
      FROM expenses e
      JOIN users u
        ON u.id=e.entered_by
      WHERE e.motorcycle_id=?
      ORDER BY e.date DESC, e.id DESC
      LIMIT 500
      `,
      id
    );

    const maintenance = rows(
      `
      SELECT *
      FROM maintenance
      WHERE motorcycle_id=?
      ORDER BY date DESC, id DESC
      LIMIT 500
      `,
      id
    );

    const odometer = rows(
      `
      SELECT
        o.*,
        u.name AS entered_by_name
      FROM odometer o
      JOIN users u
        ON u.id=o.entered_by
      WHERE o.motorcycle_id=?
      ORDER BY o.date DESC, o.id DESC
      LIMIT 500
      `,
      id
    );

    res.json({
      ok: true,
      motorcycle,
      assignments,
      income,
      expenses,
      maintenance,
      odometer
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   DAILY CLOSING
========================================================= */

app.post('/api/daily-closing', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D4']);

    const date =
      String(req.body.date || today());

    const notes =
      req.body.notes == null
        ? null
        : String(req.body.notes);

    if (
      one(
        'SELECT id FROM daily_closings WHERE date=?',
        date
      )
    ) {
      throw Object.assign(
        new Error(
          'This date has already been closed.'
        ),
        { status: 409 }
      );
    }

    const income = one(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS total
      FROM income
      WHERE date=?
        AND verified=1
      `,
      date
    ).total;

    const expenses = one(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE date=?
      `,
      date
    ).total;

    const net =
      Number(income) - Number(expenses);

    const result = run(
      `
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
      `,
      date,
      income,
      expenses,
      net,
      req.user.id,
      notes
    );

    const closing = one(
      `
      SELECT
        dc.*,
        u.name AS closed_by_name
      FROM daily_closings dc
      JOIN users u
        ON u.id=dc.closed_by
      WHERE dc.id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'daily_closing',
      closing.id,
      null,
      closing,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      closing
    });
  } catch (error) {
    fail(res, error);
  }
});

app.get('/api/daily-closings', auth, (req, res) => {
  try {
    deptOnly(req, ['D1', 'D3', 'D4']);

    const data = rows(`
      SELECT
        dc.*,
        u.name AS closed_by_name
      FROM daily_closings dc
      JOIN users u
        ON u.id=dc.closed_by
      ORDER BY dc.date DESC, dc.id DESC
      LIMIT 1000
    `);

    res.json({
      ok: true,
      dailyClosings: data
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   EVIDENCE
========================================================= */

app.post(
  '/api/evidence',
  auth,
  upload.single('file'),
  (req, res) => {
    try {
      if (!req.file) {
        throw Object.assign(
          new Error('File is required.'),
          { status: 400 }
        );
      }

      const taskId =
        req.body.task_id == null
          ? null
          : Number(req.body.task_id);

      const reportId =
        req.body.report_id == null
          ? null
          : Number(req.body.report_id);

      if (taskId) {
        const task = one(
          `
          SELECT
            t.*,
            ru.department_id AS responsible_department
          FROM tasks t
          JOIN users ru
            ON ru.id=t.responsible_user
          WHERE t.id=?
          `,
          taskId
        );

        if (!task) {
          throw Object.assign(
            new Error('Task not found.'),
            { status: 404 }
          );
        }

        if (
          !d1(req) &&
          task.created_by !== req.user.id &&
          task.responsible_user !== req.user.id &&
          task.responsible_department !== req.user.department_id
        ) {
          throw Object.assign(
            new Error('Permission denied for this task.'),
            { status: 403 }
          );
        }
      }

      if (reportId) {
        const report = one(
          `
          SELECT
            r.*,
            u.department_id
          FROM reports r
          JOIN users u
            ON u.id=r.user_id
          WHERE r.id=?
          `,
          reportId
        );

        if (!report) {
          throw Object.assign(
            new Error('Report not found.'),
            { status: 404 }
          );
        }

        if (
          !d1(req) &&
          report.user_id !== req.user.id &&
          report.department_id !== req.user.department_id
        ) {
          throw Object.assign(
            new Error(
              'Permission denied for this report.'
            ),
            { status: 403 }
          );
        }
      }

      const result = run(
        `
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
        `,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.user.id,
        taskId,
        reportId
      );

      const evidence = one(
        'SELECT * FROM evidence WHERE id=?',
        result.lastInsertRowid
      );

      log(
        'CREATE',
        'evidence',
        evidence.id,
        null,
        evidence,
        null,
        req.user.id
      );

      res.status(201).json({
        ok: true,
        evidence: {
          ...evidence,
          url: `/api/evidence/${evidence.id}/file`
        }
      });
    } catch (error) {
      if (req.file) {
        try {
          fs.unlinkSync(
            path.join(
              UPLOAD_DIR,
              req.file.filename
            )
          );
        } catch (_) {}
      }

      fail(res, error);
    }
  }
);

app.get('/api/evidence', auth, (req, res) => {
  try {
    const data = d1(req)
      ? rows(`
          SELECT
            e.*,
            u.name AS uploaded_by_name
          FROM evidence e
          JOIN users u
            ON u.id=e.uploaded_by
          ORDER BY e.uploaded_at DESC
          LIMIT 1000
        `)
      : rows(
          `
          SELECT
            e.*,
            u.name AS uploaded_by_name
          FROM evidence e
          JOIN users u
            ON u.id=e.uploaded_by
          WHERE
            u.department_id=? OR
            e.uploaded_by=? OR
            e.task_id IN (
              SELECT id
              FROM tasks
              WHERE responsible_user=? OR created_by=?
            ) OR
            e.report_id IN (
              SELECT id
              FROM reports
              WHERE user_id=?
            )
          ORDER BY e.uploaded_at DESC
          LIMIT 1000
          `,
          req.user.department_id,
          req.user.id,
          req.user.id,
          req.user.id,
          req.user.id
        );

    res.json({
      ok: true,
      evidence: data.map(e => ({
        ...e,
        url: `/api/evidence/${e.id}/file`
      }))
    });
  } catch (error) {
    fail(res, error);
  }
});

app.get(
  '/api/evidence/:id/file',
  auth,
  (req, res) => {
    try {
      const evidence = one(
        'SELECT * FROM evidence WHERE id=?',
        Number(req.params.id)
      );

      if (!evidence) {
        throw Object.assign(
          new Error('Evidence not found.'),
          { status: 404 }
        );
      }

      if (!evidenceAllowed(req, evidence)) {
        throw Object.assign(
          new Error('Permission denied.'),
          { status: 403 }
        );
      }

      const filename =
        path.basename(evidence.filename);

      const file =
        path.join(UPLOAD_DIR, filename);

      if (!fs.existsSync(file)) {
        throw Object.assign(
          new Error('File no longer exists.'),
          { status: 404 }
        );
      }

      res.setHeader(
        'Content-Type',
        evidence.mime ||
          'application/octet-stream'
      );

      const originalName =
        String(evidence.original_name || 'file')
          .replace(/[\r\n"]/g, '_');

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${originalName}"`
      );

      res.sendFile(file);
    } catch (error) {
      fail(res, error);
    }
  }
);

/* =========================================================
   AUDIT
========================================================= */

app.get('/api/audit', auth, (req, res) => {
  try {
    const data = d1(req)
      ? rows(`
          SELECT
            a.*,
            u.name AS who_name,
            u.department_id
          FROM audit a
          LEFT JOIN users u
            ON u.id=a.who_user
          ORDER BY a.when_at DESC, a.id DESC
          LIMIT 1000
        `)
      : rows(
          `
          SELECT
            a.*,
            u.name AS who_name,
            u.department_id
          FROM audit a
          LEFT JOIN users u
            ON u.id=a.who_user
          WHERE
            a.who_user=? OR
            u.department_id=?
          ORDER BY a.when_at DESC, a.id DESC
          LIMIT 500
          `,
          req.user.id,
          req.user.department_id
        );

    const q =
      String(req.query.q || '')
        .trim()
        .toLowerCase();

    const filtered = q
      ? data.filter(a =>
          JSON.stringify(a)
            .toLowerCase()
            .includes(q)
        )
      : data;

    res.json({
      ok: true,
      audit: filtered
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   FINANCE CHANGE REQUESTS
========================================================= */

app.post(
  '/api/finance-changes',
  auth,
  (req, res) => {
    try {
      deptOnly(req, ['D1', 'D3', 'D4']);

      const recordType =
        String(
          req.body.record_type || ''
        ).trim();

      const recordId =
        Number(req.body.record_id);

      const original =
        req.body.original;

      const proposed =
        req.body.proposed;

      const reason =
        String(
          req.body.reason || ''
        ).trim();

      if (
        !recordType ||
        !recordId ||
        original == null ||
        proposed == null ||
        !reason
      ) {
        throw Object.assign(
          new Error(
            'record_type, record_id, original, proposed and reason are required.'
          ),
          { status: 400 }
        );
      }

      const result = run(
        `
        INSERT INTO finance_changes
        (
          record_type,
          record_id,
          original_json,
          proposed_json,
          reason,
          status,
          requested_by
        )
        VALUES (?, ?, ?, ?, ?, 'Pending Approval', ?)
        `,
        recordType,
        recordId,
        json(original),
        json(proposed),
        reason,
        req.user.id
      );

      const change = one(
        'SELECT * FROM finance_changes WHERE id=?',
        result.lastInsertRowid
      );

      log(
        'CREATE',
        'finance_change',
        change.id,
        null,
        change,
        reason,
        req.user.id
      );

      res.status(201).json({
        ok: true,
        change
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

app.post(
  '/api/finance-changes/:id/decision',
  auth,
  (req, res) => {
    try {
      if (!d1(req)) {
        throw Object.assign(
          new Error(
            'Only D1 can approve or reject finance changes.'
          ),
          { status: 403 }
        );
      }

      const id =
        Number(req.params.id);

      const change = one(
        'SELECT * FROM finance_changes WHERE id=?',
        id
      );

      if (!change) {
        throw Object.assign(
          new Error(
            'Change request not found.'
          ),
          { status: 404 }
        );
      }

      if (
        change.status !==
        'Pending Approval'
      ) {
        throw Object.assign(
          new Error(
            'This change request has already been decided.'
          ),
          { status: 409 }
        );
      }

      const decision =
        String(
          req.body.decision || ''
        ).trim();

      if (
        !['Approved', 'Rejected']
          .includes(decision)
      ) {
        throw Object.assign(
          new Error(
            'Decision must be Approved or Rejected.'
          ),
          { status: 400 }
        );
      }

      const note =
        String(
          req.body.decision_note || ''
        ).trim() || null;

      run(
        `
        UPDATE finance_changes
        SET
          status=?,
          decided_by=?,
          decision_note=?,
          decided_at=CURRENT_TIMESTAMP
        WHERE id=?
        `,
        decision,
        req.user.id,
        note,
        id
      );

      const changed = one(
        'SELECT * FROM finance_changes WHERE id=?',
        id
      );

      log(
        'DECISION',
        'finance_change',
        id,
        change,
        changed,
        note,
        req.user.id
      );

      res.json({
        ok: true,
        change: changed
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

/* =========================================================
   USER MANAGEMENT
========================================================= */

app.get('/api/users', auth, (req, res) => {
  try {
    if (!d1(req)) {
      throw Object.assign(
        new Error(
          'Only D1 can manage users.'
        ),
        { status: 403 }
      );
    }

    res.json({
      ok: true,
      users: rows(`
        SELECT
          id,
          name,
          username,
          department_id,
          active,
          created_at
        FROM users
        ORDER BY department_id, id
      `)
    });
  } catch (error) {
    fail(res, error);
  }
});

app.post('/api/users', auth, (req, res) => {
  try {
    if (!d1(req)) {
      throw Object.assign(
        new Error(
          'Only D1 can create users.'
        ),
        { status: 403 }
      );
    }

    const name =
      String(req.body.name || '').trim();

    const username =
      String(
        req.body.username || ''
      ).trim().toLowerCase();

    const password =
      String(req.body.password || '');

    const departmentId =
      String(
        req.body.department_id || ''
      ).trim();

    if (
      !name ||
      !username ||
      password.length < 10 ||
      !one(
        'SELECT id FROM departments WHERE id=?',
        departmentId
      )
    ) {
      throw Object.assign(
        new Error(
          'Name, username, 10+ character password and valid department are required.'
        ),
        { status: 400 }
      );
    }

    if (
      one(
        'SELECT id FROM users WHERE username=?',
        username
      )
    ) {
      throw Object.assign(
        new Error(
          'Username already exists.'
        ),
        { status: 409 }
      );
    }

    const hash =
      bcrypt.hashSync(password, 12);

    const result = run(
      `
      INSERT INTO users
      (
        name,
        username,
        password_hash,
        department_id,
        active
      )
      VALUES (?, ?, ?, ?, 1)
      `,
      name,
      username,
      hash,
      departmentId
    );

    const user = one(
      `
      SELECT
        id,
        name,
        username,
        department_id,
        active,
        created_at
      FROM users
      WHERE id=?
      `,
      result.lastInsertRowid
    );

    log(
      'CREATE',
      'user',
      user.id,
      null,
      user,
      null,
      req.user.id
    );

    res.status(201).json({
      ok: true,
      user
    });
  } catch (error) {
    fail(res, error);
  }
});

app.patch('/api/users/:id', auth, (req, res) => {
  try {
    if (!d1(req)) {
      throw Object.assign(
        new Error(
          'Only D1 can modify users.'
        ),
        { status: 403 }
      );
    }

    const id =
      Number(req.params.id);

    const user = one(
      'SELECT * FROM users WHERE id=?',
      id
    );

    if (!user) {
      throw Object.assign(
        new Error('User not found.'),
        { status: 404 }
      );
    }

    if (
      id === req.user.id &&
      req.body.active === 0
    ) {
      throw Object.assign(
        new Error(
          'You cannot disable your own account.'
        ),
        { status: 400 }
      );
    }

    const name =
      req.body.name == null
        ? user.name
        : String(req.body.name).trim();

    const departmentId =
      req.body.department_id == null
        ? user.department_id
        : String(
            req.body.department_id
          ).trim();

    const active =
      req.body.active == null
        ? user.active
        : req.body.active
          ? 1
          : 0;

    const password =
      req.body.password == null
        ? null
        : String(req.body.password);

    if (
      !one(
        'SELECT id FROM departments WHERE id=?',
        departmentId
      ) ||
      !name
    ) {
      throw Object.assign(
        new Error(
          'Valid name and department are required.'
        ),
        { status: 400 }
      );
    }

    if (
      password !== null &&
      password.length < 10
    ) {
      throw Object.assign(
        new Error(
          'Password must be at least 10 characters.'
        ),
        { status: 400 }
      );
    }

    const old = {
      id: user.id,
      name: user.name,
      username: user.username,
      department_id: user.department_id,
      active: user.active
    };

    if (password !== null) {
      run(
        `
        UPDATE users
        SET
          name=?,
          department_id=?,
          active=?,
          password_hash=?
        WHERE id=?
        `,
        name,
        departmentId,
        active,
        bcrypt.hashSync(password, 12),
        id
      );
    } else {
      run(
        `
        UPDATE users
        SET
          name=?,
          department_id=?,
          active=?
        WHERE id=?
        `,
        name,
        departmentId,
        active,
        id
      );
    }

    const changed = one(
      `
      SELECT
        id,
        name,
        username,
        department_id,
        active,
        created_at
      FROM users
      WHERE id=?
      `,
      id
    );

    log(
      'UPDATE',
      'user',
      id,
      old,
      changed,
      null,
      req.user.id
    );

    res.json({
      ok: true,
      user: changed
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   ALERTS
========================================================= */

app.get('/api/alerts', auth, (req, res) => {
  try {
    const alerts = [];

    if (hasDept(req, ['D1', 'D3', 'D4'])) {
      const motorcycles = rows(`
        SELECT *
        FROM motorcycles
        WHERE status='Under Maintenance'
        ORDER BY id
      `);

      for (const motorcycle of motorcycles) {
        alerts.push({
          type: 'maintenance',
          severity: 'warning',
          title: 'Motorcycle under maintenance',
          message:
            `${motorcycle.code}` +
            (
              motorcycle.plate
                ? ` — ${motorcycle.plate}`
                : ''
            ) +
            ' is under maintenance.',
          motorcycle_id: motorcycle.id
        });
      }

      const openMaintenance = rows(`
        SELECT
          ma.*,
          m.code
        FROM maintenance ma
        JOIN motorcycles m
          ON m.id=ma.motorcycle_id
        WHERE ma.status='In Progress'
        ORDER BY ma.date DESC
      `);

      for (const maintenance of openMaintenance) {
        alerts.push({
          type: 'maintenance',
          severity: 'warning',
          title: 'Open maintenance',
          message:
            `${maintenance.code}: ${maintenance.issue}`,
          maintenance_id: maintenance.id
        });
      }
    }

    const ts = taskScope(req);

    const overdue = rows(
      `
      SELECT
        t.*,
        ru.name AS responsible_name
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      WHERE
        t.deadline IS NOT NULL AND
        t.deadline < ? AND
        t.status NOT IN ('Completed', 'Cancelled') AND
        ${ts.sql}
      ORDER BY t.deadline
      `,
      today(),
      ...ts.params
    );

    for (const task of overdue) {
      alerts.push({
        type: 'task',
        severity: 'danger',
        title: 'Overdue task',
        message: task.name,
        responsible_user:
          task.responsible_name,
        task_id: task.id
      });
    }

    const rejected = rows(
      `
      SELECT
        t.*,
        ru.name AS responsible_name
      FROM tasks t
      JOIN users ru
        ON ru.id=t.responsible_user
      WHERE
        t.status='Rejected' AND
        ${ts.sql}
      ORDER BY t.id DESC
      `,
      ...ts.params
    );

    for (const task of rejected) {
      alerts.push({
        type: 'task_rejected',
        severity: 'warning',
        title: 'Task rejected',
        message:
          `${task.name}: ` +
          (
            task.rejection_reason ||
            'No reason provided.'
          ),
        task_id: task.id
      });
    }

    res.json({
      ok: true,
      alerts
    });
  } catch (error) {
    fail(res, error);
  }
});

/* =========================================================
   STATIC FILES / ERRORS
========================================================= */

/*
  Uploaded files must NEVER be directly exposed by
  /public/uploads. They are served only through the
  authenticated /api/evidence/:id/file endpoint.
*/

app.use(
  '/uploads',
  (_, res) =>
    res.status(404).json({
      ok: false,
      error: 'Not found.'
    })
);

app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html'
  })
);

app.use(
  '/api',
  (req, res) =>
    res.status(404).json({
      ok: false,
      error: 'API endpoint not found.'
    })
);

app.get('*', (req, res) => {
  if (req.method !== 'GET') {
    return res.status(404).end();
  }

  const index =
    path.join(
      PUBLIC_DIR,
      'index.html'
    );

  if (fs.existsSync(index)) {
    return res.sendFile(index);
  }

  return res
    .status(404)
    .send(
      'THE BG WEB frontend not found.'
    );
});

app.use(
  (err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
      return next(err);
    }

    return res
      .status(err.status || 500)
      .json({
        ok: false,
        error:
          err.status
            ? err.message
            : 'Internal server error.'
      });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log(
    `THE BG WEB server running on port ${PORT}`
  );
});
