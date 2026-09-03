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

const UPLOAD_DIR =
  path.join(ROOT, 'public', 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), {
  recursive: true
});

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true
});

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
  return db
    .prepare('SELECT COUNT(*) AS n FROM users')
    .get().n;
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
try {
  const taskColumns = db.prepare(`
    PRAGMA table_info(tasks)
  `).all();

  const hasRejectionReason =
    taskColumns.some(
      column =>
        column.name === 'rejection_reason'
    );

  if (!hasRejectionReason) {
    db.exec(`
      ALTER TABLE tasks
      ADD COLUMN rejection_reason TEXT
    `);
  }
} catch (error) {
  console.error(
    'TASK MIGRATION ERROR:',
    error
  );
}

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
   SAFE DATABASE MIGRATIONS
========================================================= */

try {
  const taskColumns = db
    .prepare('PRAGMA table_info(tasks)')
    .all();

  const hasRejectionReason =
    taskColumns.some(
      (column) =>
        column.name === 'rejection_reason'
    );

  if (!hasRejectionReason) {
    db.exec(`
      ALTER TABLE tasks
      ADD COLUMN rejection_reason TEXT
    `);
  }
} catch (error) {
  console.error(
    'TASK MIGRATION ERROR:',
    error
  );

  throw error;
}

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

departments.forEach((d) => {
  upDept.run(...d);
});

/* =========================================================
   INITIAL USERS
========================================================= */

const userCount = oneCount();

const initialPassword =
  process.env.INITIAL_ADMIN_PASSWORD;

