const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'noreply@localhost';
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || SMTP_PORT === 465;

const DEPARTMENTS = [
  { id: 'partiet', name: 'Frågor om partiet' },
  { id: 'material', name: 'Beställa brochyrer' },
  { id: 'grafiskt-material', name: 'Beställa övrigt grafiskt material' },
  { id: 'utskick', name: 'Utskick' },
  { id: 'medlemskontroll', name: 'Medlemskontroll' },
  { id: 'it-support', name: 'IT-support' },
  { id: 'it', name: 'IT / Mjukvara' },
  { id: 'hemsida', name: 'Hemsidan' },
  { id: 'marknad', name: 'Marknad' },
  { id: 'facebook', name: 'Facebook' }
];

const DEMO_PASSWORDS = {
  'it-support': 'demo-it-support',
  it: 'demo-it',
  hemsida: 'demo-hemsida',
  marknad: 'demo-marknad',
  facebook: 'demo-facebook',
  partiet: 'demo-partiet',
  material: 'demo-material',
  'grafiskt-material': 'demo-grafiskt',
  utskick: 'demo-utskick',
  medlemskontroll: 'demo-medlemskontroll'
};

const DEPARTMENT_EMAILS = {
  partiet: 'info@ambitionsverige.se',
  material: 'a-brochyrer@ambitionsverige.se',
  medlemskontroll: 'medlemskontroll@ambitionsverige.se',
  'it-support': 'itsupport@ambitionsverige.se',
  it: 'Itsupport@ambitionsverige.se',
  'grafiskt-material': 'thomas.akerberg@ambitionsverige.se'
};

const DEFAULT_USERS = [
  { departmentId: 'it-support' },
  { departmentId: 'it' },
  { departmentId: 'hemsida' },
  { departmentId: 'marknad' },
  { departmentId: 'facebook' },
  { departmentId: 'partiet' },
  { departmentId: 'material' },
  { departmentId: 'grafiskt-material' },
  { departmentId: 'utskick' },
  { departmentId: 'medlemskontroll' }
];

const sessions = new Map();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function departmentNameById(departmentId) {
  return DEPARTMENTS.find((d) => d.id === departmentId)?.name || departmentId;
}

function departmentEmailById(departmentId) {
  return DEPARTMENT_EMAILS[departmentId] || '';
}

function smtpIsConfigured() {
  return !!SMTP_HOST;
}

function encodeHeader(value) {
  const text = String(value || '');
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
}

function normalizeEmailBody(value) {
  return String(value || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function createSmtpConnection() {
  return new Promise((resolve, reject) => {
    const socket = SMTP_SECURE
      ? tls.connect(SMTP_PORT, SMTP_HOST, { servername: SMTP_HOST })
      : net.connect(SMTP_PORT, SMTP_HOST);

    socket.setEncoding('utf8');
    socket.setTimeout(15000);
    socket.once('connect', () => resolve(socket));
    socket.once('secureConnect', () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP timeout'));
    });
  });
}

function createSmtpReader(socket) {
  let buffer = '';
  const waiters = [];

  socket.on('data', (chunk) => {
    buffer += chunk;
    flush();
  });

  socket.on('error', (err) => {
    while (waiters.length) waiters.shift().reject(err);
  });

  function flush() {
    if (!waiters.length) return;
    const match = buffer.match(/(?:^|\r\n)(\d{3}) [^\r\n]*(?:\r\n|$)/);
    if (!match) return;
    const end = match.index + match[0].length;
    const response = buffer.slice(0, end).trimEnd();
    buffer = buffer.slice(end);
    waiters.shift().resolve(response);
    flush();
  }

  return () => new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
    flush();
  });
}

