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
const SECRET_KEY = 'YOUR_SUPER_SECRET_KEY_CHANGE_THIS'; // Поменяй на сложный ключ
const DB_SOURCE = "users.db";

// --- ИНИЦИАЛИЗАЦИЯ БД SQLITE ---
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Подключено к базе данных SQLite.');
        // Создаем таблицу пользователей, если её нет
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);
    }
});

// --- НАСТРОЙКА EXPRESS (HTTP) ---
const app = express();
app.use(express.json()); // Чтобы парсить JSON в POST запросах
app.use(cors());
app.use(express.static(path.join(__dirname))); // Раздаем статику (html, css, js)

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
        // Сразу создаем токен после регистрации
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

// --- ЗАПУСК СЕРВЕРА ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map(); // Map: ws -> userData

// Функция рассылки
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
    // Получаем токен из URL (ws://url?token=...)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
        ws.close();
        return;
    }

    // Проверяем токен
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            ws.close();
            return;
        }

        console.log(`Подключился: ${decoded.username}`);
        
        // Сохраняем данные пользователя в ws объект и в Map
        ws.userData = decoded;
        clients.set(ws, decoded);

        ws.isAlive = true;
        ws.on('pong', () => ws.isAlive = true);

        // Уведомляем других, что пользователь онлайн
        broadcastUserStatus(decoded.username, 'online');

        // Отправляем текущему юзеру список тех, кто уже онлайн (упрощенно)
        // В реальном проекте тут лучше отправлять список, а не спамить статусами
        clients.forEach((uData, clientWs) => {
            if (clientWs !== ws) {
                ws.send(JSON.stringify({ type: 'partner_status', username: uData.username, status: 'online' }));
            }
        });

        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message);
                
                // Принудительно ставим clientId и username из токена, чтобы их нельзя было подделать с фронта
                parsed.clientId = ws.userData.id.toString(); 
                parsed.username = ws.userData.username;

                // Обработка реакций (упрощенная для примера)
                if (parsed.type === 'reaction') {
                    // Пересылаем всем (включая логику удаления/добавления, которую ты уже писал)
                    // Тут можно добавить логику сохранения в БД SQLite реакций
                    broadcast(parsed, ws);
                } else {
                    broadcast(parsed, ws);
                }
            } catch (e) {
                console.error(e);
            }
        });

        ws.on('close', () => {
            console.log(`Отключился: ${ws.userData.username}`);
            broadcastUserStatus(ws.userData.username, 'offline');
            clients.delete(ws);
        });
    });
});

// Heartbeat
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
