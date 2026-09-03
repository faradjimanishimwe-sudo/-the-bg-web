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

const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || 'development';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET must be configured in production.');
      })()
    : 'the-bg-web-development-secret-change-me');

if (NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const DB_PATH =
  process.env.DB_PATH || path.join(DATA_DIR, 'thebg.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  officer TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS motorcycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number TEXT NOT NULL UNIQUE,
  model TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'Active',
  purchase_price REAL NOT NULL DEFAULT 0,
  purchase_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER NOT NULL,
  rider_name TEXT NOT NULL,
  rider_phone TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER,
  amount REAL NOT NULL,
  income_date TEXT NOT NULL,
  source TEXT,
  description TEXT,
  entered_by INTEGER NOT NULL,
  verified_by INTEGER,
  verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY (entered_by) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  entered_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY (entered_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  department_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  responsible_id INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL DEFAULT 'Not Started',
  due_date TEXT,
  rejection_reason TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (responsible_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  department_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  activity_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  department_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  target_date TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER NOT NULL,
  maintenance_date TEXT NOT NULL,
  maintenance_type TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  completed_date TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS odometer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  motorcycle_id INTEGER NOT NULL,
  reading INTEGER NOT NULL,
  reading_date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (motorcycle_id) REFERENCES motorcycles(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  task_id INTEGER,
  report_id INTEGER,
  uploaded_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (report_id) REFERENCES reports(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finance_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  amount REAL,
  description TEXT NOT NULL,
  requested_by INTEGER NOT NULL,
  decided_by INTEGER,
  decision TEXT NOT NULL DEFAULT 'Pending',
  decision_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  closing_date TEXT NOT NULL UNIQUE,
  verified_income REAL NOT NULL DEFAULT 0,
  expenses REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  notes TEXT,
  closed_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (closed_by) REFERENCES users(id)
);
`);

try {
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();

  if (!taskColumns.some((c) => c.name === 'rejection_reason')) {
    db.exec(
      'ALTER TABLE tasks ADD COLUMN rejection_reason TEXT'
    );
  }
} catch (error) {
  console.error('TASK MIGRATION ERROR:', error);
  throw error;
}

const departmentSeed = [
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

const insertDepartment = db.prepare(`
  INSERT OR IGNORE INTO departments
  (code, name, officer, description)
  VALUES (?, ?, ?, ?)
`);

for (const department of departmentSeed) {
  insertDepartment.run(...department);
}

const userCount = db
  .prepare('SELECT COUNT(*) AS count FROM users')
  .get().count;

if (userCount === 0) {
  const productionPassword = process.env.INITIAL_ADMIN_PASSWORD;

  if (NODE_ENV === 'production' && !productionPassword) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD must be configured before first production start.'
    );
  }

  const defaultPassword =
    productionPassword || '1234';

  const users = [
    ['d1', 'MANISHIMWE FARADJI', 'D1'],
    ['d2', 'AHMED FAZZIR', 'D2'],
    ['d3', 'NIYITANGA OSAMA', 'D3'],
    ['d4', 'KIREZI NASSIB', 'D4'],
    ['d5', 'IMANANIYOGISUBIZO YUSSUF', 'D5']
  ];

  const insertUser = db.prepare(`
    INSERT INTO users
    (username, password_hash, full_name, department_id, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  const passwordHash = bcrypt.hashSync(defaultPassword, 12);

  for (const [username, fullName, code] of users) {
    const department = db
      .prepare('SELECT id FROM departments WHERE code = ?')
      .get(code);

    if (!department) {
      throw new Error(`Department ${code} not found.`);
    }

    insertUser.run(
      username,
      passwordHash,
      fullName,
      department.id,
      code === 'D1' ? 'Chairman & CEO' : 'Department Officer'
    );
  }
}

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

const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const key =
    req.ip ||
    req.headers['x-forwarded-for'] ||
    'unknown';

  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;

  let record = loginAttempts.get(key);

  if (!record || now - record.start > windowMs) {
    record = {
      start: now,
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
    const ext = path.extname(file.originalname);
    const safeExt =
      ext && /^[.a-zA-Z0-9]+$/.test(ext)
        ? ext.toLowerCase()
        : '';

    const filename =
      `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`;

    cb(null, filename);
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

function audit(userId, action, entityType, entityId, details, ip) {
  db.prepare(`
    INSERT INTO audit
    (user_id, action, entity_type, entity_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId || null,
    action,
    entityType || null,
    entityId || null,
    details
      ? typeof details === 'string'
        ? details
        : JSON.stringify(details)
      : null,
    ip || null
  );
}

function getUserById(id) {
  return db.prepare(`
    SELECT
      u.id,
      u.username,
      u.full_name,
      u.department_id,
      u.role,
      u.active,
      d.code AS department_code,
      d.name AS department_name
    FROM users u
    JOIN departments d
      ON d.id = u.department_id
    WHERE u.id = ?
  `).get(id);
}

function authenticate(req, res, next) {
  const token = req.cookies.bg_token;

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Authentication required.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getUserById(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({
        ok: false,
        error: 'Account is inactive or unavailable.'
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      ok: false,
      error: 'Invalid or expired session.'
    });
  }
}

function requireDepartments(...codes) {
  return (req, res, next) => {
    if (!req.user || !codes.includes(req.user.department_code)) {
      return res.status(403).json({
        ok: false,
        error: 'You do not have permission for this action.'
      });
    }

    next();
  };
}

function isD1(user) {
  return user.department_code === 'D1';
}

function isFinance(user) {
  return ['D1', 'D3'].includes(user.department_code);
}

function isFleet(user) {
  return ['D1', 'D3', 'D4'].includes(user.department_code);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cleanString(value, max = 1000) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().slice(0, max);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();

    res.json({
      ok: true,
      status: 'healthy',
      service: 'THE BG WEB',
      environment: NODE_ENV
    });
  } catch {
    res.status(500).json({
      ok: false,
      status: 'unhealthy'
    });
  }
});

app.post('/api/login', rateLimitLogin, (req, res) => {
  const username = cleanString(req.body.username, 100).toLowerCase();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: 'Username and password are required.'
    });
  }

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE LOWER(username) = ?
  `).get(username);

  if (
    !user ||
    !user.active ||
    !bcrypt.compareSync(password, user.password_hash)
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid username or password.'
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      department_id: user.department_id
    },
    JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );

  res.cookie('bg_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });

  audit(
    user.id,
    'LOGIN',
    'user',
    user.id,
    { username: user.username },
    req.ip
  );

  res.json({
    ok: true,
    user: getUserById(user.id)
  });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('bg_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    path: '/'
  });

  res.json({
    ok: true
  });
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({
    ok: true,
    user: req.user
  });
});

app.get('/api/bootstrap', authenticate, (req, res) => {
  const user = req.user;

  const departments = db.prepare(`
    SELECT *
    FROM departments
    ORDER BY code
  `).all();

  const users = isD1(user)
    ? db.prepare(`
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.department_id,
          u.role,
          u.active,
          d.code AS department_code,
          d.name AS department_name
        FROM users u
        JOIN departments d
          ON d.id = u.department_id
        ORDER BY d.code, u.full_name
      `).all()
    : db.prepare(`
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.department_id,
          u.role,
          u.active,
          d.code AS department_code,
          d.name AS department_name
        FROM users u
        JOIN departments d
          ON d.id = u.department_id
        WHERE u.department_id = ?
           OR u.id = ?
        ORDER BY d.code, u.full_name
      `).all(user.department_id, user.id);

  let tasks;

  if (isD1(user)) {
    tasks = db.prepare(`
      SELECT
        t.*,
        d.code AS department_code,
        d.name AS department_name,
        c.full_name AS creator_name,
        r.full_name AS responsible_name
      FROM tasks t
      JOIN departments d ON d.id = t.department_id
      JOIN users c ON c.id = t.created_by
      JOIN users r ON r.id = t.responsible_id
      ORDER BY t.created_at DESC
    `).all();
  } else {
    tasks = db.prepare(`
      SELECT
        t.*,
        d.code AS department_code,
        d.name AS department_name,
        c.full_name AS creator_name,
        r.full_name AS responsible_name
      FROM tasks t
      JOIN departments d ON d.id = t.department_id
      JOIN users c ON c.id = t.created_by
      JOIN users r ON r.id = t.responsible_id
      WHERE t.department_id = ?
         OR t.responsible_id = ?
         OR t.created_by = ?
      ORDER BY t.created_at DESC
    `).all(
      user.department_id,
      user.id,
      user.id
    );
  }

  const reports = isD1(user)
    ? db.prepare(`
        SELECT
          r.*,
          d.code AS department_code,
          d.name AS department_name,
          u.full_name AS user_name
        FROM reports r
        JOIN departments d ON d.id = r.department_id
        JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC
      `).all()
    : db.prepare(`
        SELECT
          r.*,
          d.code AS department_code,
          d.name AS department_name,
          u.full_name AS user_name
        FROM reports r
        JOIN departments d ON d.id = r.department_id
        JOIN users u ON u.id = r.user_id
        WHERE r.department_id = ?
           OR r.user_id = ?
        ORDER BY r.created_at DESC
      `).all(
      user.department_id,
      user.id
    );

  const activities = isD1(user)
    ? db.prepare(`
        SELECT
          a.*,
          d.code AS department_code,
          d.name AS department_name,
          u.full_name AS user_name
        FROM activities a
        JOIN departments d ON d.id = a.department_id
        JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC
      `).all()
    : db.prepare(`
        SELECT
          a.*,
          d.code AS department_code,
          d.name AS department_name,
          u.full_name AS user_name
        FROM activities a
        JOIN departments d ON d.id = a.department_id
        JOIN users u ON u.id = a.user_id
        WHERE a.department_id = ?
           OR a.user_id = ?
        ORDER BY a.created_at DESC
      `).all(
      user.department_id,
      user.id
    );

  const goals = isD1(user)
    ? db.prepare(`
        SELECT
          g.*,
          d.code AS department_code,
          d.name AS department_name,
          u.full_name AS owner_name
        FROM goals g
        JOIN departments d ON d.id = g.department_id
        JOIN users u ON u.id = g.owner_id
        ORDER BY g.created_at DESC
      `).all()
    : db.prepare(`
        SELECT
          g.*,
          d.code AS department_code,
          d.name AS department_name,
          u.full_name AS owner_name
        FROM goals g
        JOIN departments d ON d.id = g.department_id
        JOIN users u ON u.id = g.owner_id
        WHERE g.department_id = ?
           OR g.owner_id = ?
        ORDER BY g.created_at DESC
      `).all(
      user.department_id,
      user.id
    );

  const motorcycles = isFleet(user)
    ? db.prepare(`
        SELECT *
        FROM motorcycles
        ORDER BY id DESC
      `).all()
    : [];

  const income =
    user.department_code === 'D1' ||
    user.department_code === 'D3'
      ? db.prepare(`
          SELECT
            i.*,
            m.plate_number,
            u.full_name AS entered_by_name,
            v.full_name AS verified_by_name
          FROM income i
          LEFT JOIN motorcycles m
            ON m.id = i.motorcycle_id
          JOIN users u
            ON u.id = i.entered_by
          LEFT JOIN users v
            ON v.id = i.verified_by
          ORDER BY i.income_date DESC, i.id DESC
        `).all()
      : user.department_code === 'D4'
        ? db.prepare(`
            SELECT
              i.*,
              m.plate_number,
              u.full_name AS entered_by_name,
              v.full_name AS verified_by_name
            FROM income i
            LEFT JOIN motorcycles m
              ON m.id = i.motorcycle_id
            JOIN users u
              ON u.id = i.entered_by
            LEFT JOIN users v
              ON v.id = i.verified_by
            WHERE i.entered_by = ?
            ORDER BY i.income_date DESC, i.id DESC
          `).all(user.id)
        : [];

  const expenses =
    user.department_code === 'D1' ||
    user.department_code === 'D3'
      ? db.prepare(`
          SELECT
            e.*,
            m.plate_number,
            u.full_name AS entered_by_name
          FROM expenses e
          LEFT JOIN motorcycles m
            ON m.id = e.motorcycle_id
          JOIN users u
            ON u.id = e.entered_by
          ORDER BY e.expense_date DESC, e.id DESC
        `).all()
      : user.department_code === 'D4'
        ? db.prepare(`
            SELECT
              e.*,
              m.plate_number,
              u.full_name AS entered_by_name
            FROM expenses e
            LEFT JOIN motorcycles m
              ON m.id = e.motorcycle_id
            JOIN users u
              ON u.id = e.entered_by
            WHERE e.entered_by = ?
            ORDER BY e.expense_date DESC, e.id DESC
          `).all(user.id)
        : [];

  const maintenance = isFleet(user)
    ? db.prepare(`
        SELECT
          m.*,
          mo.plate_number,
          u.full_name AS created_by_name
        FROM maintenance m
        JOIN motorcycles mo
          ON mo.id = m.motorcycle_id
        JOIN users u
          ON u.id = m.created_by
        ORDER BY m.maintenance_date DESC, m.id DESC
      `).all()
    : [];

  const assignments = isFleet(user)
    ? db.prepare(`
        SELECT
          a.*,
          m.plate_number,
          u.full_name AS created_by_name
        FROM assignments a
        JOIN motorcycles m
          ON m.id = a.motorcycle_id
        JOIN users u
          ON u.id = a.created_by
        ORDER BY a.start_date DESC, a.id DESC
      `).all()
    : [];

  const odometer = isFleet(user)
    ? db.prepare(`
        SELECT
          o.*,
          m.plate_number,
          u.full_name AS created_by_name
        FROM odometer o
        JOIN motorcycles m
          ON m.id = o.motorcycle_id
        JOIN users u
          ON u.id = o.created_by
        ORDER BY o.reading_date DESC, o.id DESC
      `).all()
    : [];

  const dailyClosings = isFleet(user)
    ? db.prepare(`
        SELECT
          d.*,
          u.full_name AS closed_by_name
        FROM daily_closings d
        JOIN users u ON u.id = d.closed_by
        ORDER BY d.closing_date DESC
      `).all()
    : [];

  const evidence = isD1(user)
    ? db.prepare(`
        SELECT
          e.id,
          e.filename,
          e.mime_type,
          e.size,
          e.task_id,
          e.report_id,
          e.uploaded_by,
          e.created_at,
          u.full_name AS uploaded_by_name
        FROM evidence e
        JOIN users u ON u.id = e.uploaded_by
        ORDER BY e.created_at DESC
      `).all()
    : db.prepare(`
        SELECT
          e.id,
          e.filename,
          e.mime_type,
          e.size,
          e.task_id,
          e.report_id,
          e.uploaded_by,
          e.created_at,
          u.full_name AS uploaded_by_name
        FROM evidence e
        JOIN users u ON u.id = e.uploaded_by
        LEFT JOIN tasks t ON t.id = e.task_id
        LEFT JOIN reports r ON r.id = e.report_id
        WHERE e.uploaded_by = ?
           OR t.department_id = ?
           OR r.department_id = ?
        ORDER BY e.created_at DESC
      `).all(
      user.id,
      user.department_id,
      user.department_id
    );

  const auditRows = isD1(user)
    ? db.prepare(`
        SELECT
          a.*,
          u.full_name AS user_name
        FROM audit a
        LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC
        LIMIT 500
      `).all()
    : db.prepare(`
        SELECT
          a.*,
          u.full_name AS user_name
        FROM audit a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.user_id = ?
        ORDER BY a.created_at DESC
        LIMIT 500
      `).all(user.id);

  const financeChanges =
    isFinance(user)
      ? db.prepare(`
          SELECT
            f.*,
            r.full_name AS requested_by_name,
            d.full_name AS decided_by_name
          FROM finance_changes f
          JOIN users r ON r.id = f.requested_by
          LEFT JOIN users d ON d.id = f.decided_by
          ORDER BY f.created_at DESC
        `).all()
      : [];

  res.json({
    ok: true,
    departments,
    users,
    tasks,
    reports,
    activities,
    goals,
    motorcycles,
    income,
    expenses,
    maintenance,
    assignments,
    odometer,
    dailyClosings,
    evidence,
    audit: auditRows,
    financeChanges
  });
});

app.post('/api/tasks', authenticate, (req, res) => {
  const title = cleanString(req.body.title, 200);
  const description = cleanString(req.body.description, 3000);
  const responsibleId = Number(req.body.responsible_id);
  const departmentId = Number(req.body.department_id);
  const priority = cleanString(req.body.priority, 20) || 'Normal';
  const dueDate = cleanString(req.body.due_date, 20);

  if (!title || !responsibleId || !departmentId) {
    return res.status(400).json({
      ok: false,
      error: 'Title, department and responsible user are required.'
    });
  }

  if (
    !['Low', 'Normal', 'High', 'Urgent'].includes(priority)
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid task priority.'
    });
  }

  if (dueDate && !validDate(dueDate)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid due date.'
    });
  }

  const responsible = getUserById(responsibleId);

  if (!responsible || !responsible.active) {
    return res.status(400).json({
      ok: false,
      error: 'Responsible user is invalid or inactive.'
    });
  }

  if (
    !isD1(req.user) &&
    departmentId !== req.user.department_id
  ) {
    return res.status(403).json({
      ok: false,
      error: 'You can only create tasks for your department.'
    });
  }

  if (
    !isD1(req.user) &&
    responsible.department_id !== req.user.department_id
  ) {
    return res.status(403).json({
      ok: false,
      error: 'You can only assign tasks within your department.'
    });
  }

  const result = db.prepare(`
    INSERT INTO tasks
    (title, description, department_id, created_by,
     responsible_id, priority, status, due_date)
    VALUES (?, ?, ?, ?, ?, ?, 'Not Started', ?)
  `).run(
    title,
    description || null,
    departmentId,
    req.user.id,
    responsibleId,
    priority,
    dueDate || null
  );

  audit(
    req.user.id,
    'CREATE',
    'task',
    result.lastInsertRowid,
    { title },
    req.ip
  );

  res.status(201).json({
    ok: true,
    task: db.prepare(`
      SELECT *
      FROM tasks
      WHERE id = ?
    `).get(result.lastInsertRowid)
  });
});

app.patch('/api/tasks/:id', authenticate, (req, res) => {
  const id = Number(req.params.id);
  const task = db.prepare(`
    SELECT *
    FROM tasks
    WHERE id = ?
  `).get(id);

  if (!task) {
    return res.status(404).json({
      ok: false,
      error: 'Task not found.'
    });
  }

  const user = req.user;
  const isResponsible = task.responsible_id === user.id;
  const d1 = isD1(user);

  if (
    !d1 &&
    !isResponsible &&
    task.created_by !== user.id
  ) {
    return res.status(403).json({
      ok: false,
      error: 'You do not have permission to modify this task.'
    });
  }

  if (!d1 && task.status === 'Completed') {
    return res.status(403).json({
      ok: false,
      error: 'Completed tasks can only be controlled by D1.'
    });
  }

  const requestedStatus =
    req.body.status !== undefined
      ? cleanString(req.body.status, 30)
      : task.status;

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
    return res.status(400).json({
      ok: false,
      error: 'Invalid task status.'
    });
  }

  let rejectionReason =
    req.body.rejection_reason !== undefined
      ? cleanString(req.body.rejection_reason, 2000)
      : task.rejection_reason;

  if (
    requestedStatus === 'Rejected' &&
    !rejectionReason
  ) {
    return res.status(400).json({
      ok: false,
      error: 'A rejection reason is required.'
    });
  }

  if (!d1) {
    if (
      requestedStatus === 'Accepted' &&
      (!isResponsible || task.status !== 'Not Started')
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Only the responsible user can accept a Not Started task.'
      });
    }

    if (
      requestedStatus === 'Rejected' &&
      (!isResponsible || task.status !== 'Not Started')
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Only the responsible user can reject a Not Started task.'
      });
    }

    if (
      requestedStatus === 'In Progress' &&
      (!isResponsible || task.status !== 'Accepted')
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Task must be Accepted before moving to In Progress.'
      });
    }

    if (
      requestedStatus === 'Completed' &&
      (!isResponsible || task.status !== 'In Progress')
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Task must be In Progress before completion.'
      });
    }

    if (
      requestedStatus === 'On Hold' &&
      !isResponsible
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Only the responsible user can put a task On Hold.'
      });
    }

    if (
      requestedStatus === 'Cancelled' &&
      task.created_by !== user.id
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Only the task creator can cancel this task.'
      });
    }

    if (
      requestedStatus === 'Not Started'
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Only D1 can reset a task to Not Started.'
      });
    }
  }

  if (
    requestedStatus === 'Accepted' ||
    requestedStatus === 'In Progress' ||
    requestedStatus === 'Completed' ||
    requestedStatus === 'On Hold'
  ) {
    rejectionReason = null;
  }

  const completedAt =
    requestedStatus === 'Completed'
      ? new Date().toISOString()
      : task.completed_at;

  db.prepare(`
    UPDATE tasks
    SET
      status = ?,
      rejection_reason = ?,
      completed_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    requestedStatus,
    rejectionReason || null,
    completedAt,
    id
  );

  audit(
    user.id,
    'UPDATE_STATUS',
    'task',
    id,
    {
      from: task.status,
      to: requestedStatus,
      rejection_reason: rejectionReason || null
    },
    req.ip
  );

  res.json({
    ok: true,
    task: db.prepare(`
      SELECT *
      FROM tasks
      WHERE id = ?
    `).get(id)
  });
});

app.get('/api/reports', authenticate, (req, res) => {
  const rows = isD1(req.user)
    ? db.prepare(`
        SELECT *
        FROM reports
        ORDER BY created_at DESC
      `).all()
    : db.prepare(`
        SELECT *
        FROM reports
        WHERE department_id = ?
           OR user_id = ?
        ORDER BY created_at DESC
      `).all(
      req.user.department_id,
      req.user.id
    );

  res.json({
    ok: true,
    reports: rows
  });
});

app.post('/api/reports', authenticate, (req, res) => {
  const title = cleanString(req.body.title, 200);
  const content = cleanString(req.body.content, 10000);
  const reportDate =
    cleanString(req.body.report_date, 20) || today();

  if (!title || !content) {
    return res.status(400).json({
      ok: false,
      error: 'Report title and content are required.'
    });
  }

  if (!validDate(reportDate)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid report date.'
    });
  }

  const departmentId = isD1(req.user)
    ? Number(req.body.department_id) || req.user.department_id
    : req.user.department_id;

  const result = db.prepare(`
    INSERT INTO reports
    (title, content, department_id, user_id, report_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    content,
    departmentId,
    req.user.id,
    reportDate
  );

  audit(
    req.user.id,
    'CREATE',
    'report',
    result.lastInsertRowid,
    { title },
    req.ip
  );

  res.status(201).json({
    ok: true,
    report: db.prepare(`
      SELECT *
      FROM reports
      WHERE id = ?
    `).get(result.lastInsertRowid)
  });
});