async function smtpExpect(read, expectedCodes) {
  const response = await read();
  const code = Number(response.slice(0, 3));
  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP svarade ${response}`);
  }
  return response;
}

async function smtpCommand(socket, read, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  return smtpExpect(read, expectedCodes);
}

async function upgradeSmtpToTls(socket, read) {
  await smtpCommand(socket, read, 'STARTTLS', [220]);
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: SMTP_HOST }, () => resolve(secureSocket));
    secureSocket.setEncoding('utf8');
    secureSocket.setTimeout(15000);
    secureSocket.once('error', reject);
  });
}

function buildOrderEmail(order) {
  const subject = `Ny beställning ${order.reference} - ${order.departmentName}`;
  const files = (order.files || []).length
    ? order.files.map((f) => `- ${f.name} (${f.size || 0} bytes)`).join('\n')
    : 'Inga bilagor';
  const text = [
    `Ny beställning: ${order.reference}`,
    '',
    `Avdelning: ${order.departmentName}`,
    `Skickad: ${order.createdAt}`,
    '',
    `Namn: ${order.name}`,
    `E-post: ${order.email}`,
    `Telefon: ${order.phone || '-'}`,
    '',
    'Meddelande:',
    order.message,
    '',
    'Bilagor:',
    files
  ].join('\n');

  return { subject, text };
}

async function sendOrderEmail(order) {
  if (!order.recipientEmail) {
    return { status: 'skipped', error: '' };
  }
  if (!smtpIsConfigured()) {
    return { status: 'failed', error: 'SMTP_HOST är inte konfigurerad' };
  }

  const { subject, text } = buildOrderEmail(order);
  let socket = await createSmtpConnection();
  let read = createSmtpReader(socket);

  try {
    await smtpExpect(read, [220]);
    await smtpCommand(socket, read, `EHLO ${SMTP_HOST}`, [250]);

    if (!SMTP_SECURE) {
      socket = await upgradeSmtpToTls(socket, read);
      read = createSmtpReader(socket);
      await smtpCommand(socket, read, `EHLO ${SMTP_HOST}`, [250]);
    }

    if (SMTP_USER || SMTP_PASS) {
      const auth = Buffer.from(`\u0000${SMTP_USER}\u0000${SMTP_PASS}`).toString('base64');
      await smtpCommand(socket, read, `AUTH PLAIN ${auth}`, [235]);
    }

    await smtpCommand(socket, read, `MAIL FROM:<${SMTP_FROM}>`, [250]);
    await smtpCommand(socket, read, `RCPT TO:<${order.recipientEmail}>`, [250, 251]);
    await smtpCommand(socket, read, 'DATA', [354]);

    const message = [
      `From: ${SMTP_FROM}`,
      `To: ${order.recipientEmail}`,
      `Reply-To: ${order.email}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      normalizeEmailBody(text),
      '.'
    ].join('\r\n');

    socket.write(`${message}\r\n`);
    await smtpExpect(read, [250]);
    await smtpCommand(socket, read, 'QUIT', [221]);
    return { status: 'sent', error: '' };
  } catch (err) {
    return { status: 'failed', error: err.message || 'Mejlet kunde inte skickas' };
  } finally {
    socket.end();
  }
}

