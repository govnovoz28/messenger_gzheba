const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const PORT = process.env.PORT || 8080;
const SECRET_KEY = 'YOUR_SUPER_SECRET_KEY_CHANGE_THIS'; 
const DB_SOURCE = "users.db";

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Подключено к базе данных SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            avatar TEXT
        )`);
    }
});

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Введите имя и пароль" });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);

    const sql = 'INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)';
    db.run(sql, [username, hashedPassword, null], function (err) {
        if (err) {
            return res.status(400).json({ error: "Пользователь с таким именем уже существует" });
        }
        const token = jwt.sign({ id: this.lastID, username: username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ message: "Успешная регистрация", token, username, avatar: null });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM users WHERE username = ?";
    
    db.get(sql, [username], (err, user) => {
        if (err) return res.status(500).json({ error: "Ошибка сервера" });
        if (!user) return res.status(404).json({ error: "Пользователь не найден" });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ error: "Неверный пароль" });

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ message: "Успешный вход", token, username, avatar: user.avatar });
    });
});

app.post('/api/update_profile', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Нет доступа' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });

        const { newUsername, newAvatar } = req.body;
        
        const sql = `UPDATE users SET username = COALESCE(?, username), avatar = COALESCE(?, avatar) WHERE id = ?`;
        
        db.run(sql, [newUsername, newAvatar, user.id], function(err) {
            if (err) {
                return res.status(400).json({ error: "Ошибка обновления (возможно имя занято)" });
            }
            
            const updatedUsername = newUsername || user.username;
            const newToken = jwt.sign({ id: user.id, username: updatedUsername }, SECRET_KEY, { expiresIn: '24h' });
            
            res.json({ 
                success: true, 
                token: newToken, 
                username: updatedUsername,
                avatar: newAvatar 
            });
        });
    });
});

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

function broadcastUserStatus(userData, status) {
    const data = { 
        type: 'partner_status', 
        username: userData.username, 
        avatar: userData.avatar,
        status: status 
    };
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

        const sql = "SELECT username, avatar FROM users WHERE id = ?";
        db.get(sql, [decoded.id], (err, user) => {
            if (!user) {
                ws.close();
                return;
            }

            const fullUserData = { ...decoded, username: user.username, avatar: user.avatar };
            ws.userData = fullUserData;
            clients.set(ws, fullUserData);
            ws.isAlive = true;

            ws.on('pong', () => ws.isAlive = true);

            broadcastUserStatus(fullUserData, 'online');

            clients.forEach((uData, clientWs) => {
                if (clientWs !== ws) {
                    ws.send(JSON.stringify({ 
                        type: 'partner_status', 
                        username: uData.username, 
                        avatar: uData.avatar,
                        status: 'online' 
                    }));
                }
            });
        });

        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message);
                
                if (parsed.type === 'profile_update') {
                    ws.userData.username = parsed.username;
                    ws.userData.avatar = parsed.avatar;
                    clients.set(ws, ws.userData);
                    broadcastUserStatus(ws.userData, 'online');
                    return;
                }

                parsed.clientId = ws.userData.id.toString(); 
                parsed.username = ws.userData.username;
                broadcast(parsed, ws);
            } catch (e) {
                console.error(e);
            }
        });

        ws.on('close', () => {
            if (ws.userData) {
                broadcastUserStatus(ws.userData, 'offline');
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