app.get('/api/activities', authenticate, (req, res) => {
  const rows = isD1(req.user)
    ? db.prepare(`
        SELECT *
        FROM activities
        ORDER BY activity_date DESC, id DESC
      `).all()
    : db.prepare(`
        SELECT *
        FROM activities
        WHERE department_id = ?
           OR user_id = ?
        ORDER BY activity_date DESC, id DESC
      `).all(
      req.user.department_id,
      req.user.id
    );

  res.json({
    ok: true,
    activities: rows
  });
});

app.post('/api/activities', authenticate, (req, res) => {
  const title = cleanString(req.body.title, 200);
  const description = cleanString(req.body.description, 3000);
  const activityDate =
    cleanString(req.body.activity_date, 20) || today();
  const status =
    cleanString(req.body.status, 30) || 'Completed';

  if (!title) {
    return res.status(400).json({
      ok: false,
      error: 'Activity title is required.'
    });
  }

  if (!validDate(activityDate)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid activity date.'
    });
  }

  const departmentId = isD1(req.user)
    ? Number(req.body.department_id) || req.user.department_id
    : req.user.department_id;

  const result = db.prepare(`
    INSERT INTO activities
    (title, description, department_id, user_id,
     activity_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description || null,
    departmentId,
    req.user.id,
    activityDate,
    status
  );

  audit(
    req.user.id,
    'CREATE',
    'activity',
    result.lastInsertRowid,
    { title },
    req.ip
  );

  res.status(201).json({
    ok: true,
    activity: db.prepare(`
      SELECT *
      FROM activities
      WHERE id = ?
    `).get(result.lastInsertRowid)
  });
});

app.get('/api/goals', authenticate, (req, res) => {
  const rows = isD1(req.user)
    ? db.prepare(`
        SELECT *
        FROM goals
        ORDER BY created_at DESC
      `).all()
    : db.prepare(`
        SELECT *
        FROM goals
        WHERE department_id = ?
           OR owner_id = ?
        ORDER BY created_at DESC
      `).all(
      req.user.department_id,
      req.user.id
    );

  res.json({
    ok: true,
    goals: rows
  });
});

app.post('/api/goals', authenticate, (req, res) => {
  const title = cleanString(req.body.title, 200);
  const description = cleanString(req.body.description, 3000);
  const targetDate = cleanString(req.body.target_date, 20);

  if (!title) {
    return res.status(400).json({
      ok: false,
      error: 'Goal title is required.'
    });
  }

  if (targetDate && !validDate(targetDate)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid target date.'
    });
  }

  const departmentId = isD1(req.user)
    ? Number(req.body.department_id) || req.user.department_id
    : req.user.department_id;

  const ownerId = isD1(req.user)
    ? Number(req.body.owner_id) || req.user.id
    : req.user.id;

  const owner = getUserById(ownerId);

  if (!owner) {
    return res.status(400).json({
      ok: false,
      error: 'Goal owner not found.'
    });
  }

  if (
    !isD1(req.user) &&
    owner.department_id !== req.user.department_id
  ) {
    return res.status(403).json({
      ok: false,
      error: 'Invalid goal owner.'
    });
  }

  const result = db.prepare(`
    INSERT INTO goals
    (title, description, department_id, owner_id, target_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    description || null,
    departmentId,
    ownerId,
    targetDate || null
  );

  audit(
    req.user.id,
    'CREATE',
    'goal',
    result.lastInsertRowid,
    { title },
    req.ip
  );

  res.status(201).json({
    ok: true,
    goal: db.prepare(`
      SELECT *
      FROM goals
      WHERE id = ?
    `).get(result.lastInsertRowid)
  });
});

