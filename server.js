const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

// --- НАСТРОЙКИ ---
const PORT = process.env.PORT || 8080;
const SECRET_KEY = 'YOUR_SUPER_SECRET_KEY_CHANGE_THIS'; // Можешь поменять на свой
const DB_SOURCE = "users.db";

// --- ИНИЦИАЛИЗАЦИЯ БД SQLITE ---
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Подключено к базе данных SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);
    }
});

// --- НАСТРОЙКА EXPRESS (HTTP) ---
const app = express();
app.use(express.json());
app.use(cors());

// ВАЖНО: Раздаем статические файлы (index.html, style.css, script.js)
// Именно эта строчка убирает ошибку "Upgrade Required"
app.use(express.static(path.join(__dirname)));

// Маршрут регистрации
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Введите имя и пароль" });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);

    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.run(sql, [username, hashedPassword], function (err) {
        if (err) {
            return res.status(400).json({ error: "Пользователь с таким именем уже существует" });
        }
        const token = jwt.sign({ id: this.lastID, username: username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ message: "Успешная регистрация", token, username });
    });
});

// Маршрут входа
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM users WHERE username = ?";
    
    db.get(sql, [username], (err, user) => {
        if (err) return res.status(500).json({ error: "Ошибка сервера" });
        if (!user) return res.status(404).json({ error: "Пользователь не найден" });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ error: "Неверный пароль" });

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ message: "Успешный вход", token, username });
    });
});

// --- ЗАПУСК СЕРВЕРА (HTTP + WS ВМЕСТЕ) ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

function broadcast(data, senderWs) {
    const messageStr = JSON.stringify(data);
    for (const [clientWs, userData] of clients.entries()) {
        if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(messageStr);
        }
    }
}

function broadcastUserStatus(username, status) {
    const data = { type: 'partner_status', username, status };
    const messageStr = JSON.stringify(data);
    for (const [clientWs] of clients.entries()) {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(messageStr);
        }
    }
}

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
        ws.close();
        return;
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            ws.close();
            return;
        }

        ws.userData = decoded;
        clients.set(ws, decoded);
        ws.isAlive = true;
        ws.on('pong', () => ws.isAlive = true);

        broadcastUserStatus(decoded.username, 'online');

        clients.forEach((uData, clientWs) => {
            if (clientWs !== ws) {
                ws.send(JSON.stringify({ type: 'partner_status', username: uData.username, status: 'online' }));
            }
        });

        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message);
                parsed.clientId = ws.userData.id.toString(); 
                parsed.username = ws.userData.username;

                broadcast(parsed, ws);
            } catch (e) {
                console.error(e);
            }
        });

        ws.on('close', () => {
            if (ws.userData) {
                broadcastUserStatus(ws.userData.username, 'offline');
            }
            clients.delete(ws);
        });
    });
});

setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