function ensureDataFiles() {
  let createdUsers = false;
  let demoPasswords = [];
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(ORDERS_FILE)) {
    writeJson(ORDERS_FILE, []);
  }

  if (!fs.existsSync(USERS_FILE)) {
    const users = DEFAULT_USERS.map((u) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const password = DEMO_PASSWORDS[u.departmentId];
      return {
        id: crypto.randomUUID(),
        departmentId: u.departmentId,
        salt,
        passwordHash: hashPassword(password, salt),
        createdAt: new Date().toISOString()
      };
    });
    writeJson(USERS_FILE, users);
    createdUsers = true;
  }

  const users = safeReadJson(USERS_FILE, []);
  let changedUsers = createdUsers;
  for (const department of DEPARTMENTS) {
    const password = DEMO_PASSWORDS[department.id];
    if (!password) continue;

    let user = users.find((u) => u.departmentId === department.id);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        departmentId: department.id,
        createdAt: new Date().toISOString()
      };
      users.push(user);
      changedUsers = true;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.passwordHash = hashPassword(password, salt);
    user.updatedAt = new Date().toISOString();
    changedUsers = true;
    demoPasswords.push({
      departmentName: department.name,
      password
    });
  }

  if (changedUsers) {
    writeJson(USERS_FILE, users);
  }

  return { createdUsers, demoPasswords };
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [sid, data] of sessions.entries()) {
    if (data.expiresAt <= now) {
      sessions.delete(sid);
    }
  }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const chunks = cookieHeader.split(';');
  for (const chunk of chunks) {
    const [k, ...rest] = chunk.trim().split('=');
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function getSession(req) {
  cleanExpiredSessions();
  const cookies = parseCookies(req.headers.cookie || '');
  const sid = cookies.sid;
  if (!sid) return null;
  const data = sessions.get(sid);
  if (!data) return null;
  if (data.expiresAt <= Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return { sid, ...data };
}

function createSession(user) {
  const sid = crypto.randomBytes(24).toString('hex');
  const session = {
    userId: user.id,
    departmentId: user.departmentId,
    departmentName: departmentNameById(user.departmentId),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  sessions.set(sid, session);
  return { sid, ...session };
}

function destroySessionBySid(sid) {
  if (sid) sessions.delete(sid);
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function serveStatic(req, res, pathname) {
  const allowedPublic = new Set(['/', '/index.html', '/logo.png']);
  if (!allowedPublic.has(pathname)) {
    sendText(res, 404, 'Not found');
    return;
  }

  const fullPath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';

  const content = fs.readFileSync(fullPath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': content.length
  });
  res.end(content);
}

function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function randomReference() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `BP-${stamp}-${rand}`;
}

function sanitizeText(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Ej inloggad' });
    return null;
  }
  return session;
}

function getOrders() {
  return safeReadJson(ORDERS_FILE, []);
}

function saveOrders(orders) {
  writeJson(ORDERS_FILE, orders);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBodyJson(req);
    const departmentId = sanitizeText(body.departmentId, 64);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!departmentId || !password) {
      sendJson(res, 400, { error: 'Avdelning och lösenord krävs' });
      return;
    }

    const department = DEPARTMENTS.find((d) => d.id === departmentId);
    if (!department) {
      sendJson(res, 400, { error: 'Ogiltig avdelning' });
      return;
    }

    const users = safeReadJson(USERS_FILE, []);
    const user = users.find((u) => u.departmentId === department.id);
    if (!user) {
      sendJson(res, 401, { error: 'Fel avdelning eller lösenord' });
      return;
    }

    const candidate = hashPassword(password, user.salt);
    if (candidate !== user.passwordHash) {
      sendJson(res, 401, { error: 'Fel avdelning eller lösenord' });
      return;
    }

    const session = createSession(user);
    sendJson(
      res,
      200,
      {
        user: {
          departmentId: session.departmentId,
          departmentName: session.departmentName
        }
      },
      {
        'Set-Cookie': `sid=${session.sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
      }
    );
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const session = getSession(req);
    if (session) destroySessionBySid(session.sid);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 200, { authenticated: false });
      return;
    }
    sendJson(res, 200, {
      authenticated: true,
      user: {
        departmentId: session.departmentId,
        departmentName: session.departmentName
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/orders') {
    const body = await readBodyJson(req);

    const departmentId = sanitizeText(body.departmentId, 64);
    const department = DEPARTMENTS.find((d) => d.id === departmentId);
    const message = sanitizeText(body.message, 4000);
    const name = sanitizeText(body.name, 120);
    const email = sanitizeText(body.email, 120);
    const phone = sanitizeText(body.phone || '', 60);
    const files = Array.isArray(body.files)
      ? body.files
          .map((f) => ({
            name: sanitizeText(f?.name || '', 200),
            size: Number(f?.size || 0)
          }))
          .filter((f) => f.name)
      : [];

    if (!department) {
      sendJson(res, 400, { error: 'Ogiltig avdelning' });
      return;
    }
    if (!message || !name || !email) {
      sendJson(res, 400, { error: 'Meddelande, namn och e-post krävs' });
      return;
    }

    const order = {
      id: crypto.randomUUID(),
      reference: randomReference(),
      createdAt: new Date().toISOString(),
      departmentId: department.id,
      departmentName: department.name,
      recipientEmail: departmentEmailById(department.id),
      emailStatus: departmentEmailById(department.id) ? 'pending' : 'skipped',
      emailError: '',
      emailSentAt: '',
      status: 'new',
      message,
      name,
      email,
      phone,
      files,
      adminNote: ''
    };

    const orders = getOrders();
    orders.unshift(order);
    saveOrders(orders);

    if (order.recipientEmail) {
      const emailResult = await sendOrderEmail(order);
      order.emailStatus = emailResult.status;
      order.emailError = emailResult.error;
      order.emailSentAt = emailResult.status === 'sent' ? new Date().toISOString() : '';
      saveOrders(orders);
    }

    sendJson(res, 201, {
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        recipientEmail: order.recipientEmail,
        emailStatus: order.emailStatus,
        emailError: order.emailError
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/orders') {
    const session = requireAuth(req, res);
    if (!session) return;

    const status = sanitizeText(url.searchParams.get('status') || 'all', 20);
    const q = sanitizeText(url.searchParams.get('q') || '', 120).toLowerCase();

    let orders = getOrders().filter((o) => o.departmentId === session.departmentId);

    if (status !== 'all') {
      orders = orders.filter((o) => o.status === status);
    }

    if (q) {
      orders = orders.filter((o) => {
        const haystack = `${o.reference} ${o.name} ${o.email} ${o.message}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    sendJson(res, 200, { orders });
    return;
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/orders/')) {
    const session = requireAuth(req, res);
    if (!session) return;

    const orderId = pathname.split('/').pop();
    const body = await readBodyJson(req);

    const orders = getOrders();
    const index = orders.findIndex((o) => o.id === orderId && o.departmentId === session.departmentId);
    if (index < 0) {
      sendJson(res, 404, { error: 'Ärende hittades inte' });
      return;
    }

    if (body.status) {
      const allowed = ['new', 'in-progress', 'done'];
      if (!allowed.includes(body.status)) {
        sendJson(res, 400, { error: 'Ogiltig status' });
        return;
      }
      orders[index].status = body.status;
    }

    if (typeof body.adminNote === 'string') {
      orders[index].adminNote = sanitizeText(body.adminNote, 1000);
    }

    saveOrders(orders);
    sendJson(res, 200, { ok: true, order: orders[index] });
    return;
  }

  if (req.method === 'DELETE' && pathname === '/api/orders/department') {
    const session = requireAuth(req, res);
    if (!session) return;

    const orders = getOrders();
    const remaining = orders.filter((o) => o.departmentId !== session.departmentId);
    const removed = orders.length - remaining.length;
    saveOrders(remaining);
    sendJson(res, 200, { ok: true, removed });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/orders/export') {
    const session = requireAuth(req, res);
    if (!session) return;

    const orders = getOrders().filter((o) => o.departmentId === session.departmentId);
    const payload = JSON.stringify(orders, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${session.departmentId}.json"`,
      'Content-Length': Buffer.byteLength(payload)
    });
    res.end(payload);
    return;
  }

  sendJson(res, 404, { error: 'API endpoint hittades inte' });
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (err) {
    if (err.message === 'Payload too large') {
      sendJson(res, 413, { error: 'För stor payload' });
      return;
    }
    if (err.message === 'Invalid JSON body') {
      sendJson(res, 400, { error: 'Ogiltig JSON-body' });
      return;
    }
    console.error(err);
    sendJson(res, 500, { error: 'Internt serverfel' });
  }
}

const setup = ensureDataFiles();

const server = http.createServer(requestHandler);
server.listen(PORT, () => {
  console.log(`Bestallningsportalen startad: http://localhost:${PORT}`);
  if (setup.createdUsers) {
    console.log('users.json skapades med standardkonton per avdelning.');
  }
  console.log('Demo-inloggningar:');
  for (const u of setup.demoPasswords) {
    console.log(`- ${u.departmentName}: ${u.password}`);
  }
});