app.patch('/api/goals/:id', authenticate, (req, res) => {
  const id = Number(req.params.id);

  const goal = db.prepare(`
    SELECT *
    FROM goals
    WHERE id = ?
  `).get(id);

  if (!goal) {
    return res.status(404).json({
      ok: false,
      error: 'Goal not found.'
    });
  }

  if (
    !isD1(req.user) &&
    goal.department_id !== req.user.department_id &&
    goal.owner_id !== req.user.id
  ) {
    return res.status(403).json({
      ok: false,
      error: 'You do not have permission to update this goal.'
    });
  }

  const progress =
    req.body.progress !== undefined
      ? Number(req.body.progress)
      : goal.progress;

  if (
    !Number.isInteger(progress) ||
    progress < 0 ||
    progress > 100
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Goal progress must be between 0 and 100.'
    });
  }

  const status =
    req.body.status !== undefined
      ? cleanString(req.body.status, 30)
      : goal.status;

  db.prepare(`
    UPDATE goals
    SET
      progress = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    progress,
    status,
    id
  );

  audit(
    req.user.id,
    'UPDATE',
    'goal',
    id,
    { progress, status },
    req.ip
  );

  res.json({
    ok: true,
    goal: db.prepare(`
      SELECT *
      FROM goals
      WHERE id = ?
    `).get(id)
  });
});

app.post(
  '/api/motorcycles',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const plateNumber =
      cleanString(req.body.plate_number, 50).toUpperCase();
    const model = cleanString(req.body.model, 100);
    const year =
      req.body.year !== undefined
        ? Number(req.body.year)
        : null;
    const purchasePrice =
      Number(req.body.purchase_price || 0);
    const purchaseDate =
      cleanString(req.body.purchase_date, 20);
    const notes = cleanString(req.body.notes, 2000);

    if (!plateNumber) {
      return res.status(400).json({
        ok: false,
        error: 'Plate number is required.'
      });
    }

    if (
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid purchase price.'
      });
    }

    if (
      year !== null &&
      (!Number.isInteger(year) ||
        year < 1900 ||
        year > new Date().getFullYear() + 1)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid motorcycle year.'
      });
    }

    try {
      const result = db.prepare(`
        INSERT INTO motorcycles
        (plate_number, model, year, purchase_price,
         purchase_date, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        plateNumber,
        model || null,
        year,
        purchasePrice,
        purchaseDate || null,
        notes || null
      );

      audit(
        req.user.id,
        'CREATE',
        'motorcycle',
        result.lastInsertRowid,
        { plateNumber },
        req.ip
      );

      res.status(201).json({
        ok: true,
        motorcycle: db.prepare(`
          SELECT *
          FROM motorcycles
          WHERE id = ?
        `).get(result.lastInsertRowid)
      });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        return res.status(409).json({
          ok: false,
          error: 'A motorcycle with this plate number already exists.'
        });
      }

      throw error;
    }
  }
);

