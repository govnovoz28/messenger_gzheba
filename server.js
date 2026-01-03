require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
// ЗАМЕНА: Вместо sqlite3 подключаем pg
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.JWT_SECRET || 'dev_secret_key_change_me'; 

// ЗАМЕНА: Настройка подключения к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Render предоставит эту переменную
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Нужен SSL для Render
});

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ЗАМЕНА: Инициализация таблицы при старте
pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    avatar TEXT
)`).then(() => {
    console.log('Таблица users проверена/создана в PostgreSQL.');
}).catch(err => console.error('Ошибка БД:', err));


app.post('/api/login', async (req, res) => { // Используем async/await для удобства с pg
    const { username, password } = req.body;
    const sqlSelect = "SELECT * FROM users WHERE username = $1"; // $1 вместо ?
    
    try {
        const { rows } = await pool.query(sqlSelect, [username]);
        const user = rows[0];

        if (!user) {
            // Регистрация
            const hashedPassword = bcrypt.hashSync(password, 8);
            const insertSql = "INSERT INTO users (username, password, avatar) VALUES ($1, $2, $3) RETURNING id";
            
            const insertResult = await pool.query(insertSql, [username, hashedPassword, null]);
            const newId = insertResult.rows[0].id;
            
            const token = jwt.sign({ id: newId, username: username }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ message: "Регистрация успешна", token, username, id: newId, avatar: null });
        } else {
            // Вход
            const passwordIsValid = bcrypt.compareSync(password, user.password);
            if (!passwordIsValid) return res.status(401).json({ error: "Неверный пароль" });

            const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ message: "Успешный вход", token, username, id: user.id, avatar: user.avatar });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/api/update_profile', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Нет доступа' });

    jwt.verify(token, SECRET_KEY, async (err, userDecoded) => {
        if (err) return res.status(403).json({ error: 'Токен недействителен' });

        const { newUsername, newAvatar } = req.body;
        
        try {
            // Проверка текущего юзера
            const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userDecoded.id]);
            const currentUser = rows[0];
            if (!currentUser) return res.status(500).json({ error: "Пользователь не найден" });

            const nameToSave = newUsername || currentUser.username;
            const avatarToSave = newAvatar !== undefined ? newAvatar : currentUser.avatar;

            // Обновление
            const updateSql = `UPDATE users SET username = $1, avatar = $2 WHERE id = $3`;
            await pool.query(updateSql, [nameToSave, avatarToSave, userDecoded.id]);

            const newToken = jwt.sign({ id: userDecoded.id, username: nameToSave }, SECRET_KEY, { expiresIn: '24h' });
                
            res.json({ 
                success: true, 
                token: newToken, 
                id: userDecoded.id,
                username: nameToSave,
                avatar: avatarToSave 
            });

        } catch (dbErr) {
            console.error(dbErr);
            return res.status(400).json({ error: "Ошибка обновления (возможно имя занято)" });
        }
    });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

// ... функции broadcast и broadcastUserStatus остаются без изменений ...
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

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) {
            ws.close();
            return;
        }

        try {
            // ЗАМЕНА: Запрос к PG
            const sql = "SELECT username, avatar FROM users WHERE id = $1";
            const { rows } = await pool.query(sql, [decoded.id]);
            const user = rows[0];

            if (!user) {
                // ВОТ ЗДЕСЬ ПРОИСХОДИЛ РАЗРЫВ, ТЕПЕРЬ ДАННЫЕ БУДУТ НА МЕСТЕ
                ws.close();
                return;
            }

            const fullUserData = { ...decoded, username: user.username, avatar: user.avatar };
            ws.userData = fullUserData;
            clients.set(ws, fullUserData);
            ws.isAlive = true;

            ws.on('pong', () => ws.isAlive = true);

            broadcastUserStatus(fullUserData, 'online');

            // Отправляем новому клиенту статусы других
            clients.forEach((uData, clientWs) => {
                if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ 
                        type: 'partner_status', 
                        id: uData.id,
                        username: uData.username, 
                        avatar: uData.avatar,
                        status: 'online' 
                    }));
                }
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

        } catch (dbErr) {
            console.error("Ошибка при подключении WS:", dbErr);
            ws.close();
        }
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