if (userCount === 0) {
  if (
    NODE_ENV === 'production' &&
    (!initialPassword ||
      initialPassword.length < 10)
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
    upUser.run(
      d[2],
      d[0].toLowerCase(),
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

app.use(
  express.json({
    limit: '2mb'
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb'
  })
);

app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'X-Frame-Options',
    'SAMEORIGIN'
  );

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
  const key = String(
    req.ip || 'unknown'
  );

  const now = Date.now();

  let state =
    loginAttempts.get(key) || {
      n: 0,
      t: now
    };

  if (
    now - state.t >
    15 * 60 * 1000
  ) {
    state = {
      n: 0,
      t: now
    };
  }

  if (state.n >= 10) {
    return res.status(429).json({
      error:
        'Too many login attempts. Try again later.'
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
        path
          .extname(
            file.originalname
          )
          .toLowerCase()
          .replace(
            /[^a-z0-9.]/gi,
            ''
          );

      cb(
        null,
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${safeExt}`
      );
    }
  }),

  fileFilter: (req, file, cb) => {
    if (
      !allowedMime.has(
        file.mimetype
      )
    ) {
      return cb(
        new Error(
          'File type is not allowed.'
        )
      );
    }

    cb(null, true);
  },

  limits: {
    fileSize:
      10 * 1024 * 1024
  }
});

/* =========================================================
   AUTH
========================================================= */

function auth(req, res, next) {
  try {
    const token =
      req.cookies.bg_token;

    if (!token) {
      throw new Error(
        'No token'
      );
    }

    req.user = jwt.verify(
      token,
      EFFECTIVE_JWT_SECRET
    );

    const currentUser = one(
      `
      SELECT
        id,
        name,
        username,
        department_id,
        active
      FROM users
      WHERE id=?
      `,
      req.user.id
    );

    if (
      !currentUser ||
      !currentUser.active
    ) {
      throw new Error(
        'Account inactive'
      );
    }

    req.user = {
      id: currentUser.id,
      name: currentUser.name,
      username:
        currentUser.username,
      department_id:
        currentUser.department_id
    };

    next();
  } catch (error) {
    return res.status(401).json({
      error:
        'Not authenticated'
    });
  }
}

function d1(req) {
  return (
    req.user.department_id ===
    'D1'
  );
}

function hasDept(
  req,
  departments
) {
  return departments.includes(
    req.user.department_id
  );
}

function deptOnly(
  req,
  departments
) {
  return (
    d1(req) ||
    hasDept(
      req,
      departments
    )
  );
}

function sameDept(
  req,
  userId
) {
  const numericId =
    Number(userId);

  if (
    !Number.isInteger(
      numericId
    )
  ) {
    return false;
  }

  const u = one(
    `
    SELECT
      id,
      department_id,
      active
    FROM users
    WHERE id=?
    `,
    numericId
  );

  return Boolean(
    u &&
    u.active &&
    (
      d1(req) ||
      u.department_id ===
        req.user.department_id
    )
  );
}

function userExists(userId) {
  const id = Number(
    userId
  );

  if (
    !Number.isInteger(id)
  ) {
    return null;
  }

  return one(
    `
    SELECT
      id,
      name,
      username,
      department_id,
      active
    FROM users
    WHERE id=?
    `,
    id
  );
}

function motorcycleExists(
  motorcycleId
) {
  const id = Number(
    motorcycleId
  );

  if (
    !Number.isInteger(id)
  ) {
    return null;
  }

  return one(
    `
    SELECT *
    FROM motorcycles
    WHERE id=?
    `,
    id
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
    const username =
      String(
        req.body.username || ''
      )
        .trim()
        .toLowerCase();

    const password =
      String(
        req.body.password || ''
      );

    const u = one(
      `
      SELECT *
      FROM users
      WHERE username=?
        AND active=1
      `,
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
        error:
          'Invalid login'
      });
    }

    loginAttempts.delete(
      req._loginKey
    );

    const token =
      jwt.sign(
        {
          id: u.id,
          name: u.name,
          username:
            u.username,
          department_id:
            u.department_id
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
        secure:
          NODE_ENV ===
          'production',
        path: '/',
        maxAge:
          7 *
          24 *
          60 *
          60 *
          1000
      }
    );

    res.json({
      user: {
        id: u.id,
        name: u.name,
        username:
          u.username,
        department_id:
          u.department_id
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
        secure:
          NODE_ENV ===
          'production',
        path: '/'
      }
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: true,
      service:
        'THE BG WEB',
      environment:
        NODE_ENV
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
        `
        SELECT *
        FROM departments
        WHERE id=?
        `,
        req.user
          .department_id
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
    try {
      const dept =
        req.user.department_id;

      const isD1 =
        dept === 'D1';
      const isD2 =
        dept === 'D2';
      const isD3 =
        dept === 'D3';
      const isD4 =
        dept === 'D4';
      const isD5 =
        dept === 'D5';

      const users = isD1
        ? rows(`
            SELECT
              id,
              name,
              username,
              department_id,
              active
            FROM users
            ORDER BY id
          `)
        : rows(`
            SELECT
              id,
              name,
              username,
              department_id,
              active
            FROM users
            WHERE department_id=?
               OR id=?
            ORDER BY id
          `,
          dept,
          req.user.id
        );

      const tasks = isD1
        ? rows(`
            SELECT
              t.*,
              u.name AS responsible_name,
              u.department_id
                AS responsible_department
            FROM tasks t
            JOIN users u
              ON u.id=
                 t.responsible_user
            ORDER BY
              t.id DESC
          `)
        : rows(`
            SELECT
              t.*,
              u.name AS responsible_name,
              u.department_id
                AS responsible_department
            FROM tasks t
            JOIN users u
              ON u.id=
                 t.responsible_user
            WHERE
              u.department_id=?
              OR t.created_by=?
              OR t.responsible_user=?
            ORDER BY
              t.id DESC
          `,
          dept,
          req.user.id,
          req.user.id
        );

      const reports = isD1
        ? rows(`
            SELECT
              r.*,
              u.name AS user_name,
              u.department_id
                AS user_department
            FROM reports r
            JOIN users u
              ON u.id=r.user_id
            ORDER BY
              r.id DESC
          `)
        : rows(`
            SELECT
              r.*,
              u.name AS user_name,
              u.department_id
                AS user_department
            FROM reports r
            JOIN users u
              ON u.id=r.user_id
            WHERE
              u.department_id=?
              OR r.user_id=?
            ORDER BY
              r.id DESC
          `,
          dept,
          req.user.id
        );

      const motorcycles =
        isD1 ||
        isD3 ||
        isD4
          ? rows(`
              SELECT *
              FROM motorcycles
              ORDER BY id DESC
            `)
          : [];

      const income =
        isD1 ||
        isD3
          ? rows(`
              SELECT
                i.*,
                m.code
                  AS motorcycle_code,
                u.name
                  AS entered_name,
                u.department_id
                  AS entered_department
              FROM income i
              JOIN motorcycles m
                ON m.id=
                   i.motorcycle_id
              JOIN users u
                ON u.id=
                   i.entered_by
              ORDER BY
                i.date DESC,
                i.id DESC
            `)
          : isD4
            ? rows(`
                SELECT
                  i.*,
                  m.code
                    AS motorcycle_code,
                  u.name
                    AS entered_name,
                  u.department_id
                    AS entered_department
                FROM income i
                JOIN motorcycles m
                  ON m.id=
                     i.motorcycle_id
                JOIN users u
                  ON u.id=
                     i.entered_by
                WHERE
                  i.entered_by=?
                  OR u.department_id='D4'
                ORDER BY
                  i.date DESC,
                  i.id DESC
              `,
              req.user.id)
            : [];

      const expenses =
        isD1 ||
        isD3
          ? rows(`
              SELECT
                e.*,
                m.code
                  AS motorcycle_code,
                u.name
                  AS entered_name,
                u.department_id
                  AS entered_department
              FROM expenses e
              LEFT JOIN motorcycles m
                ON m.id=
                   e.motorcycle_id
              JOIN users u
                ON u.id=
                   e.entered_by
              ORDER BY
                e.date DESC,
                e.id DESC
            `)
          : isD4
            ? rows(`
                SELECT
                  e.*,
                  m.code
                    AS motorcycle_code,
                  u.name
                    AS entered_name,
                  u.department_id
                    AS entered_department
                FROM expenses e
                LEFT JOIN motorcycles m
                  ON m.id=
                     e.motorcycle_id
                JOIN users u
                  ON u.id=
                     e.entered_by
                WHERE
                  e.entered_by=?
                  OR u.department_id='D4'
                ORDER BY
                  e.date DESC,
                  e.id DESC
              `,
              req.user.id)
            : [];

      const maintenance =
        isD1 ||
        isD3 ||
        isD4
          ? rows(`
              SELECT
                m.*,
                x.code
                  AS motorcycle_code
              FROM maintenance m
              JOIN motorcycles x
                ON x.id=
                   m.motorcycle_id
              ORDER BY
                m.date DESC,
                m.id DESC
            `)
          : [];

      const audit =
        isD1
          ? rows(`
              SELECT
                a.*,
                u.name
                  AS user_name,
                u.department_id
                  AS user_department
              FROM audit a
              LEFT JOIN users u
                ON u.id=a.who_user
              ORDER BY
                a.id DESC
              LIMIT 1000
            `)
          : rows(`
              SELECT
                a.*,
                u.name
                  AS user_name,
                u.department_id
                  AS user_department
              FROM audit a
              LEFT JOIN users u
                ON u.id=a.who_user
              WHERE
                a.who_user=?
                OR u.department_id=?
              ORDER BY
                a.id DESC
              LIMIT 500
            `,
            req.user.id,
            dept
          );

      const changes =
        isD1 ||
        isD3 ||
        isD4
          ? rows(`
              SELECT
                f.*,
                u.name
                  AS requested_name,
                u.department_id
                  AS requested_department
              FROM finance_changes f
              JOIN users u
                ON u.id=
                   f.requested_by
              WHERE
                f.status=
                  'Pending Approval'
                AND (
                  ?='D1'
                  OR u.department_id=?
                  OR f.requested_by=?
                )
              ORDER BY
                f.id DESC
            `,
            dept,
            dept,
            req.user.id)
          : [];

      /*
       * Always return all expected arrays.
       * This prevents frontend "Load failed"
       * errors caused by missing properties.
       */
      res.json({
        departments:
          rows(
            'SELECT * FROM departments'
          ),

        users:
          users || [],

        motorcycles:
          motorcycles || [],

        tasks:
          tasks || [],

        reports:
          reports || [],

        income:
          income || [],

        expenses:
          expenses || [],

        maintenance:
          maintenance || [],

        audit:
          audit || [],

        changes:
          changes || [],

        activities: [],

        goals: [],

        assignments: [],

        odometer: [],

        dailyClosings: [],

        evidence: []
      });
    } catch (error) {
      console.error(
        'BOOTSTRAP ERROR:',
        error
      );

      return res.status(500).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to load dashboard data.'
            : `Bootstrap failed: ${error.message}`
      });
    }
  }
);

/* =========================================================
   MOTORCYCLES
========================================================= */

app.post(
  '/api/motorcycles',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can register motorcycles.'
      });
    }

    const code =
      String(
        req.body.code || ''
      ).trim();

    const plate =
      String(
        req.body.plate || ''
      ).trim();

    const model =
      String(
        req.body.model || ''
      ).trim();

    const purchaseDate =
      req.body.purchase_date
        ? String(
            req.body.purchase_date
          )
        : null;

    const purchasePrice =
      Number(
        req.body.purchase_price ||
          0
      );

    const status =
      String(
        req.body.status ||
          'Active'
      );

    const allowedStatuses = [
      'Active',
      'Inactive',
      'Under Maintenance',
      'Sold / Retired'
    ];

    if (!code) {
      return res.status(400).json({
        error:
          'Motorcycle code is required.'
      });
    }

    if (
      !Number.isFinite(
        purchasePrice
      ) ||
      purchasePrice < 0
    ) {
      return res.status(400).json({
        error:
          'Purchase price must be a valid non-negative number.'
      });
    }

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid motorcycle status.'
      });
    }

    try {
      const result =
        db.prepare(`
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
          code,
          plate,
          model,
          purchaseDate,
          purchasePrice,
          status
        );

      const motorcycle =
        one(
          `
          SELECT *
          FROM motorcycles
          WHERE id=?
          `,
          result.lastInsertRowid
        );

      log(
        req,
        'CREATE',
        'Motorcycle',
        result.lastInsertRowid,
        null,
        motorcycle
      );

      return res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid,
        motorcycle
      });
    } catch (error) {
      console.error(
        'MOTORCYCLE CREATE ERROR:',
        error
      );

      if (
        String(
          error.message || ''
        ).includes(
          'UNIQUE constraint failed'
        )
      ) {
        return res.status(409).json({
          error:
            'A motorcycle with this code already exists.'
        });
      }

      return res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to register motorcycle.'
            : error.message
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
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can change motorcycle status.'
      });
    }

    const motorcycle =
      motorcycleExists(
        req.params.id
      );

    if (!motorcycle) {
      return res.status(404).json({
        error:
          'Motorcycle not found.'
      });
    }

    const allowed = [
      'Active',
      'Inactive',
      'Under Maintenance',
      'Sold / Retired'
    ];

    if (
      !allowed.includes(
        req.body.status
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid status.'
      });
    }

    const changed = {
      ...motorcycle,
      status:
        req.body.status
    };

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
      changed,
      req.body.reason || ''
    );

    res.json({
      ok: true,
      motorcycle:
        changed
    });
  }
);