app.post(
  '/api/motorcycles/:id/status',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const id = Number(req.params.id);
    const status = cleanString(req.body.status, 40);

    const allowed = [
      'Active',
      'Under Maintenance',
      'Inactive',
      'Sold'
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid motorcycle status.'
      });
    }

    const motorcycle = db.prepare(`
      SELECT *
      FROM motorcycles
      WHERE id = ?
    `).get(id);

    if (!motorcycle) {
      return res.status(404).json({
        ok: false,
        error: 'Motorcycle not found.'
      });
    }

    db.prepare(`
      UPDATE motorcycles
      SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    audit(
      req.user.id,
      'UPDATE_STATUS',
      'motorcycle',
      id,
      { from: motorcycle.status, to: status },
      req.ip
    );

    res.json({
      ok: true,
      motorcycle: db.prepare(`
        SELECT *
        FROM motorcycles
        WHERE id = ?
      `).get(id)
    });
  }
);

app.post(
  '/api/income',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const motorcycleId =
      req.body.motorcycle_id
        ? Number(req.body.motorcycle_id)
        : null;

    const amount = Number(req.body.amount);
    const incomeDate =
      cleanString(req.body.income_date, 20) || today();
    const source = cleanString(req.body.source, 100);
    const description = cleanString(
      req.body.description,
      2000
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Income amount must be greater than zero.'
      });
    }

    if (!validDate(incomeDate)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid income date.'
      });
    }

    if (motorcycleId) {
      const motorcycle = db.prepare(`
        SELECT id
        FROM motorcycles
        WHERE id = ?
      `).get(motorcycleId);

      if (!motorcycle) {
        return res.status(400).json({
          ok: false,
          error: 'Motorcycle not found.'
        });
      }
    }

    const autoVerified = isD1(req.user);

    const result = db.prepare(`
      INSERT INTO income
      (motorcycle_id, amount, income_date, source,
       description, entered_by, verified_by,
       verified_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      motorcycleId,
      amount,
      incomeDate,
      source || null,
      description || null,
      req.user.id,
      autoVerified ? req.user.id : null,
      autoVerified ? new Date().toISOString() : null,
      autoVerified ? 'Verified' : 'Pending'
    );

    audit(
      req.user.id,
      'CREATE',
      'income',
      result.lastInsertRowid,
      { amount, incomeDate },
      req.ip
    );

    res.status(201).json({
      ok: true,
      income: db.prepare(`
        SELECT *
        FROM income
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.post(
  '/api/income/:id/verify',
  authenticate,
  requireDepartments('D1', 'D3'),
  (req, res) => {
    const id = Number(req.params.id);

    const row = db.prepare(`
      SELECT *
      FROM income
      WHERE id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({
        ok: false,
        error: 'Income record not found.'
      });
    }

    if (row.status === 'Verified') {
      return res.json({
        ok: true,
        income: row
      });
    }

    db.prepare(`
      UPDATE income
      SET
        status = 'Verified',
        verified_by = ?,
        verified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      req.user.id,
      id
    );

    audit(
      req.user.id,
      'VERIFY',
      'income',
      id,
      null,
      req.ip
    );

    res.json({
      ok: true,
      income: db.prepare(`
        SELECT *
        FROM income
        WHERE id = ?
      `).get(id)
    });
  }
);

app.post(
  '/api/expenses',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    const motorcycleId =
      req.body.motorcycle_id
        ? Number(req.body.motorcycle_id)
        : null;

    const amount = Number(req.body.amount);
    const expenseDate =
      cleanString(req.body.expense_date, 20) || today();
    const category = cleanString(
      req.body.category,
      100
    );
    const description = cleanString(
      req.body.description,
      2000
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Expense amount must be greater than zero.'
      });
    }

    if (!category) {
      return res.status(400).json({
        ok: false,
        error: 'Expense category is required.'
      });
    }

    if (!validDate(expenseDate)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid expense date.'
      });
    }

    const result = db.prepare(`
      INSERT INTO expenses
      (motorcycle_id, amount, expense_date,
       category, description, entered_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      motorcycleId,
      amount,
      expenseDate,
      category,
      description || null,
      req.user.id
    );

    audit(
      req.user.id,
      'CREATE',
      'expense',
      result.lastInsertRowid,
      { amount, category, expenseDate },
      req.ip
    );

    res.status(201).json({
      ok: true,
      expense: db.prepare(`
        SELECT *
        FROM expenses
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.get(
  '/api/fleet-summary',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    const totalMotorcycles = db.prepare(`
      SELECT COUNT(*) AS count
      FROM motorcycles
    `).get().count;

    const activeMotorcycles = db.prepare(`
      SELECT COUNT(*) AS count
      FROM motorcycles
      WHERE status = 'Active'
    `).get().count;

    const underMaintenance = db.prepare(`
      SELECT COUNT(*) AS count
      FROM motorcycles
      WHERE status = 'Under Maintenance'
    `).get().count;

    const verifiedIncome = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM income
      WHERE status = 'Verified'
    `).get().total;

    const expenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
    `).get().total;

    res.json({
      ok: true,
      summary: {
        totalMotorcycles,
        activeMotorcycles,
        underMaintenance,
        verifiedIncome,
        expenses,
        net: verifiedIncome - expenses
      }
    });
  }
);

app.get(
  '/api/assignments',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    res.json({
      ok: true,
      assignments: db.prepare(`
        SELECT
          a.*,
          m.plate_number
        FROM assignments a
        JOIN motorcycles m
          ON m.id = a.motorcycle_id
        ORDER BY a.start_date DESC, a.id DESC
      `).all()
    });
  }
);

app.post(
  '/api/assignments',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const motorcycleId =
      Number(req.body.motorcycle_id);
    const riderName =
      cleanString(req.body.rider_name, 200);
    const riderPhone =
      cleanString(req.body.rider_phone, 50);
    const startDate =
      cleanString(req.body.start_date, 20) || today();
    const notes =
      cleanString(req.body.notes, 2000);

    if (
      !motorcycleId ||
      !riderName ||
      !validDate(startDate)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Motorcycle, rider and valid start date are required.'
      });
    }

    const motorcycle = db.prepare(`
      SELECT *
      FROM motorcycles
      WHERE id = ?
    `).get(motorcycleId);

    if (!motorcycle) {
      return res.status(404).json({
        ok: false,
        error: 'Motorcycle not found.'
      });
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE assignments
        SET
          status = 'Closed',
          end_date = ?
        WHERE motorcycle_id = ?
          AND status = 'Active'
      `).run(
        startDate,
        motorcycleId
      );

      return db.prepare(`
        INSERT INTO assignments
        (motorcycle_id, rider_name, rider_phone,
         start_date, status, notes, created_by)
        VALUES (?, ?, ?, ?, 'Active', ?, ?)
      `).run(
        motorcycleId,
        riderName,
        riderPhone || null,
        startDate,
        notes || null,
        req.user.id
      );
    });

    const result = transaction();

    audit(
      req.user.id,
      'CREATE',
      'assignment',
      result.lastInsertRowid,
      { motorcycleId, riderName },
      req.ip
    );

    res.status(201).json({
      ok: true,
      assignment: db.prepare(`
        SELECT *
        FROM assignments
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.get(
  '/api/odometer',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    res.json({
      ok: true,
      odometer: db.prepare(`
        SELECT
          o.*,
          m.plate_number
        FROM odometer o
        JOIN motorcycles m
          ON m.id = o.motorcycle_id
        ORDER BY o.reading_date DESC, o.id DESC
      `).all()
    });
  }
);

app.post(
  '/api/odometer',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const motorcycleId =
      Number(req.body.motorcycle_id);
    const reading =
      Number(req.body.reading);
    const readingDate =
      cleanString(req.body.reading_date, 20) || today();
    const notes =
      cleanString(req.body.notes, 1000);

    if (
      !motorcycleId ||
      !Number.isInteger(reading) ||
      reading < 0 ||
      !validDate(readingDate)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Valid motorcycle, odometer reading and date are required.'
      });
    }

    const motorcycle = db.prepare(`
      SELECT id
      FROM motorcycles
      WHERE id = ?
    `).get(motorcycleId);

    if (!motorcycle) {
      return res.status(404).json({
        ok: false,
        error: 'Motorcycle not found.'
      });
    }

    const last = db.prepare(`
      SELECT reading
      FROM odometer
      WHERE motorcycle_id = ?
      ORDER BY reading DESC
      LIMIT 1
    `).get(motorcycleId);

    if (last && reading < last.reading) {
      return res.status(400).json({
        ok: false,
        error: `Odometer reading cannot be lower than the previous reading (${last.reading}).`
      });
    }

    const result = db.prepare(`
      INSERT INTO odometer
      (motorcycle_id, reading, reading_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      motorcycleId,
      reading,
      readingDate,
      notes || null,
      req.user.id
    );

    audit(
      req.user.id,
      'CREATE',
      'odometer',
      result.lastInsertRowid,
      { motorcycleId, reading },
      req.ip
    );

    res.status(201).json({
      ok: true,
      odometer: db.prepare(`
        SELECT *
        FROM odometer
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.get(
  '/api/maintenance',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    res.json({
      ok: true,
      maintenance: db.prepare(`
        SELECT
          m.*,
          mo.plate_number
        FROM maintenance m
        JOIN motorcycles mo
          ON mo.id = m.motorcycle_id
        ORDER BY m.maintenance_date DESC, m.id DESC
      `).all()
    });
  }
);

app.post(
  '/api/maintenance',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const motorcycleId =
      Number(req.body.motorcycle_id);
    const maintenanceDate =
      cleanString(req.body.maintenance_date, 20) || today();
    const maintenanceType =
      cleanString(req.body.maintenance_type, 100);
    const cost = Number(req.body.cost || 0);
    const description =
      cleanString(req.body.description, 3000);

    if (
      !motorcycleId ||
      !maintenanceType ||
      !validDate(maintenanceDate)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Motorcycle, maintenance type and valid date are required.'
      });
    }

    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid maintenance cost.'
      });
    }

    const motorcycle = db.prepare(`
      SELECT *
      FROM motorcycles
      WHERE id = ?
    `).get(motorcycleId);

    if (!motorcycle) {
      return res.status(404).json({
        ok: false,
        error: 'Motorcycle not found.'
      });
    }

    const result = db.prepare(`
      INSERT INTO maintenance
      (motorcycle_id, maintenance_date,
       maintenance_type, cost, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      motorcycleId,
      maintenanceDate,
      maintenanceType,
      cost,
      description || null,
      req.user.id
    );

    db.prepare(`
      UPDATE motorcycles
      SET
        status = 'Under Maintenance',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(motorcycleId);

    audit(
      req.user.id,
      'CREATE',
      'maintenance',
      result.lastInsertRowid,
      { motorcycleId, maintenanceType, cost },
      req.ip
    );

    res.status(201).json({
      ok: true,
      maintenance: db.prepare(`
        SELECT *
        FROM maintenance
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.post(
  '/api/maintenance/:id/complete',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const id = Number(req.params.id);

    const maintenance = db.prepare(`
      SELECT *
      FROM maintenance
      WHERE id = ?
    `).get(id);

    if (!maintenance) {
      return res.status(404).json({
        ok: false,
        error: 'Maintenance record not found.'
      });
    }

    db.prepare(`
      UPDATE maintenance
      SET
        status = 'Completed',
        completed_date = CURRENT_DATE
      WHERE id = ?
    `).run(id);

    const openMaintenance = db.prepare(`
      SELECT COUNT(*) AS count
      FROM maintenance
      WHERE motorcycle_id = ?
        AND status = 'Open'
    `).get(maintenance.motorcycle_id).count;

    if (openMaintenance === 0) {
      db.prepare(`
        UPDATE motorcycles
        SET
          status = 'Active',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(maintenance.motorcycle_id);
    }

    audit(
      req.user.id,
      'COMPLETE',
      'maintenance',
      id,
      null,
      req.ip
    );

    res.json({
      ok: true,
      maintenance: db.prepare(`
        SELECT *
        FROM maintenance
        WHERE id = ?
      `).get(id)
    });
  }
);

app.post(
  '/api/daily-closing',
  authenticate,
  requireDepartments('D1', 'D4'),
  (req, res) => {
    const closingDate =
      cleanString(req.body.closing_date, 20) || today();
    const notes =
      cleanString(req.body.notes, 3000);

    if (!validDate(closingDate)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid closing date.'
      });
    }

    const existing = db.prepare(`
      SELECT *
      FROM daily_closings
      WHERE closing_date = ?
    `).get(closingDate);

    if (existing) {
      return res.status(409).json({
        ok: false,
        error: 'Daily closing already exists for this date.',
        closing: existing
      });
    }

    const verifiedIncome = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM income
      WHERE status = 'Verified'
        AND income_date = ?
    `).get(closingDate).total;

    const expenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE expense_date = ?
    `).get(closingDate).total;

    const net = verifiedIncome - expenses;

    const result = db.prepare(`
      INSERT INTO daily_closings
      (closing_date, verified_income, expenses, net,
       notes, closed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      closingDate,
      verifiedIncome,
      expenses,
      net,
      notes || null,
      req.user.id
    );

    audit(
      req.user.id,
      'CREATE',
      'daily_closing',
      result.lastInsertRowid,
      { closingDate, verifiedIncome, expenses, net },
      req.ip
    );

    res.status(201).json({
      ok: true,
      closing: db.prepare(`
        SELECT *
        FROM daily_closings
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.get(
  '/api/daily-closings',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    res.json({
      ok: true,
      dailyClosings: db.prepare(`
        SELECT *
        FROM daily_closings
        ORDER BY closing_date DESC
      `).all()
    });
  }
);

app.post(
  '/api/evidence',
  authenticate,
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: 'File is required.'
      });
    }

    const taskId =
      req.body.task_id
        ? Number(req.body.task_id)
        : null;

    const reportId =
      req.body.report_id
        ? Number(req.body.report_id)
        : null;

    if (!taskId && !reportId) {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        ok: false,
        error: 'Evidence must be linked to a task or report.'
      });
    }

    if (taskId) {
      const task = db.prepare(`
        SELECT *
        FROM tasks
        WHERE id = ?
      `).get(taskId);

      if (!task) {
        fs.unlinkSync(req.file.path);

        return res.status(404).json({
          ok: false,
          error: 'Task not found.'
        });
      }

      if (
        !isD1(req.user) &&
        task.department_id !== req.user.department_id &&
        task.responsible_id !== req.user.id &&
        task.created_by !== req.user.id
      ) {
        fs.unlinkSync(req.file.path);

        return res.status(403).json({
          ok: false,
          error: 'You cannot attach evidence to this task.'
        });
      }
    }

    if (reportId) {
      const report = db.prepare(`
        SELECT *
        FROM reports
        WHERE id = ?
      `).get(reportId);

      if (!report) {
        fs.unlinkSync(req.file.path);

        return res.status(404).json({
          ok: false,
          error: 'Report not found.'
        });
      }

      if (
        !isD1(req.user) &&
        report.department_id !== req.user.department_id &&
        report.user_id !== req.user.id
      ) {
        fs.unlinkSync(req.file.path);

        return res.status(403).json({
          ok: false,
          error: 'You cannot attach evidence to this report.'
        });
      }
    }

    const result = db.prepare(`
      INSERT INTO evidence
      (filename, stored_filename, mime_type, size,
       task_id, report_id, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size,
      taskId,
      reportId,
      req.user.id
    );

    audit(
      req.user.id,
      'UPLOAD',
      'evidence',
      result.lastInsertRowid,
      {
        filename: req.file.originalname,
        taskId,
        reportId
      },
      req.ip
    );

    res.status(201).json({
      ok: true,
      evidence: {
        id: result.lastInsertRowid,
        filename: req.file.originalname,
        mime_type: req.file.mimetype,
        size: req.file.size,
        task_id: taskId,
        report_id: reportId
      }
    });
  }
);

app.get('/api/evidence', authenticate, (req, res) => {
  const rows = isD1(req.user)
    ? db.prepare(`
        SELECT
          e.id,
          e.filename,
          e.mime_type,
          e.size,
          e.task_id,
          e.report_id,
          e.uploaded_by,
          e.created_at,
          u.full_name AS uploaded_by_name
        FROM evidence e
        JOIN users u ON u.id = e.uploaded_by
        ORDER BY e.created_at DESC
      `).all()
    : db.prepare(`
        SELECT
          e.id,
          e.filename,
          e.mime_type,
          e.size,
          e.task_id,
          e.report_id,
          e.uploaded_by,
          e.created_at,
          u.full_name AS uploaded_by_name
        FROM evidence e
        JOIN users u ON u.id = e.uploaded_by
        LEFT JOIN tasks t ON t.id = e.task_id
        LEFT JOIN reports r ON r.id = e.report_id
        WHERE e.uploaded_by = ?
           OR t.department_id = ?
           OR r.department_id = ?
        ORDER BY e.created_at DESC
      `).all(
      req.user.id,
      req.user.department_id,
      req.user.department_id
    );

  res.json({
    ok: true,
    evidence: rows
  });
});

app.get(
  '/api/evidence/:id/file',
  authenticate,
  (req, res) => {
    const id = Number(req.params.id);

    const evidence = db.prepare(`
      SELECT
        e.*,
        t.department_id AS task_department_id,
        t.responsible_id AS task_responsible_id,
        t.created_by AS task_creator_id,
        r.department_id AS report_department_id,
        r.user_id AS report_user_id
      FROM evidence e
      LEFT JOIN tasks t
        ON t.id = e.task_id
      LEFT JOIN reports r
        ON r.id = e.report_id
      WHERE e.id = ?
    `).get(id);

    if (!evidence) {
      return res.status(404).json({
        ok: false,
        error: 'Evidence not found.'
      });
    }

    if (!isD1(req.user)) {
      const allowed =
        evidence.uploaded_by === req.user.id ||
        evidence.task_department_id === req.user.department_id ||
        evidence.task_responsible_id === req.user.id ||
        evidence.task_creator_id === req.user.id ||
        evidence.report_department_id === req.user.department_id ||
        evidence.report_user_id === req.user.id;

      if (!allowed) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have access to this evidence.'
        });
      }
    }

    const storedName = path.basename(
      evidence.stored_filename
    );

    const filePath = path.join(
      UPLOAD_DIR,
      storedName
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        ok: false,
        error: 'Evidence file is missing.'
      });
    }

    res.setHeader(
      'Content-Type',
      evidence.mime_type
    );

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(
        evidence.filename
      )}"`
    );

    res.sendFile(filePath);
  }
);

app.get(
  '/api/audit',
  authenticate,
  (req, res) => {
    const rows = isD1(req.user)
      ? db.prepare(`
          SELECT
            a.*,
            u.full_name AS user_name
          FROM audit a
          LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.created_at DESC
          LIMIT 500
        `).all()
      : db.prepare(`
          SELECT
            a.*,
            u.full_name AS user_name
          FROM audit a
          LEFT JOIN users u ON u.id = a.user_id
          WHERE a.user_id = ?
          ORDER BY a.created_at DESC
          LIMIT 500
        `).all(req.user.id);

    res.json({
      ok: true,
      audit: rows
    });
  }
);

app.post(
  '/api/finance-changes',
  authenticate,
  requireDepartments('D1', 'D3', 'D4'),
  (req, res) => {
    const changeType =
      cleanString(req.body.change_type, 100);
    const referenceType =
      cleanString(req.body.reference_type, 100);
    const referenceId =
      req.body.reference_id
        ? Number(req.body.reference_id)
        : null;
    const amount =
      req.body.amount !== undefined
        ? Number(req.body.amount)
        : null;
    const description =
      cleanString(req.body.description, 3000);

    if (!changeType || !description) {
      return res.status(400).json({
        ok: false,
        error: 'Change type and description are required.'
      });
    }

    if (
      amount !== null &&
      (!Number.isFinite(amount) || amount < 0)
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid finance change amount.'
      });
    }

    const result = db.prepare(`
      INSERT INTO finance_changes
      (change_type, reference_type, reference_id,
       amount, description, requested_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      changeType,
      referenceType || null,
      referenceId,
      amount,
      description,
      req.user.id
    );

    audit(
      req.user.id,
      'CREATE',
      'finance_change',
      result.lastInsertRowid,
      { changeType, amount },
      req.ip
    );

    res.status(201).json({
      ok: true,
      financeChange: db.prepare(`
        SELECT *
        FROM finance_changes
        WHERE id = ?
      `).get(result.lastInsertRowid)
    });
  }
);

app.post(
  '/api/finance-changes/:id/decision',
  authenticate,
  requireDepartments('D1'),
  (req, res) => {
    const id = Number(req.params.id);
    const decision =
      cleanString(req.body.decision, 30);
    const reason =
      cleanString(req.body.decision_reason, 3000);

    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({
        ok: false,
        error: 'Decision must be Approved or Rejected.'
      });
    }

    const change = db.prepare(`
      SELECT *
      FROM finance_changes
      WHERE id = ?
    `).get(id);

    if (!change) {
      return res.status(404).json({
        ok: false,
        error: 'Finance change not found.'
      });
    }

    if (change.decision !== 'Pending') {
      return res.status(409).json({
        ok: false,
        error: 'This finance change has already been decided.'
      });
    }

    db.prepare(`
      UPDATE finance_changes
      SET
        decision = ?,
        decision_reason = ?,
        decided_by = ?,
        decided_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      decision,
      reason || null,
      req.user.id,
      id
    );

    audit(
      req.user.id,
      'DECISION',
      'finance_change',
      id,
      { decision, reason },
      req.ip
    );

    res.json({
      ok: true,
      financeChange: db.prepare(`
        SELECT *
        FROM finance_changes
        WHERE id = ?
      `).get(id)
    });
  }
);

app.get(
  '/api/users',
  authenticate,
  requireDepartments('D1'),
  (req, res) => {
    res.json({
      ok: true,
      users: db.prepare(`
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.department_id,
          u.role,
          u.active,
          d.code AS department_code,
          d.name AS department_name
        FROM users u
        JOIN departments d
          ON d.id = u.department_id
        ORDER BY d.code, u.full_name
      `).all()
    });
  }
);

app.post(
  '/api/users',
  authenticate,
  requireDepartments('D1'),
  (req, res) => {
    const username =
      cleanString(req.body.username, 100).toLowerCase();
    const password =
      String(req.body.password || '');
    const fullName =
      cleanString(req.body.full_name, 200);
    const departmentId =
      Number(req.body.department_id);
    const role =
      cleanString(req.body.role, 100) ||
      'Department Officer';

    if (
      !username ||
      !fullName ||
      !departmentId ||
      password.length < 10
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Username, full name, department and a password of at least 10 characters are required.'
      });
    }

    const department = db.prepare(`
      SELECT id
      FROM departments
      WHERE id = ?
    `).get(departmentId);

    if (!department) {
      return res.status(400).json({
        ok: false,
        error: 'Department not found.'
      });
    }

    try {
      const passwordHash =
        bcrypt.hashSync(password, 12);

      const result = db.prepare(`
        INSERT INTO users
        (username, password_hash, full_name,
         department_id, role)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        username,
        passwordHash,
        fullName,
        departmentId,
        role
      );

      audit(
        req.user.id,
        'CREATE',
        'user',
        result.lastInsertRowid,
        { username, fullName },
        req.ip
      );

      res.status(201).json({
        ok: true,
        user: getUserById(result.lastInsertRowid)
      });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        return res.status(409).json({
          ok: false,
          error: 'Username already exists.'
        });
      }

      throw error;
    }
  }
);

app.patch(
  '/api/users/:id',
  authenticate,
  requireDepartments('D1'),
  (req, res) => {
    const id = Number(req.params.id);

    const target = getUserById(id);

    if (!target) {
      return res.status(404).json({
        ok: false,
        error: 'User not found.'
      });
    }

    if (
      id === req.user.id &&
      req.body.active === false
    ) {
      return res.status(400).json({
        ok: false,
        error: 'D1 cannot disable its own account.'
      });
    }

    const fullName =
      req.body.full_name !== undefined
        ? cleanString(req.body.full_name, 200)
        : target.full_name;

    const departmentId =
      req.body.department_id !== undefined
        ? Number(req.body.department_id)
        : target.department_id;

    const role =
      req.body.role !== undefined
        ? cleanString(req.body.role, 100)
        : target.role;

    const active =
      req.body.active !== undefined
        ? req.body.active ? 1 : 0
        : target.active;

    if (!fullName || !departmentId) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid user information.'
      });
    }

    const department = db.prepare(`
      SELECT id
      FROM departments
      WHERE id = ?
    `).get(departmentId);

    if (!department) {
      return res.status(400).json({
        ok: false,
        error: 'Department not found.'
      });
    }

    db.prepare(`
      UPDATE users
      SET
        full_name = ?,
        department_id = ?,
        role = ?,
        active = ?
      WHERE id = ?
    `).run(
      fullName,
      departmentId,
      role,
      active,
      id
    );

    if (
      req.body.password !== undefined &&
      String(req.body.password).length > 0
    ) {
      const password =
        String(req.body.password);

      if (password.length < 10) {
        return res.status(400).json({
          ok: false,
          error: 'New password must be at least 10 characters.'
        });
      }

      const passwordHash =
        bcrypt.hashSync(password, 12);

      db.prepare(`
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
      `).run(
        passwordHash,
        id
      );
    }

    audit(
      req.user.id,
      'UPDATE',
      'user',
      id,
      {
        fullName,
        departmentId,
        role,
        active
      },
      req.ip
    );

    res.json({
      ok: true,
      user: getUserById(id)
    });
  }
);

app.get('/api/alerts', authenticate, (req, res) => {
  const user = req.user;

  const maintenanceAlerts =
    ['D1', 'D3', 'D4'].includes(user.department_code)
      ? db.prepare(`
          SELECT
            m.id,
            'maintenance' AS type,
            m.maintenance_type AS title,
            m.maintenance_date,
            mo.plate_number
          FROM maintenance m
          JOIN motorcycles mo
            ON mo.id = m.motorcycle_id
          WHERE m.status = 'Open'
          ORDER BY m.maintenance_date ASC
        `).all()
      : [];

  const overdueTasks = isD1(user)
    ? db.prepare(`
        SELECT
          id,
          title,
          due_date,
          status
        FROM tasks
        WHERE due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND status NOT IN ('Completed', 'Cancelled')
        ORDER BY due_date ASC
      `).all()
    : db.prepare(`
        SELECT
          id,
          title,
          due_date,
          status
        FROM tasks
        WHERE due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND status NOT IN ('Completed', 'Cancelled')
          AND (
            department_id = ?
            OR responsible_id = ?
            OR created_by = ?
          )
        ORDER BY due_date ASC
      `).all(
      user.department_id,
      user.id,
      user.id
    );

  const rejectedTasks = isD1(user)
    ? db.prepare(`
        SELECT
          id,
          title,
          rejection_reason,
          updated_at
        FROM tasks
        WHERE status = 'Rejected'
        ORDER BY updated_at DESC
      `).all()
    : db.prepare(`
        SELECT
          id,
          title,
          rejection_reason,
          updated_at
        FROM tasks
        WHERE status = 'Rejected'
          AND (
            department_id = ?
            OR responsible_id = ?
            OR created_by = ?
          )
        ORDER BY updated_at DESC
      `).all(
      user.department_id,
      user.id,
      user.id
    );

  res.json({
    ok: true,
    alerts: {
      maintenance: maintenanceAlerts,
      overdueTasks,
      rejectedTasks
    }
  });
});

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

app.get('/*splat', (req, res) => {
  if (req.method !== 'GET') {
    return res.status(404).end();
  }

  const index = path.join(
    PUBLIC_DIR,
    'index.html'
  );

  if (fs.existsSync(index)) {
    return res.sendFile(index);
  }

  return res
    .status(404)
    .send('THE BG WEB frontend not found.');
});

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;

  res.status(status).json({
    ok: false,
    error:
      status !== 500
        ? err.message
        : 'Internal server error.'
  });
});

app.listen(PORT, () => {
  console.log(
    `THE BG WEB server running on port ${PORT}`
  );
});
