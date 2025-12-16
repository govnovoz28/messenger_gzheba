const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Set();
const messageHistory = [];
const messageReactions = new Map();

function broadcast(message, sender) {
    for (const client of clients) {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(message.toString());
        }
    }
}

function handleReaction(data, sender) {
    const { messageId, emoji, userId, oldEmoji } = data;
    
    if (!messageReactions.has(messageId)) {
        messageReactions.set(messageId, new Map());
    }
    
    const reactions = messageReactions.get(messageId);
    
    if (oldEmoji) {
        if (reactions.has(oldEmoji)) {
            const oldEmojiUsers = reactions.get(oldEmoji);
            oldEmojiUsers.delete(userId);
            if (oldEmojiUsers.size === 0) {
                reactions.delete(oldEmoji);
            }
        }
    } else {
        reactions.forEach((userSet, emojiKey) => {
            if (userSet.has(userId)) {
                userSet.delete(userId);
                if (userSet.size === 0) {
                    reactions.delete(emojiKey);
                }
            }
        });
    }
    
    if (emoji && emoji.trim() !== '') {
        if (!reactions.has(emoji)) {
            reactions.set(emoji, new Set());
        }
        reactions.get(emoji).add(userId);
    }
    
    const reactionUpdate = {
        type: 'reaction',
        messageId: messageId,
        emoji: emoji || '',
        userId: userId,
        clientId: data.clientId,
        oldEmoji: oldEmoji || null
    };
    
    for (const client of clients) {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(reactionUpdate));
        }
    }
    
    if (reactions.size === 0) {
        messageReactions.delete(messageId);
    }
}

function getReactionStats() {
    let totalMessages = messageReactions.size;
    let totalReactions = 0;
    let totalUsers = new Set();
    
    messageReactions.forEach((reactions) => {
        reactions.forEach((userSet) => {
            totalReactions += userSet.size;
            userSet.forEach(userId => totalUsers.add(userId));
        });
    });
    
    return {
        totalMessages,
        totalReactions,
        uniqueUsers: totalUsers.size
    };
}

wss.on('connection', (ws) => {
    console.log('Новый пользователь подключился!');
    clients.add(ws);
    
    ws.isAlive = true;
    
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    const stats = getReactionStats();
    ws.send(JSON.stringify({ type: 'stats', ...stats }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'reaction') {
                handleReaction(data, ws);
            } else {
                broadcast(message, ws);
            }
        } catch (error) {
            broadcast(message, ws);
        }
    });

    ws.on('close', () => {
        console.log('Пользователь отключился.');
        clients.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('Произошла ошибка:', error);
    });
});

const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('Удаление неактивного клиента');
            clients.delete(ws);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

setInterval(() => {
    if (clients.size > 0) {
        const stats = getReactionStats();
        broadcast(JSON.stringify({ type: 'stats', ...stats }));
    }
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeat);
});

console.log(`🚀 Сервер чата запущен на порту ${PORT}...`);
console.log(`📡 WebSocket эндпоинт: ws://localhost:${PORT}`);