/* =========================================================
   INCOME
========================================================= */

app.post(
  '/api/income',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can enter daily motorcycle income.'
      });
    }

    const date =
      String(
        req.body.date || ''
      ).trim();

    const motorcycleId =
      Number(
        req.body.motorcycle_id
      );

    const amount =
      Number(
        req.body.amount
      );

    const collectionNote =
      String(
        req.body.collection_note ||
          ''
      );

    if (
      !date ||
      !Number.isInteger(
        motorcycleId
      ) ||
      !Number.isFinite(
        amount
      ) ||
      amount < 0
    ) {
      return res.status(400).json({
        error:
          'Date, motorcycle and valid amount are required.'
      });
    }

    const motorcycle =
      motorcycleExists(
        motorcycleId
      );

    if (!motorcycle) {
      return res.status(400).json({
        error:
          'Motorcycle not found.'
      });
    }

    try {
      const result =
        db.prepare(`
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
          motorcycleId,
          amount,
          collectionNote,
          req.user.id
        );

      log(
        req,
        'CREATE',
        'Fleet Income',
        result.lastInsertRowid,
        null,
        {
          date,
          motorcycle_id:
            motorcycleId,
          amount,
          collection_note:
            collectionNote
        }
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'INCOME ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save income.'
            : error.message
      });
    }
  }
);

/* =========================================================
   INCOME VERIFICATION
========================================================= */

app.post(
  '/api/income/:id/verify',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D3']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D3 Finance or D1 can verify income.'
      });
    }

    const income =
      one(
        'SELECT * FROM income WHERE id=?',
        req.params.id
      );

    if (!income) {
      return res.status(404).json({
        error:
          'Income record not found.'
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

    res.json({
      ok: true
    });
  }
);

/* =========================================================
   EXPENSES
========================================================= */

app.post(
  '/api/expenses',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D3', 'D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D3 Finance, D4 Operations or D1 can enter expenses.'
      });
    }

    const date =
      String(
        req.body.date || ''
      ).trim();

    const expenseType =
      String(
        req.body.expense_type ||
          ''
      ).trim();

    const amount =
      Number(
        req.body.amount
      );

    const description =
      String(
        req.body.description ||
          ''
      );

    const motorcycleId =
      req.body.motorcycle_id
        ? Number(
            req.body.motorcycle_id
          )
        : null;

    if (
      !date ||
      !expenseType ||
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return res.status(400).json({
        error:
          'Valid expense data is required.'
      });
    }

    if (
      motorcycleId !== null &&
      !Number.isInteger(
        motorcycleId
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid motorcycle.'
      });
    }

    if (
      motorcycleId !== null &&
      !motorcycleExists(
        motorcycleId
      )
    ) {
      return res.status(400).json({
        error:
          'Motorcycle not found.'
      });
    }

    try {
      const result =
        db.prepare(`
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
          motorcycleId,
          expenseType,
          amount,
          description,
          req.user.id
        );

      log(
        req,
        'CREATE',
        'Expense',
        result.lastInsertRowid,
        null,
        {
          date,
          motorcycle_id:
            motorcycleId,
          expense_type:
            expenseType,
          amount,
          description
        }
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'EXPENSE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save expense.'
            : error.message
      });
    }
  }
);

/* =========================================================
   TASKS - CREATE
========================================================= */

