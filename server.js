require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.JWT_SECRET || 'dev_secret_key_change_me'; 
const DB_SOURCE = "users.db";

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
    console.log('Подключено к базе данных SQLite.');
    
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            avatar TEXT
        )`);
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM users WHERE username = ?";
    
    db.get(sql, [username], (err, user) => {
        if (err) return res.status(500).json({ error: "Ошибка сервера" });
        
        if (!user) {
            const hashedPassword = bcrypt.hashSync(password, 8);
            const insertSql = "INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)";
            db.run(insertSql, [username, hashedPassword, null], function(err) {
                if (err) return res.status(500).json({ error: "Ошибка регистрации" });
                
                const token = jwt.sign({ id: this.lastID, username: username }, SECRET_KEY, { expiresIn: '24h' });
                return res.json({ message: "Регистрация успешна", token, username, id: this.lastID, avatar: null });
            });
        } else {
            const passwordIsValid = bcrypt.compareSync(password, user.password);
            if (!passwordIsValid) return res.status(401).json({ error: "Неверный пароль" });

            const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ message: "Успешный вход", token, username, id: user.id, avatar: user.avatar });
        }
    });
});

app.post('/api/update_profile', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Нет доступа' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });

        const { newUsername, newAvatar } = req.body;
        // Но для аватарки null может быть валидным (удаление), тут упрощено
        const sql = `UPDATE users SET username = ?, avatar = ? WHERE id = ?`;
        // В данном случае клиент всегда шлет полный стейт, так что пишем как есть.
        
        db.get("SELECT * FROM users WHERE id = ?", [user.id], (err, currentUser) => {
            if(err || !currentUser) return res.status(500).json({ error: "Ошибка БД" });

            const nameToSave = newUsername || currentUser.username;
            const avatarToSave = newAvatar !== undefined ? newAvatar : currentUser.avatar;

            db.run(sql, [nameToSave, avatarToSave, user.id], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(400).json({ error: "Ошибка обновления (возможно имя занято)" });
                }
                
                const newToken = jwt.sign({ id: user.id, username: nameToSave }, SECRET_KEY, { expiresIn: '24h' });
                
                res.json({ 
                    success: true, 
                    token: newToken, 
                    id: user.id,
                    username: nameToSave,
                    avatar: avatarToSave 
                });
            });
        });
    });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

function broadcast(data, senderWs) {
    const messageStr = JSON.stringify(data);
    for (const [clientWs] of clients.entries()) {
        if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(messageStr);
        }
    }
}

function broadcastUserStatus(userData, status) {
    const data = { 
        type: 'partner_status', 
        id: userData.id,
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
                        id: uData.id,
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