app.post(
  '/api/tasks',
  auth,
  (req, res) => {
    const name =
      String(
        req.body.name || ''
      ).trim();

    const responsibleUser =
      Number(
        req.body.responsible_user
      );

    const startDate =
      req.body.start_date
        ? String(
            req.body.start_date
          )
        : null;

    const deadline =
      req.body.deadline
        ? String(
            req.body.deadline
          )
        : null;

    const priority =
      String(
        req.body.priority ||
          'Normal'
      );

    const description =
      String(
        req.body.description ||
          ''
      );

    if (
      !name ||
      !Number.isInteger(
        responsibleUser
      )
    ) {
      return res.status(400).json({
        error:
          'Task name and a valid responsible person are required.'
      });
    }

    const responsible =
      userExists(
        responsibleUser
      );

    if (
      !responsible ||
      !responsible.active
    ) {
      return res.status(400).json({
        error:
          'Responsible user was not found or is inactive.'
      });
    }

    /*
     * D1 can assign across departments.
     * D2-D5 can assign only within
     * their own department.
     */
    if (
      !d1(req) &&
      responsible.department_id !==
        req.user.department_id
    ) {
      return res.status(403).json({
        error:
          'You can assign tasks only within your department.'
      });
    }

    const allowedPriorities = [
      'Low',
      'Normal',
      'High',
      'Urgent'
    ];

    const finalPriority =
      allowedPriorities.includes(
        priority
      )
        ? priority
        : 'Normal';

    try {
      const result =
        db.prepare(`
          INSERT INTO tasks
          (
            name,
            responsible_user,
            start_date,
            deadline,
            priority,
            description,
            status,
            created_by,
            rejection_reason
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          name,
          responsibleUser,
          startDate,
          deadline,
          finalPriority,
          description,
          'Not Started',
          req.user.id,
          null
        );

      const task =
        one(
          `
          SELECT
            t.*,
            u.name
              AS responsible_name,
            u.department_id
              AS responsible_department
          FROM tasks t
          JOIN users u
            ON u.id=
               t.responsible_user
          WHERE t.id=?
          `,
          result.lastInsertRowid
        );

      log(
        req,
        'CREATE',
        'Task',
        result.lastInsertRowid,
        null,
        task
      );

      return res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid,
        task
      });
    } catch (error) {
      console.error(
        'TASK CREATE ERROR:',
        error
      );

      return res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to create task.'
            : error.message
      });
    }
  }
);

/* =========================================================
   TASKS - UPDATE / WORKFLOW
========================================================= */

app.patch(
  '/api/tasks/:id',
  auth,
  (req, res) => {
    const task =
      one(
        'SELECT * FROM tasks WHERE id=?',
        req.params.id
      );

    if (!task) {
      return res.status(404).json({
        error:
          'Task not found.'
      });
    }

    const responsible =
      userExists(
        task.responsible_user
      );

    const isD1 =
      d1(req);

    const isResponsible =
      Number(
        task.responsible_user
      ) ===
      Number(req.user.id);

    const isCreator =
      Number(
        task.created_by
      ) ===
      Number(req.user.id);

    /*
     * IMPORTANT SECURITY RULE:
     * Being in the same department does NOT
     * automatically give permission to modify
     * another person's task.
     */
    if (
      !isD1 &&
      !isResponsible &&
      !isCreator
    ) {
      return res.status(403).json({
        error:
          'You are not permitted to update this task.'
      });
    }

    const status =
      String(
        req.body.status ||
          task.status
      );

    const reason =
      String(
        req.body.reason ||
          ''
      ).trim();

    const allowedStatuses = [
      'Not Started',
      'Accepted',
      'Rejected',
      'In Progress',
      'Completed',
      'Cancelled',
      'On Hold'
    ];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid task status.'
      });
    }

    /*
     * No change requested.
     */
    if (
      status === task.status &&
      !reason
    ) {
      return res.json({
        ok: true,
        task
      });
    }

    /*
     * D1 has full control.
     * However, rejection still requires
     * a reason and normal workflow rules
     * are kept where possible.
     */
    if (status === 'Rejected') {
      if (!reason) {
        return res.status(400).json({
          error:
            'A rejection reason is required.'
        });
      }

      if (
        !isD1 &&
        !isResponsible
      ) {
        return res.status(403).json({
          error:
            'Only the responsible person or D1 can reject this task.'
        });
      }

      if (
        task.status !==
        'Not Started' &&
        !isD1
      ) {
        return res.status(400).json({
          error:
            'A task can only be rejected while it is Not Started.'
        });
      }
    }

    /*
     * Accept:
     * Only responsible user or D1.
     * Normal user can accept only from
     * Not Started.
     */
    if (status === 'Accepted') {
      if (
        !isD1 &&
        !isResponsible
      ) {
        return res.status(403).json({
          error:
            'Only the responsible person or D1 can accept this task.'
        });
      }

      if (
        !isD1 &&
        task.status !==
          'Not Started'
      ) {
        return res.status(400).json({
          error:
            'A task can only be accepted while it is Not Started.'
        });
      }
    }

    /*
     * Start:
     * Responsible user or D1.
     */
    if (
      status ===
      'In Progress'
    ) {
      if (
        !isD1 &&
        !isResponsible
      ) {
        return res.status(403).json({
          error:
            'Only the responsible person or D1 can start this task.'
        });
      }

      if (
        !isD1 &&
        task.status !==
          'Accepted'
      ) {
        return res.status(400).json({
          error:
            'Accept the task before starting work.'
        });
      }
    }

    /*
     * Complete:
     * Responsible user or D1.
     */
    if (
      status ===
      'Completed'
    ) {
      if (
        !isD1 &&
        !isResponsible
      ) {
        return res.status(403).json({
          error:
            'Only the responsible person or D1 can complete this task.'
        });
      }

      if (
        !isD1 &&
        task.status !==
          'In Progress'
      ) {
        return res.status(400).json({
          error:
            'The task must be In Progress before it can be completed.'
        });
      }
    }

    /*
     * Cancel:
     * D1 has authority.
     * Creator may cancel a task they created
     * before it is completed.
     */
    if (
      status ===
      'Cancelled'
    ) {
      if (
        !isD1 &&
        !isCreator
      ) {
        return res.status(403).json({
          error:
            'Only D1 or the task creator can cancel this task.'
        });
      }
    }

    /*
     * On Hold:
     * D1 or responsible user.
     */
    if (
      status ===
      'On Hold'
    ) {
      if (
        !isD1 &&
        !isResponsible
      ) {
        return res.status(403).json({
          error:
            'Only D1 or the responsible person can put this task On Hold.'
        });
      }
    }

    /*
     * Not Started should normally be
     * restored only by D1.
     */
    if (
      status ===
      'Not Started' &&
      !isD1
    ) {
      return res.status(403).json({
        error:
          'Only D1 can reset a task to Not Started.'
      });
    }

    /*
     * Prevent meaningless reversal by normal users.
     */
    if (
      !isD1 &&
      task.status ===
        'Completed' &&
      status !==
        'Completed'
    ) {
      return res.status(400).json({
        error:
          'A completed task cannot be changed by the responsible user.'
      });
    }

    const changed = {
      ...task,
      status,
      rejection_reason:
        status === 'Rejected'
          ? reason
          : status !==
            'Rejected'
            ? null
            : task.rejection_reason
    };

    try {
      db.prepare(`
        UPDATE tasks
        SET
          status=?,
          rejection_reason=?
        WHERE id=?
      `).run(
        status,
        changed.rejection_reason,
        task.id
      );

      log(
        req,
        'CHANGE',
        'Task',
        task.id,
        task,
        changed,
        reason
      );

      const updated =
        one(
          `
          SELECT
            t.*,
            u.name
              AS responsible_name,
            u.department_id
              AS responsible_department
          FROM tasks t
          JOIN users u
            ON u.id=
               t.responsible_user
          WHERE t.id=?
          `,
          task.id
        );

      res.json({
        ok: true,
        task:
          updated
      });
    } catch (error) {
      console.error(
        'TASK UPDATE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to update task.'
            : error.message
      });
    }
  }
);

/* =========================================================
   REPORTS
========================================================= */

app.post(
  '/api/reports',
  auth,
  (req, res) => {
    const type =
      String(
        req.body.type || ''
      ).trim();

    const body =
      String(
        req.body.body || ''
      ).trim();

    const date =
      String(
        req.body.date ||
          new Date()
            .toISOString()
            .slice(0, 10)
      );

    if (
      !type ||
      !body
    ) {
      return res.status(400).json({
        error:
          'Report type and body are required.'
      });
    }

    try {
      const result =
        db.prepare(`
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
          date
        );

      log(
        req,
        'CREATE',
        'Report',
        result.lastInsertRowid,
        null,
        {
          type,
          body,
          date
        }
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'REPORT ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save report.'
            : error.message
      });
    }
  }
);

/* =========================================================
   ACTIVITIES
========================================================= */

app.post(
  '/api/activities',
  auth,
  (req, res) => {
    try {
      const date =
        req.body.date ||
        new Date()
          .toISOString()
          .slice(0, 10);

      const timeSpent =
        Number(
          req.body.time_spent ||
            0
        );

      if (
        !Number.isFinite(
          timeSpent
        ) ||
        timeSpent < 0
      ) {
        return res.status(400).json({
          error:
            'Invalid time spent.'
        });
      }

      const result =
        db.prepare(`
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
          date,
          req.body.done || '',
          req.body.unfinished ||
            '',
          req.body.reason ||
            '',
          timeSpent
        );

      log(
        req,
        'CREATE',
        'Daily Activity',
        result.lastInsertRowid,
        null,
        req.body
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'ACTIVITY ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save activity.'
            : error.message
      });
    }
  }
);

app.get(
  '/api/activities',
  auth,
  (req, res) => {
    try {
      const data =
        rows(
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
              WHERE
                u.department_id=?
                OR a.user_id=?
              ORDER BY a.id DESC
            `,
          ...(d1(req)
            ? []
            : [
                req.user
                  .department_id,
                req.user.id
              ])
        );

      res.json(
        data || []
      );
    } catch (error) {
      console.error(
        'ACTIVITIES LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load activities.'
      });
    }
  }
);

/* =========================================================
   GOALS
========================================================= */

app.get(
  '/api/goals',
  auth,
  (req, res) => {
    try {
      res.json(
        rows(
          d1(req)
            ? `
              SELECT
                g.*,
                u.name
                  AS creator_name
              FROM goals g
              JOIN users u
                ON u.id=
                   g.created_by
              ORDER BY g.id DESC
            `
            : `
              SELECT
                g.*,
                u.name
                  AS creator_name
              FROM goals g
              JOIN users u
                ON u.id=
                   g.created_by
              WHERE
                g.department_id=?
                OR g.department_id IS NULL
                OR g.created_by=?
              ORDER BY g.id DESC
            `,
          ...(d1(req)
            ? []
            : [
                req.user
                  .department_id,
                req.user.id
              ])
        )
      );
    } catch (error) {
      console.error(
        'GOALS LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load goals.'
      });
    }
  }
);

app.post(
  '/api/goals',
  auth,
  (req, res) => {
    const {
      title,
      scope =
        'Department',
      department_id,
      target = 100,
      achieved = 0,
      period = ''
    } = req.body;

    if (
      !String(
        title || ''
      ).trim()
    ) {
      return res.status(400).json({
        error:
          'Title required.'
      });
    }

    const dept =
      department_id ||
      req.user.department_id;

    if (
      !d1(req) &&
      dept !==
        req.user.department_id
    ) {
      return res.status(403).json({
        error:
          'You can create goals only for your department.'
      });
    }

    if (
      !one(
        'SELECT id FROM departments WHERE id=?',
        dept
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid department.'
      });
    }

    const targetNumber =
      Number(target);

    const achievedNumber =
      Number(achieved);

    if (
      !Number.isFinite(
        targetNumber
      ) ||
      targetNumber < 0 ||
      !Number.isFinite(
        achievedNumber
      ) ||
      achievedNumber < 0
    ) {
      return res.status(400).json({
        error:
          'Invalid goal numbers.'
      });
    }

    try {
      const result =
        db.prepare(`
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
          String(title).trim(),
          scope,
          dept,
          targetNumber,
          achievedNumber,
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

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'GOAL CREATE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save goal.'
            : error.message
      });
    }
  }
);

app.patch(
  '/api/goals/:id',
  auth,
  (req, res) => {
    const goal =
      one(
        'SELECT * FROM goals WHERE id=?',
        req.params.id
      );

    if (!goal) {
      return res.status(404).json({
        error:
          'Goal not found.'
      });
    }

    if (
      !d1(req) &&
      goal.department_id !==
        req.user.department_id
    ) {
      return res.status(403).json({
        error:
          'Not permitted.'
      });
    }

    const next = {
      ...goal,

      achieved:
        req.body.achieved ===
        undefined
          ? goal.achieved
          : Number(
              req.body.achieved
            ),

      title:
        req.body.title ??
        goal.title,

      target:
        req.body.target ===
        undefined
          ? goal.target
          : Number(
              req.body.target
            )
    };

    if (
      !Number.isFinite(
        Number(next.target)
      ) ||
      Number(next.target) <
        0 ||
      !Number.isFinite(
        Number(next.achieved)
      ) ||
      Number(next.achieved) <
        0
    ) {
      return res.status(400).json({
        error:
          'Invalid goal values.'
      });
    }

    try {
      db.prepare(`
        UPDATE goals
        SET
          title=?,
          target=?,
          achieved=?
        WHERE id=?
      `).run(
        next.title,
        Number(next.target),
        Number(next.achieved),
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

      res.json({
        ok: true,
        goal:
          next
      });
    } catch (error) {
      console.error(
        'GOAL UPDATE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to update goal.'
            : error.message
      });
    }
  }
);

/* =========================================================
   ASSIGNMENTS
========================================================= */

app.get(
  '/api/assignments',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.json([]);
    }

    try {
      res.json(
        rows(`
          SELECT
            a.*,
            m.code
              AS motorcycle_code
          FROM assignments a
          JOIN motorcycles m
            ON m.id=
               a.motorcycle_id
          ORDER BY a.id DESC
        `)
      );
    } catch (error) {
      console.error(
        'ASSIGNMENTS LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load assignments.'
      });
    }
  }
);

app.post(
  '/api/assignments',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can manage rider assignments.'
      });
    }

    const motorcycleId =
      Number(
        req.body.motorcycle_id
      );

    const riderName =
      String(
        req.body.rider_name || ''
      ).trim();

    const startDate =
      String(
        req.body.start_date || ''
      ).trim();

    const endDate =
      req.body.end_date
        ? String(
            req.body.end_date
          )
        : null;

    const notes =
      String(
        req.body.notes || ''
      );

    if (
      !Number.isInteger(
        motorcycleId
      ) ||
      !riderName ||
      !startDate
    ) {
      return res.status(400).json({
        error:
          'Motorcycle, rider and start date are required.'
      });
    }

    if (
      !motorcycleExists(
        motorcycleId
      )
    ) {
      return res.status(400).json({
        error:
          'Motorcycle not found.'
      });
    }

    try {
      const transaction =
        db.transaction(() => {
          db.prepare(`
            UPDATE assignments
            SET end_date=?
            WHERE motorcycle_id=?
              AND end_date IS NULL
          `).run(
            startDate,
            motorcycleId
          );

          const result =
            db.prepare(`
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
              motorcycleId,
              riderName,
              startDate,
              endDate,
              notes
            );

          return result;
        });

      const result =
        transaction();

      log(
        req,
        'CREATE',
        'Rider Assignment',
        result.lastInsertRowid,
        null,
        req.body
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'ASSIGNMENT ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save assignment.'
            : error.message
      });
    }
  }
);

/* =========================================================
   ODOMETER
========================================================= */

app.post(
  '/api/odometer',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can enter odometer records.'
      });
    }

    const motorcycleId =
      Number(
        req.body.motorcycle_id
      );

    const date =
      String(
        req.body.date || ''
      ).trim();

    const mileage =
      Number(
        req.body.mileage
      );

    if (
      !Number.isInteger(
        motorcycleId
      ) ||
      !date ||
      !Number.isFinite(
        mileage
      ) ||
      mileage < 0
    ) {
      return res.status(400).json({
        error:
          'Invalid odometer data.'
      });
    }

    if (
      !motorcycleExists(
        motorcycleId
      )
    ) {
      return res.status(400).json({
        error:
          'Motorcycle not found.'
      });
    }

    const prev =
      one(
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
      prev &&
      mileage <
        Number(prev.mileage)
    ) {
      return res.status(400).json({
        error:
          'Mileage cannot go backwards.'
      });
    }

    try {
      const result =
        db.prepare(`
          INSERT INTO odometer
          (
            motorcycle_id,
            date,
            mileage,
            entered_by
          )
          VALUES (?, ?, ?, ?)
        `).run(
          motorcycleId,
          date,
          mileage,
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

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'ODOMETER ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save odometer.'
            : error.message
      });
    }
  }
);

app.get(
  '/api/odometer',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.json([]);
    }

    try {
      res.json(
        rows(`
          SELECT
            o.*,
            m.code
              AS motorcycle_code,
            u.name
              AS entered_name
          FROM odometer o
          JOIN motorcycles m
            ON m.id=
               o.motorcycle_id
          JOIN users u
            ON u.id=
               o.entered_by
          ORDER BY
            o.date DESC,
            o.id DESC
        `)
      );
    } catch (error) {
      console.error(
        'ODOMETER LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load odometer records.'
      });
    }
  }
);

/* =========================================================
   MAINTENANCE
========================================================= */

app.post(
  '/api/maintenance',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can manage maintenance.'
      });
    }

    const motorcycleId =
      Number(
        req.body.motorcycle_id
      );

    const issue =
      String(
        req.body.issue || ''
      ).trim();

    const date =
      String(
        req.body.date || ''
      ).trim();

    const mileage =
      req.body.mileage ===
        undefined ||
      req.body.mileage ===
        ''
        ? null
        : Number(
            req.body.mileage
          );

    const parts =
      String(
        req.body.parts || ''
      );

    const cost =
      Number(
        req.body.cost || 0
      );

    const garage =
      String(
        req.body.garage || ''
      );

    const nextService =
      req.body.next_service
        ? String(
            req.body.next_service
          )
        : null;

    const downtime =
      Number(
        req.body.downtime || 0
      );

    const status =
      String(
        req.body.status ||
          'Completed'
      );

    const allowedStatuses = [
      'In Progress',
      'Completed',
      'Cancelled'
    ];

    if (
      !Number.isInteger(
        motorcycleId
      ) ||
      !issue ||
      !date
    ) {
      return res.status(400).json({
        error:
          'Motorcycle, issue and date are required.'
      });
    }

    if (
      !motorcycleExists(
        motorcycleId
      )
    ) {
      return res.status(400).json({
        error:
          'Motorcycle not found.'
      });
    }

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid maintenance status.'
      });
    }

    if (
      !Number.isFinite(
        cost
      ) ||
      cost < 0
    ) {
      return res.status(400).json({
        error:
          'Invalid maintenance cost.'
      });
    }

    try {
      const transaction =
        db.transaction(() => {
          const result =
            db.prepare(`
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

          if (
            status ===
            'In Progress'
          ) {
            db.prepare(`
              UPDATE motorcycles
              SET status='Under Maintenance'
              WHERE id=?
            `).run(
              motorcycleId
            );
          }

          if (
            status ===
              'Completed' ||
            status ===
              'Cancelled'
          ) {
            const open =
              one(`
                SELECT id
                FROM maintenance
                WHERE motorcycle_id=?
                  AND status='In Progress'
                ORDER BY
                  date DESC,
                  id DESC
                LIMIT 1
              `,
              motorcycleId);

            if (!open) {
              db.prepare(`
                UPDATE motorcycles
                SET status='Active'
                WHERE id=?
                  AND status='Under Maintenance'
              `).run(
                motorcycleId
              );
            }
          }

          return result;
        });

      const result =
        transaction();

      log(
        req,
        'CREATE',
        'Maintenance',
        result.lastInsertRowid,
        null,
        req.body
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'MAINTENANCE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to save maintenance record.'
            : error.message
      });
    }
  }
);

app.get(
  '/api/maintenance',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.json([]);
    }

    try {
      res.json(
        rows(`
          SELECT
            m.*,
            x.code
              AS motorcycle_code
          FROM maintenance m
          JOIN motorcycles x
            ON x.id=
               m.motorcycle_id
          ORDER BY
            m.date DESC,
            m.id DESC
        `)
      );
    } catch (error) {
      console.error(
        'MAINTENANCE LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load maintenance records.'
      });
    }
  }
);

/* =========================================================
   FLEET DETAIL
========================================================= */

app.get(
  '/api/fleet-detail/:id',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D3', 'D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Fleet details are restricted to D3, D4 and D1.'
      });
    }

    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(id)
    ) {
      return res.status(400).json({
        error:
          'Invalid motorcycle.'
      });
    }

    const motorcycle =
      motorcycleExists(id);

    if (!motorcycle) {
      return res.status(404).json({
        error:
          'Motorcycle not found.'
      });
    }

    try {
      res.json({
        motorcycle,

        income:
          rows(`
            SELECT
              i.*,
              u.name
                AS entered_name
            FROM income i
            JOIN users u
              ON u.id=
                 i.entered_by
            WHERE
              i.motorcycle_id=?
            ORDER BY
              i.date DESC,
              i.id DESC
          `, id),

        expenses:
          rows(`
            SELECT
              e.*,
              u.name
                AS entered_name
            FROM expenses e
            JOIN users u
              ON u.id=
                 e.entered_by
            WHERE
              e.motorcycle_id=?
            ORDER BY
              e.date DESC,
              e.id DESC
          `, id),

        maintenance:
          rows(`
            SELECT *
            FROM maintenance
            WHERE motorcycle_id=?
            ORDER BY
              date DESC,
              id DESC
          `, id),

        odometer:
          rows(`
            SELECT
              o.*,
              u.name
                AS entered_name
            FROM odometer o
            JOIN users u
              ON u.id=
                 o.entered_by
            WHERE
              o.motorcycle_id=?
            ORDER BY
              date DESC,
              id DESC
          `, id),

        assignments:
          rows(`
            SELECT *
            FROM assignments
            WHERE motorcycle_id=?
            ORDER BY
              start_date DESC,
              id DESC
          `, id)
      });
    } catch (error) {
      console.error(
        'FLEET DETAIL ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load fleet details.'
      });
    }
  }
);

/* =========================================================
   DAILY CLOSING
========================================================= */

app.post(
  '/api/daily-closing',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Only D4 Operations or D1 can close daily operations.'
      });
    }

    const date =
      String(
        req.body.date ||
          new Date()
            .toISOString()
            .slice(0, 10)
      );

    const income =
      one(`
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total
        FROM income
        WHERE date=?
      `,
      date).total;

    const expenses =
      one(`
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total
        FROM expenses
        WHERE date=?
          AND motorcycle_id
            IS NOT NULL
      `,
      date).total;

    const net =
      Number(income) -
      Number(expenses);

    try {
      const result =
        db.prepare(`
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
          notes:
            req.body.notes || ''
        }
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid,
        income,
        expenses,
        net
      });
    } catch (error) {
      res.status(400).json({
        error:
          'Closing already exists for this date.'
      });
    }
  }
);

app.get(
  '/api/daily-closings',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D3', 'D4']
      )
    ) {
      return res.json([]);
    }

    try {
      res.json(
        rows(`
          SELECT
            c.*,
            u.name
              AS closed_by_name
          FROM daily_closings c
          JOIN users u
            ON u.id=
               c.closed_by
          ORDER BY
            c.date DESC,
            c.id DESC
        `)
      );
    } catch (error) {
      console.error(
        'CLOSINGS LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load daily closings.'
      });
    }
  }
);

/* =========================================================
   EVIDENCE UPLOAD
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
            error:
              error.message
          });
        }

        if (!req.file) {
          return res.status(400).json({
            error:
              'File required.'
          });
        }

        const taskId =
          req.body.task_id
            ? Number(
                req.body.task_id
              )
            : null;

        const reportId =
          req.body.report_id
            ? Number(
                req.body.report_id
              )
            : null;

        let task = null;
        let report = null;

        if (
          taskId !== null
        ) {
          task =
            one(
              'SELECT * FROM tasks WHERE id=?',
              taskId
            );

          if (!task) {
            try {
              fs.unlinkSync(
                req.file.path
              );
            } catch (_) {}

            return res.status(400).json({
              error:
                'Linked task not found.'
            });
          }
        }

        if (
          reportId !== null
        ) {
          report =
            one(
              'SELECT * FROM reports WHERE id=?',
              reportId
            );

          if (!report) {
            try {
              fs.unlinkSync(
                req.file.path
              );
            } catch (_) {}

            return res.status(400).json({
              error:
                'Linked report not found.'
            });
          }
        }

        /*
         * Authorization for linked records.
         */
        if (
          task &&
          !d1(req) &&
          Number(
            task.responsible_user
          ) !==
            Number(req.user.id) &&
          Number(
            task.created_by
          ) !==
            Number(req.user.id)
        ) {
          try {
            fs.unlinkSync(
              req.file.path
            );
          } catch (_) {}

          return res.status(403).json({
            error:
              'You are not permitted to attach evidence to this task.'
          });
        }

        if (
          report &&
          !d1(req) &&
          Number(
            report.user_id
          ) !==
            Number(req.user.id)
        ) {
          try {
            fs.unlinkSync(
              req.file.path
            );
          } catch (_) {}

          return res.status(403).json({
            error:
              'You are not permitted to attach evidence to this report.'
          });
        }

        try {
          const result =
            db.prepare(`
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
              taskId,
              reportId
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
                taskId,
              report_id:
                reportId
            }
          );

          res.status(201).json({
            ok: true,
            id:
              result.lastInsertRowid,
            url:
              '/api/evidence/' +
              result.lastInsertRowid +
              '/file'
          });
        } catch (dbError) {
          try {
            fs.unlinkSync(
              req.file.path
            );
          } catch (_) {}

          console.error(
            'EVIDENCE ERROR:',
            dbError
          );

          res.status(400).json({
            error:
              NODE_ENV ===
              'production'
                ? 'Unable to save evidence.'
                : dbError.message
          });
        }
      }
    );
  }
);

/* =========================================================
   EVIDENCE LIST
========================================================= */

app.get(
  '/api/evidence',
  auth,
  (req, res) => {
    try {
      const data =
        rows(
          d1(req)
            ? `
              SELECT
                e.*,
                u.name
                  AS uploaded_name,
                u.department_id
                  AS uploaded_department
              FROM evidence e
              JOIN users u
                ON u.id=
                   e.uploaded_by
              ORDER BY
                e.id DESC
            `
            : `
              SELECT
                e.*,
                u.name
                  AS uploaded_name,
                u.department_id
                  AS uploaded_department
              FROM evidence e
              JOIN users u
                ON u.id=
                   e.uploaded_by
              WHERE
                u.department_id=?
                OR e.uploaded_by=?
                OR EXISTS (
                  SELECT 1
                  FROM tasks t
                  WHERE
                    t.id=e.task_id
                    AND (
                      t.responsible_user=?
                      OR t.created_by=?
                    )
                )
                OR EXISTS (
                  SELECT 1
                  FROM reports r
                  WHERE
                    r.id=e.report_id
                    AND r.user_id=?
                )
              ORDER BY
                e.id DESC
            `,
          ...(d1(req)
            ? []
            : [
                req.user
                  .department_id,
                req.user.id,
                req.user.id,
                req.user.id,
                req.user.id
              ])
        );

      res.json(
        data || []
      );
    } catch (error) {
      console.error(
        'EVIDENCE LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load evidence.'
      });
    }
  }
);

/* =========================================================
   SECURE EVIDENCE FILE ACCESS
========================================================= */

app.get(
  '/api/evidence/:id/file',
  auth,
  (req, res) => {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(id)
    ) {
      return res.status(400).json({
        error:
          'Invalid evidence.'
      });
    }

    const evidence =
      one(
        `
        SELECT
          e.*,
          t.responsible_user,
          t.created_by AS task_creator,
          r.user_id AS report_user,
          u.department_id
            AS uploader_department
        FROM evidence e
        LEFT JOIN tasks t
          ON t.id=e.task_id
        LEFT JOIN reports r
          ON r.id=e.report_id
        JOIN users u
          ON u.id=e.uploaded_by
        WHERE e.id=?
        `,
        id
      );

    if (!evidence) {
      return res.status(404).json({
        error:
          'Evidence not found.'
      });
    }

    const permitted =
      d1(req) ||
      Number(
        evidence.uploaded_by
      ) ===
        Number(req.user.id) ||
      evidence.uploader_department ===
        req.user.department_id ||
      Number(
        evidence.responsible_user
      ) ===
        Number(req.user.id) ||
      Number(
        evidence.task_creator
      ) ===
        Number(req.user.id) ||
      Number(
        evidence.report_user
      ) ===
        Number(req.user.id);

    if (!permitted) {
      return res.status(403).json({
        error:
          'You are not permitted to access this file.'
      });
    }

    const safeFilename =
      path.basename(
        evidence.filename
      );

    const filePath =
      path.join(
        UPLOAD_DIR,
        safeFilename
      );

    if (
      !fs.existsSync(
        filePath
      )
    ) {
      return res.status(404).json({
        error:
          'Evidence file is missing.'
      });
    }

    res.setHeader(
      'Content-Type',
      evidence.mime ||
        'application/octet-stream'
    );

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(
        evidence.original_name
      ).replace(
        /["\r\n]/g,
        ''
      )}"`
    );

    return res.sendFile(
      filePath
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
    const q =
      String(
        req.query.q || ''
      ).toLowerCase();

    try {
      const data =
        rows(
          d1(req)
            ? `
              SELECT
                a.*,
                u.name
                  AS user_name,
                u.department_id
                  AS user_department
              FROM audit a
              LEFT JOIN users u
                ON u.id=
                   a.who_user
              ORDER BY
                a.id DESC
            `
            : `
              SELECT
                a.*,
                u.name
                  AS user_name,
                u.department_id
                  AS user_department
              FROM audit a
              LEFT JOIN users u
                ON u.id=
                   a.who_user
              WHERE
                a.who_user=?
                OR u.department_id=?
              ORDER BY
                a.id DESC
            `,
          ...(d1(req)
            ? []
            : [
                req.user.id,
                req.user
                  .department_id
              ])
        );

      res.json(
        data.filter(
          (item) =>
            JSON.stringify(
              item
            )
              .toLowerCase()
              .includes(q)
        )
      );
    } catch (error) {
      console.error(
        'AUDIT LOAD ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load audit records.'
      });
    }
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
      !deptOnly(
        req,
        ['D3', 'D4']
      )
    ) {
      return res.status(403).json({
        error:
          'Finance changes are restricted to D3, D4 and D1.'
      });
    }

    const recordType =
      String(
        req.body.record_type ||
          ''
      ).trim();

    const recordId =
      Number(
        req.body.record_id
      );

    const reason =
      String(
        req.body.reason || ''
      ).trim();

    if (
      !recordType ||
      !Number.isInteger(
        recordId
      ) ||
      !reason
    ) {
      return res.status(400).json({
        error:
          'Record type, record ID and reason are mandatory.'
      });
    }

    try {
      const result =
        db.prepare(`
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
          recordType,
          recordId,
          JSON.stringify(
            req.body.original ||
              {}
          ),
          JSON.stringify(
            req.body.proposed ||
              {}
          ),
          reason,
          req.user.id
        );

      log(
        req,
        'PROPOSE_CHANGE',
        recordType,
        recordId,
        req.body.original ||
          {},
        req.body.proposed ||
          {},
        reason
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'FINANCE CHANGE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to create finance change.'
            : error.message
      });
    }
  }
);

app.post(
  '/api/finance-changes/:id/decision',
  auth,
  (req, res) => {
    if (!d1(req)) {
      return res.status(403).json({
        error:
          'Only D1 can approve or reject finance changes.'
      });
    }

    const change =
      one(
        'SELECT * FROM finance_changes WHERE id=?',
        req.params.id
      );

    if (
      !change ||
      change.status !==
        'Pending Approval'
    ) {
      return res.status(404).json({
        error:
          'Change not pending.'
      });
    }

    const decision =
      req.body.decision;

    if (
      ![
        'Approved',
        'Rejected'
      ].includes(
        decision
      )
    ) {
      return res.status(400).json({
        error:
          'Decision must be Approved or Rejected.'
      });
    }

    try {
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

      let original = {};
      let proposed = {};

      try {
        original =
          JSON.parse(
            change.original_json
          );
      } catch (_) {}

      try {
        proposed =
          JSON.parse(
            change.proposed_json
          );
      } catch (_) {}

      log(
        req,
        'FINANCE_DECISION',
        change.record_type,
        change.record_id,
        original,
        proposed,
        `${decision}: ${
          req.body.note || ''
        }`
      );

      res.json({
        ok: true,
        status:
          decision
      });
    } catch (error) {
      console.error(
        'FINANCE DECISION ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to process finance decision.'
            : error.message
      });
    }
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
          'Only D1 can manage accounts.'
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
          'Only D1 can create accounts.'
      });
    }

    const name =
      String(
        req.body.name || ''
      ).trim();

    const username =
      String(
        req.body.username || ''
      )
        .trim()
        .toLowerCase();

    const password =
      String(
        req.body.password || ''
      );

    const departmentId =
      String(
        req.body.department_id ||
          ''
      ).trim();

    if (
      !name ||
      !username ||
      !password ||
      !departmentId ||
      password.length < 10
    ) {
      return res.status(400).json({
        error:
          'Name, username, department and password (10+ chars) are required.'
      });
    }

    if (
      !one(
        'SELECT id FROM departments WHERE id=?',
        departmentId
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid department.'
      });
    }

    try {
      const result =
        db.prepare(`
          INSERT INTO users
          (
            name,
            username,
            password_hash,
            department_id
          )
          VALUES (?, ?, ?, ?)
        `).run(
          name,
          username,
          bcrypt.hashSync(
            password,
            12
          ),
          departmentId
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
          department_id:
            departmentId
        }
      );

      res.status(201).json({
        ok: true,
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'USER CREATE ERROR:',
        error
      );

      res.status(400).json({
        error:
          'Username already exists or invalid department.'
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
          'Only D1 can update accounts.'
      });
    }

    const user =
      one(
        'SELECT * FROM users WHERE id=?',
        req.params.id
      );

    if (!user) {
      return res.status(404).json({
        error:
          'User not found.'
      });
    }

    const departmentId =
      req.body.department_id ||
      user.department_id;

    const active =
      req.body.active ===
      undefined
        ? user.active
        : req.body.active
          ? 1
          : 0;

    const name =
      String(
        req.body.name ||
          user.name
      ).trim();

    if (
      !one(
        'SELECT id FROM departments WHERE id=?',
        departmentId
      )
    ) {
      return res.status(400).json({
        error:
          'Invalid department.'
      });
    }

    if (
      req.body.password &&
      String(
        req.body.password
      ).length < 10
    ) {
      return res.status(400).json({
        error:
          'New password must contain at least 10 characters.'
      });
    }

    /*
     * Prevent D1 from accidentally
     * disabling their own account.
     */
    if (
      Number(user.id) ===
        Number(req.user.id) &&
      active === 0
    ) {
      return res.status(400).json({
        error:
          'D1 cannot deactivate the currently logged-in account.'
      });
    }

    const changed = {
      name,
      department_id:
        departmentId,
      active
    };

    const newPassword =
      req.body.password
        ? bcrypt.hashSync(
            String(
              req.body.password
            ),
            12
          )
        : null;

    try {
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
        departmentId,
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

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'USER UPDATE ERROR:',
        error
      );

      res.status(400).json({
        error:
          NODE_ENV ===
          'production'
            ? 'Unable to update account.'
            : error.message
      });
    }
  }
);

/* =========================================================
   FLEET SUMMARY
========================================================= */

app.get(
  '/api/fleet-summary',
  auth,
  (req, res) => {
    if (
      !deptOnly(
        req,
        ['D3', 'D4']
      )
    ) {
      return res.json({
        totalMotorcycles:
          0,
        active: 0,
        inactive: 0,
        maintenance: 0,
        sold: 0,
        todayIncome: 0,
        todayExpenses: 0,
        todayNet: 0,
        totalIncome: 0,
        totalExpenses: 0,
        net: 0
      });
    }

    try {
      const income =
        one(`
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM income
        `).total;

      const expense =
        one(`
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM expenses
          WHERE motorcycle_id
            IS NOT NULL
        `).total;

      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      const todayIncome =
        one(`
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM income
          WHERE date=?
        `,
        today).total;

      const todayExpenses =
        one(`
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM expenses
          WHERE date=?
            AND motorcycle_id
              IS NOT NULL
        `,
        today).total;

      res.json({
        totalMotorcycles:
          one(`
            SELECT
              COUNT(*) AS n
            FROM motorcycles
          `).n,

        active:
          one(`
            SELECT
              COUNT(*) AS n
            FROM motorcycles
            WHERE status='Active'
          `).n,

        inactive:
          one(`
            SELECT
              COUNT(*) AS n
            FROM motorcycles
            WHERE status='Inactive'
          `).n,

        maintenance:
          one(`
            SELECT
              COUNT(*) AS n
            FROM motorcycles
            WHERE status='Under Maintenance'
          `).n,

        sold:
          one(`
            SELECT
              COUNT(*) AS n
            FROM motorcycles
            WHERE status='Sold / Retired'
          `).n,

        todayIncome,

        todayExpenses,

        todayNet:
          Number(
            todayIncome
          ) -
          Number(
            todayExpenses
          ),

        totalIncome:
          income,

        totalExpenses:
          expense,

        net:
          Number(income) -
          Number(expense)
      });
    } catch (error) {
      console.error(
        'FLEET SUMMARY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load fleet summary.'
      });
    }
  }
);

/* =========================================================
   ALERTS
========================================================= */

app.get(
  '/api/alerts',
  auth,
  (req, res) => {
    try {
      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      const output = [];

      if (
        deptOnly(
          req,
          ['D3', 'D4']
        )
      ) {
        rows(`
          SELECT *
          FROM motorcycles
          WHERE status=
            'Under Maintenance'
        `).forEach(
          (motorcycle) => {
            output.push({
              level:
                'danger',
              text:
                `${motorcycle.code} is under maintenance`
            });
          }
        );

        rows(`
          SELECT
            m.*,
            x.code
              AS motorcycle_code
          FROM maintenance m
          JOIN motorcycles x
            ON x.id=
               m.motorcycle_id
          WHERE
            m.next_service IS NOT NULL
        `).forEach(
          (maintenance) => {
            if (
              maintenance.next_service <=
              today
            ) {
              output.push({
                level:
                  'warning',
                text:
                  `${maintenance.motorcycle_code} maintenance service due/overdue`
              });
            }
          }
        );
      }

      const overdueTasks =
        d1(req)
          ? rows(`
              SELECT *
              FROM tasks
              WHERE
                status NOT IN
                  ('Completed', 'Cancelled')
                AND deadline IS NOT NULL
                AND deadline < ?
            `,
            today)
          : rows(`
              SELECT
                t.*
              FROM tasks t
              JOIN users u
                ON u.id=
                   t.responsible_user
              WHERE
                t.status NOT IN
                  ('Completed', 'Cancelled')
                AND t.deadline IS NOT NULL
                AND t.deadline < ?
                AND (
                  u.department_id=?
                  OR t.created_by=?
                  OR t.responsible_user=?
                )
            `,
            today,
            req.user
              .department_id,
            req.user.id,
            req.user.id);

      overdueTasks.forEach(
        (task) => {
          output.push({
            level:
              'danger',
            text:
              `Task overdue: ${task.name}`
          });
        }
      );

      res.json(
        output
      );
    } catch (error) {
      console.error(
        'ALERTS ERROR:',
        error
      );

      res.json([]);
    }
  }
);

/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(
  express.static(
    path.join(
      ROOT,
      'public'
    ),
    {
      index:
        'index.html'
    }
  )
);

/*
 * IMPORTANT:
 * Do NOT expose /public/uploads directly.
 * Evidence files are accessed only through
 * the authenticated API endpoint above.
 */

/* =========================================================
   API 404
========================================================= */

app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      error:
        'API endpoint not found'
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

    if (
      fs.existsSync(
        indexPath
      )
    ) {
      return res.sendFile(
        indexPath
      );
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
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      'GLOBAL ERROR:',
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      error:
        NODE_ENV ===
        'production'
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
