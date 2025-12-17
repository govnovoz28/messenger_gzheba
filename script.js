const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleText = document.getElementById('auth-toggle-text');
const authError = document.getElementById('auth-error');
const usernameInput = document.getElementById('auth-username');
const passwordInput = document.getElementById('auth-password');

const mainWrapper = document.getElementById('main-wrapper');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const previewContainer = document.getElementById('image-preview-container');
const inputArea = document.getElementById('input-area');

const btnUploadPhoto = document.getElementById('btn-upload-photo');
const btnUploadFile = document.getElementById('btn-upload-file');
const hiddenPhotoInput = document.getElementById('hidden-photo-input');
const hiddenFileInput = document.getElementById('hidden-file-input');

const replyPreview = document.getElementById('reply-preview');
const cancelReplyBtn = replyPreview.querySelector('.cancel-reply-btn');
const replyAuthorSpan = replyPreview.querySelector('.reply-author');
const replyTextDiv = replyPreview.querySelector('.reply-text');
const replyImageIndicator = replyPreview.querySelector('.reply-image-indicator');
const replyFileIndicator = replyPreview.querySelector('.reply-file-indicator');

const headerUsername = document.getElementById('header-username');
const headerStatus = document.getElementById('header-status');
const partnerAvatar = document.getElementById('partner-avatar');

const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu-btn');
const openProfileBtn = document.getElementById('open-profile-btn');
const profileModal = document.getElementById('profile-modal');
const profileCloseBtn = document.querySelector('.profile-close');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileUsernameInput = document.getElementById('profile-username-input');
const profileAvatarInput = document.getElementById('profile-avatar-input');
const profileAvatarPreview = document.getElementById('profile-avatar-preview');
const profileAvatarPlaceholder = document.getElementById('profile-avatar-placeholder');

const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-image');
const closeModalBtn = document.querySelector('.modal-close');
const modalLoader = document.getElementById('modal-loader');

const modalPrevBtn = document.createElement('button');
modalPrevBtn.className = 'modal-nav modal-prev';
modalPrevBtn.innerHTML = '&#10094;';
modal.appendChild(modalPrevBtn);

const modalNextBtn = document.createElement('button');
modalNextBtn.className = 'modal-nav modal-next';
modalNextBtn.innerHTML = '&#10095;';
modal.appendChild(modalNextBtn);

const deleteModal = document.createElement('div');
deleteModal.id = 'delete-modal';
deleteModal.innerHTML = `
    <div class="delete-popup">
        <h3>Удалить это сообщение?</h3>
        <div class="delete-checkbox-wrapper">
            <input type="checkbox" id="delete-for-all-checkbox" checked>
            <label for="delete-for-all-checkbox">Также удалить для всех</label>
        </div>
        <div class="delete-actions">
            <button class="delete-cancel-btn">Отмена</button>
            <button class="delete-confirm-btn">Удалить</button>
        </div>
    </div>
`;
document.body.appendChild(deleteModal);

let socket = null;
let clientId = null;
let clientAvatar = null;
let isLoginMode = true;
const onlineUsers = new Map(); 

const IMG_MAX_WIDTH = 1920;
const IMG_MAX_HEIGHT = 1920;
const IMG_QUALITY = 0.8;
const MAX_FILE_SIZE = 5 * 1024 * 1024; 

let stagedFiles = [];
let messageCounter = 0;
let replyToMessage = null;
let editingMessageId = null;
let currentGalleryImages = [];
let currentGalleryIndex = 0;
let isInternalDrag = false;
let messageToDelete = null;

let originalTitle = document.title;
let blinkInterval = null;
let unreadCount = 0;

const localReactions = new Map();
const emojiCache = new Map();
const encryptionCache = new Map();
const decryptionCache = new Map();

const savedToken = localStorage.getItem('chat_token');
const savedUsername = localStorage.getItem('chat_username');
const savedAvatar = localStorage.getItem('chat_avatar');

if (savedToken && savedUsername) {
    connectWebSocket(savedToken, savedUsername, savedAvatar);
}

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('expanded');
});

openProfileBtn.addEventListener('click', () => {
    profileModal.style.display = 'flex';
    setTimeout(() => {
        profileModal.classList.add('modal-visible');
    }, 10);
    
    profileUsernameInput.value = clientId;
    if (clientAvatar) {
        profileAvatarPreview.src = clientAvatar;
        profileAvatarPreview.classList.remove('hidden');
        profileAvatarPlaceholder.classList.add('hidden');
    } else {
        profileAvatarPreview.src = '';
        profileAvatarPreview.classList.add('hidden');
        profileAvatarPlaceholder.classList.remove('hidden');
    }
});

profileCloseBtn.addEventListener('click', () => {
    profileModal.classList.remove('modal-visible');
    setTimeout(() => {
        profileModal.style.display = 'none';
    }, 300);
});

profileAvatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const compressed = await processAndCompressImage(file);
        profileAvatarPreview.src = compressed;
        profileAvatarPreview.classList.remove('hidden');
        profileAvatarPlaceholder.classList.add('hidden');
    }
});

saveProfileBtn.addEventListener('click', async () => {
    const newUsername = profileUsernameInput.value.trim();
    const newAvatar = profileAvatarPreview.classList.contains('hidden') ? null : profileAvatarPreview.src;
    
    if (!newUsername) return;

    try {
        const token = localStorage.getItem('chat_token');
        const response = await fetch('/api/update_profile', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newUsername, newAvatar })
        });

        const data = await response.json();
        
        if (data.success) {
            clientId = data.username;
            clientAvatar = data.avatar;
            localStorage.setItem('chat_token', data.token);
            localStorage.setItem('chat_username', data.username);
            if(data.avatar) localStorage.setItem('chat_avatar', data.avatar);
            else localStorage.removeItem('chat_avatar');
            
            socket.send(JSON.stringify({
                type: 'profile_update',
                username: clientId,
                avatar: clientAvatar
            }));

            profileModal.classList.remove('modal-visible');
            setTimeout(() => {
                profileModal.style.display = 'none';
            }, 300);
        } else {
            alert(data.error);
        }

    } catch (e) {
        console.error(e);
        alert("Ошибка сохранения профиля");
    }
});

authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authTitle.textContent = isLoginMode ? 'Вход' : 'Регистрация';
    authSubmit.textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
    authToggleText.textContent = isLoginMode ? 'Нет аккаунта?' : 'Уже есть аккаунт?';
    authToggleLink.textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
    authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value;
    const password = passwordInput.value;
    const endpoint = isLoginMode ? '/api/login' : '/api/register';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка');
        }

        localStorage.setItem('chat_token', data.token);
        localStorage.setItem('chat_username', data.username);
        if (data.avatar) localStorage.setItem('chat_avatar', data.avatar);
        else localStorage.removeItem('chat_avatar');
        
        connectWebSocket(data.token, data.username, data.avatar);
        usernameInput.value = '';
        passwordInput.value = '';

    } catch (err) {
        authError.textContent = err.message;
        authError.style.display = 'block';
    }
});

function updateHeaderUI() {
    let partner = null;
    for (let [name, data] of onlineUsers) {
        if (name !== clientId) {
            partner = data;
            break;
        }
    }

    if (partner) {
        headerUsername.textContent = partner.username;
        headerStatus.textContent = 'в сети';
        headerStatus.style.color = '#4cd137';
        if (partner.avatar) {
            partnerAvatar.innerHTML = `<img src="${partner.avatar}">`;
        } else {
            partnerAvatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
        }
    } else {
        headerUsername.textContent = 'Ожидание собеседника...';
        headerStatus.textContent = 'не в сети';
        headerStatus.style.color = '#888';
        partnerAvatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
    }
}

partnerAvatar.addEventListener('click', (e) => {
    const img = partnerAvatar.querySelector('img');
    if (img) {
        e.stopPropagation();
        openModal([img.src], 0);
    }
});

btnUploadPhoto.addEventListener('click', () => {
    hiddenPhotoInput.click();
});

btnUploadFile.addEventListener('click', () => {
    hiddenFileInput.click();
});

hiddenPhotoInput.addEventListener('change', handleFileSelect);
hiddenFileInput.addEventListener('change', handleFileSelect);

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            alert(`Файл ${file.name} слишком большой (макс 5MB)`);
            continue;
        }
        await addFileToStage(file);
    }
    e.target.value = ''; 
}

function connectWebSocket(token, username, avatar) {
    clientId = username;
    clientAvatar = avatar || null;
    updateHeaderUI();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    socket = new WebSocket(`${protocol}//${host}?token=${token}`);

    socket.onopen = () => {
        authModal.style.display = 'none';
        mainWrapper.style.display = 'flex';
        authError.style.display = 'none';
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'partner_status') {
                if (data.status === 'online') {
                    onlineUsers.set(data.username, { username: data.username, avatar: data.avatar });
                } else {
                    onlineUsers.delete(data.username);
                }
                updateHeaderUI();
                return;
            }

            if (data.username === clientId && data.type !== 'edit' && data.type !== 'delete') return;

            if (data.type === 'reaction') {
                handleReactionFromServer(data);
            } else if (data.type === 'edit') {
                updateMessageContent(data.messageId, data.content);
                updateRepliesOnEdit(data.messageId, data.content);
            } else if (data.type === 'delete') {
                const msgToRemove = document.querySelector(`[data-message-id="${data.messageId}"]`);
                if (msgToRemove) msgToRemove.remove();
                updateRepliesOnDelete(data.messageId);
            } else if (data.type === 'text' || data.type === 'image' || data.type === 'file' || data.type === 'info') {
                const type = data.username === clientId ? 'my-message' : 'friend-message';
                displayMessage(data, type);
                notifyNewMessage();
            }
        } catch (error) {
            console.error(error);
        }
    };

    socket.onclose = () => {
        authModal.style.display = 'flex';
        mainWrapper.style.display = 'none';
        authError.textContent = "Соединение разорвано";
        authError.style.display = 'block';
        onlineUsers.clear();
        updateHeaderUI();
    };

    socket.onerror = (error) => {
        console.error(error);
    };
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        clearInterval(blinkInterval);
        blinkInterval = null;
        unreadCount = 0;
        document.title = originalTitle;
    }
});

function notifyNewMessage() {
    if (document.hidden) {
        unreadCount++;
        if (!blinkInterval) {
            let state = false;
            blinkInterval = setInterval(() => {
                document.title = state ? originalTitle : `${unreadCount} непрочитанное сообщение`;
                state = !state;
            }, 1000);
        }
    }
}

function parseEmojis(element) {
    if (typeof twemoji !== 'undefined') {
        requestAnimationFrame(() => {
            twemoji.parse(element, {
                folder: 'svg',
                ext: '.svg',
                base: 'https://cdn.jsdelivr.gh/jdecked/twemoji@latest/assets/',
                callback: function(icon) {
                    if (!emojiCache.has(icon)) {
                        emojiCache.set(icon, `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${icon}.svg`);
                    }
                    return emojiCache.get(icon);
                }
            });
        });
    }
}

const encryptionMap = {
    'й': '1', 'ц': '2', 'у': '3', 'к': '4', 'е': '5', 'н': '6', 'г': '7', 'ш': '8', 'щ': '9', 'з': '0',
    'х': 'х', 'ъ': 'ъ', 'ф': '@', 'ы': '#', 'в': '₽', 'а': '–', 'п': '&', 'р': '若', 'о': '+', 'л': '(',
    'д': ')', 'ж': '№', 'э': '∼', 'я': '*', 'ч': 'ㅘ', 'м': ':', 'и': ';', 'т': 'ト', 'ь': 'ª',
    'б': 'ﹴ', 'ю': '%', '.': '!?',
    'Й': '1', 'Ц': '2', 'У': '3', 'К': '4', 'Е': '5', 'Н': '6', 'Г': '7', 'Ш': '8', 'Щ': '9', 'З': '0',
    'Х': 'х', 'Ъ': 'ъ', 'Ф': '@', 'Ы': '#', 'В': '₽', 'А': '–', 'П': '&', 'Р': '若', 'О': '+', 'Л': '(',
    'Д': ')', 'Ж': '№', 'Э': '∼', 'Я': '*', 'Ч': 'ㅘ', 'М': ':', 'И': ';', 'Т': 'ト', 'Ь': 'ª',
    'Б': 'ﹴ', 'Ю': '%'
};

const decryptionMap = Object.entries(encryptionMap).reduce((acc, [key, value]) => {
    if (!acc[value]) {
        acc[value] = key.toLowerCase();
    }
    return acc;
}, {});
const sortedDecryptKeys = Object.keys(decryptionMap).sort((a, b) => b.length - a.length);

const availableReactions = [
    '❤️', '👍🏻', '😁', '💯', '👌🏻', '🔥', '👏🏻',
    '😢', '🤔', '🤣', '🤝', '👋🏻', '😐', '😨', '🥰', '😘',
    '🤬', '😭', '👎', '🤯', '😱', '🤮',
    '💩', '🏆', '🥱', '🙏🏻', '😴', '🖕🏻', '👀',
    '😎', '😈'
];

async function processAndCompressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > IMG_MAX_WIDTH) {
                        height *= IMG_MAX_WIDTH / width;
                        width = IMG_MAX_WIDTH;
                    }
                } else {
                    if (height > IMG_MAX_HEIGHT) {
                        width *= IMG_MAX_HEIGHT / height;
                        height = IMG_MAX_HEIGHT;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', IMG_QUALITY);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function addFileToStage(file) {
    try {
        let content;
        let type;
        
        if (file.type.startsWith('image/')) {
            content = await processAndCompressImage(file);
            type = 'image';
        } else {
            content = await getBase64(file);
            type = 'file';
        }

        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        stagedFiles.push({
            id: id,
            content: content,
            type: type,
            name: file.name,
            size: file.size,
            isSpoiler: false
        });
        renderPreview();
        toggleSendButton();
    } catch (e) {
        console.error(e);
    }
}

function setReplyTo(messageData) {
    if (editingMessageId) cancelEdit();
    
    replyToMessage = {
        id: messageData.messageId || messageData.id,
        author: messageData.author === clientId ? 'Вы' : messageData.author,
        content: messageData.content,
        type: messageData.type
    };

    replyAuthorSpan.textContent = `${replyToMessage.author}`;
    replyPreview.classList.remove('edit-mode');

    replyTextDiv.style.display = 'none';
    replyImageIndicator.style.display = 'none';
    replyFileIndicator.style.display = 'none';

    if (replyToMessage.type === 'image') {
        replyImageIndicator.style.display = 'block';
    } else if (replyToMessage.type === 'file') {
        replyFileIndicator.style.display = 'block';
    } else {
        replyTextDiv.textContent = replyToMessage.content;
        replyTextDiv.style.display = 'block';
    }

    replyPreview.style.display = 'block';
    messageInput.placeholder = 'Сообщение...';
    messageInput.focus();
}

function setEditMode(messageWrapper) {
    if (replyToMessage) cancelReply();

    const messageId = messageWrapper.dataset.messageId;
    let content = '';
    const captionElement = messageWrapper.querySelector('.message-caption');
    const textElement = messageWrapper.querySelector('.message.text');

    if (captionElement) {
        content = captionElement.textContent;
    } else if (textElement) {
        content = textElement.textContent.replace(' (ред.)', '');
    }

    if (!content && !messageWrapper.querySelector('.message-image')) return;

    editingMessageId = messageId;
    messageInput.value = content;
    
    replyAuthorSpan.textContent = 'Изменить сообщение';
    replyTextDiv.textContent = content;
    replyTextDiv.style.display = 'block';
    replyImageIndicator.style.display = 'none';
    replyFileIndicator.style.display = 'none';
    
    replyPreview.classList.add('edit-mode');
    replyPreview.style.display = 'block';
    
    messageInput.placeholder = 'Редактировать сообщение...';
    messageInput.focus();
    toggleSendButton();
}

function cancelReply() {
    replyToMessage = null;
    editingMessageId = null;
    replyPreview.classList.remove('edit-mode');
    replyPreview.style.display = 'none';
    messageInput.placeholder = 'Сообщение...';
    messageInput.value = '';
    toggleSendButton();
    messageInput.focus();
}

function cancelEdit() {
    editingMessageId = null;
    replyPreview.classList.remove('edit-mode');
    replyPreview.style.display = 'none';
    messageInput.placeholder = 'Сообщение...';
    messageInput.value = '';
    toggleSendButton();
    messageInput.focus();
}

cancelReplyBtn.addEventListener('click', () => {
    if (editingMessageId) {
        cancelEdit();
    } else {
        cancelReply();
    }
});

function closeAllPopups() {
    document.querySelectorAll('.emoji-picker, .context-menu').forEach(el => el.remove());
}

let emojiPickerTimeout;
function showEmojiPicker(event, messageWrapper) {
    if (emojiPickerTimeout) clearTimeout(emojiPickerTimeout);

    emojiPickerTimeout = setTimeout(() => {
        closeAllPopups();

        const picker = document.createElement('div');
        picker.className = 'emoji-picker';

        const fragment = document.createDocumentFragment();
        const popularEmojis = availableReactions.slice(0, 7);
        popularEmojis.forEach(emoji => {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'emoji';
            emojiSpan.textContent = emoji;
            emojiSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                addReactionLocally(messageWrapper, emoji, clientId);
                sendReactionToServer(messageWrapper.dataset.messageId, emoji, clientId);
                closeAllPopups();
            });
            fragment.appendChild(emojiSpan);
        });

        const expandButton = document.createElement('button');
        expandButton.className = 'expand-button';
        expandButton.innerHTML = '&#9660;';

        expandButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const expandedPicker = document.createElement('div');
            expandedPicker.className = 'emoji-picker expanded';
            const expandedFragment = document.createDocumentFragment();
            availableReactions.forEach(emoji => {
                const emojiSpan = document.createElement('span');
                emojiSpan.className = 'emoji';
                emojiSpan.textContent = emoji;
                emojiSpan.addEventListener('click', () => {
                    addReactionLocally(messageWrapper, emoji, clientId);
                    sendReactionToServer(messageWrapper.dataset.messageId, emoji, clientId);
                    closeAllPopups();
                });
                expandedFragment.appendChild(emojiSpan);
            });

            expandedPicker.appendChild(expandedFragment);
            expandedPicker.style.left = picker.style.left;
            expandedPicker.style.top = picker.style.top;

            picker.replaceWith(expandedPicker);
            parseEmojis(expandedPicker);
            createContextMenu(messageWrapper, expandedPicker);
        });

        fragment.appendChild(expandButton);
        picker.appendChild(fragment);
        document.body.appendChild(picker);

        parseEmojis(picker);

        picker.style.left = `${event.pageX}px`;
        const pickerHeight = picker.offsetHeight;
        const replyBtnOffset = 22; 
        picker.style.top = `${event.pageY - pickerHeight - replyBtnOffset}px`;

        createContextMenu(messageWrapper, picker);

        const closeHandler = (e) => {
            if (!picker.contains(e.target) && !e.target.closest('.context-menu')) {
                closeAllPopups();
                document.removeEventListener('click', closeHandler);
            }
        };

        requestAnimationFrame(() => document.addEventListener('click', closeHandler));
    }, 10);
}

function createContextMenu(messageWrapper, picker) {
    document.querySelector('.context-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const replyBtn = document.createElement('button');
    replyBtn.className = 'context-btn';
    replyBtn.innerHTML = '<i class="fa-solid fa-reply"></i> Ответить';
    replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleReply(messageWrapper);
        closeAllPopups();
    });
    menu.appendChild(replyBtn);

    if (messageWrapper.classList.contains('my-message-wrapper')) {
        const editBtn = document.createElement('button');
        editBtn.className = 'context-btn';
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Изменить';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setEditMode(messageWrapper);
            closeAllPopups();
        });
        menu.appendChild(editBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'context-btn';
    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Копировать';
    copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleCopy(messageWrapper, copyBtn);
        closeAllPopups();
    });
    menu.appendChild(copyBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'context-btn';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Удалить';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(messageWrapper);
        closeAllPopups();
    });
    menu.appendChild(deleteBtn);

    const img = messageWrapper.querySelector('img[data-is-spoiler="true"]');
    if (img && !img.classList.contains('spoiler')) {
        const spoilerBtn = document.createElement('button');
        spoilerBtn.className = 'context-btn';
        spoilerBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Спрятать';
        spoilerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            img.classList.add('spoiler');
            closeAllPopups();
        });
        menu.appendChild(spoilerBtn);
    }

    document.body.appendChild(menu);

    const pickerRect = picker.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = `${window.scrollY + pickerRect.bottom + 4}px`;
    menu.style.left = `${window.scrollX + pickerRect.left + pickerRect.width / 2}px`;
}

function openDeleteModal(messageWrapper) {
    messageToDelete = messageWrapper;
    deleteModal.style.display = 'flex';
    
    const checkbox = document.getElementById('delete-for-all-checkbox');
    checkbox.checked = true; 

    setTimeout(() => {
        deleteModal.classList.add('visible');
    }, 10);
}

function closeDeleteModal() {
    deleteModal.classList.remove('visible');
    setTimeout(() => {
        deleteModal.style.display = 'none';
        messageToDelete = null;
    }, 200);
}

deleteModal.querySelector('.delete-confirm-btn').addEventListener('click', () => {
    if (!messageToDelete) {
        closeDeleteModal();
        return;
    }

    const checkbox = document.getElementById('delete-for-all-checkbox');
    const messageId = messageToDelete.dataset.messageId;

    if (messageId) {
        messageToDelete.remove(); 
        
        updateRepliesOnDelete(messageId);

        if (checkbox.checked) {
            socket.send(JSON.stringify({
                type: 'delete',
                messageId: messageId,
                clientId: clientId
            }));
        }
    }
    closeDeleteModal();
});

deleteModal.querySelector('.delete-cancel-btn').addEventListener('click', closeDeleteModal);
deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
});

function updateReactionsDisplay(messageWrapper, messageId) {
    const messageReactions = localReactions.get(messageId);
    messageWrapper.querySelector('.reactions-container')?.remove();

    if (!messageReactions || messageReactions.size === 0) return;

    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'reactions-container';
    const fragment = document.createDocumentFragment();

    messageReactions.forEach((userIds, emoji) => {
        if (userIds.size > 0) {
            const reaction = document.createElement('span');
            reaction.className = 'reaction';
            reaction.dataset.emoji = emoji;

            const count = userIds.size;
            reaction.innerHTML = `<span class="emoji-in-reaction">${emoji}</span>${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}`;


            if (userIds.has(clientId)) {
                reaction.classList.add('my-reaction');
            }

            reaction.addEventListener('click', (e) => {
                e.stopPropagation();
                if (userIds.has(clientId)) {
                    removeReactionLocally(messageWrapper, emoji, clientId);
                    sendReactionToServer(messageId, '', clientId, emoji);
                } else {
                    addReactionLocally(messageWrapper, emoji, clientId);
                    sendReactionToServer(messageId, emoji, clientId);
                }
            });
            fragment.appendChild(reaction);
        }
    });

    if (fragment.children.length > 0) {
        reactionsContainer.appendChild(fragment);
        messageWrapper.appendChild(reactionsContainer);
        parseEmojis(reactionsContainer);
    }
}

function addReactionLocally(messageWrapper, emoji, userId) {
    const messageId = messageWrapper.dataset.messageId;
    if (!localReactions.has(messageId)) {
        localReactions.set(messageId, new Map());
    }
    const messageReactions = localReactions.get(messageId);

    messageReactions.forEach((userIds, existingEmoji) => {
        if (userIds.has(userId)) {
            userIds.delete(userId);
        }
        if (userIds.size === 0) {
            messageReactions.delete(existingEmoji);
        }
    });

    if (emoji && emoji.trim() !== '') {
        if (!messageReactions.has(emoji)) {
            messageReactions.set(emoji, new Set());
        }
        messageReactions.get(emoji).add(userId);
    }

    updateReactionsDisplay(messageWrapper, messageId);
}

function removeReactionLocally(messageWrapper, emoji, userId) {
    const messageId = messageWrapper.dataset.messageId;
    const messageReactions = localReactions.get(messageId);

    if (messageReactions && messageReactions.has(emoji)) {
        messageReactions.get(emoji).delete(userId);
        if (messageReactions.get(emoji).size === 0) {
            messageReactions.delete(emoji);
        }
    }

    updateReactionsDisplay(messageWrapper, messageId);
}

function sendReactionToServer(messageId, emoji, userId, oldEmoji = null) {
    const reactionData = {
        type: 'reaction',
        messageId: messageId,
        emoji: emoji || '',
        userId: userId,
        clientId: clientId,
        oldEmoji: oldEmoji
    };
    socket.send(JSON.stringify(reactionData));
}

function handleReactionFromServer(data) {
    const messageWrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (!messageWrapper) return;

    const messageId = data.messageId;
    if (!localReactions.has(messageId)) {
        localReactions.set(messageId, new Map());
    }
    const messageReactions = localReactions.get(messageId);

    messageReactions.forEach((userIds, emoji) => {
        userIds.delete(data.userId);
        if (userIds.size === 0) {
            messageReactions.delete(emoji);
        }
    });

    if (data.emoji && data.emoji.trim() !== '') {
        if (!messageReactions.has(data.emoji)) {
            messageReactions.set(data.emoji, new Set());
        }
        messageReactions.get(data.emoji).add(data.userId);
    }

    updateReactionsDisplay(messageWrapper, messageId);
}

function isEncryptedMessage(text) {
    if (!text || text.trim() === '') return false;
    if (encryptionCache.has(text)) return encryptionCache.get(text);

    const encryptedChars = Object.values(encryptionMap);
    const textChars = [...text];
    const encryptedCharCount = textChars.filter(char => encryptedChars.includes(char)).length;

    const result = encryptedCharCount > textChars.length * 0.3;
    encryptionCache.set(text, result);
    return result;
}

function decryptMessage(encryptedText) {
    if (decryptionCache.has(encryptedText)) return decryptionCache.get(encryptedText);

    let result = '';
    let i = 0;
    while (i < encryptedText.length) {
        let found = false;
        for (const key of sortedDecryptKeys) {
            if (encryptedText.substring(i, i + key.length) === key) {
                result += decryptionMap[key];
                i += key.length;
                found = true;
                break;
            }
        }
        if (!found) {
            result += encryptedText[i];
            i += 1;
        }
    }

    decryptionCache.set(encryptedText, result);
    return result;
}

function createTranslateButton(messageElement, originalText) {
    const translateBtn = document.createElement('button');
    translateBtn.textContent = 'перевести';
    translateBtn.classList.add('translate-btn');

    translateBtn.addEventListener('click', function() {
        const decrypted = decryptMessage(originalText);
        const translationElement = document.createElement('div');
        translationElement.classList.add('translation');
        translationElement.textContent = decrypted;
        messageElement.insertAdjacentElement('afterend', translationElement);
        parseEmojis(translationElement);
        translateBtn.style.display = 'none';
    });

    return translateBtn;
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function updateRepliesOnEdit(originalMessageId, newContent) {
    const replies = document.querySelectorAll(`.reply-info[data-reply-to-id="${originalMessageId}"]`);
    replies.forEach(reply => {
        const textDiv = reply.querySelector('.reply-text');
        
        if(textDiv) {
            textDiv.textContent = newContent;
            parseEmojis(textDiv);
        }
    });
}

function updateRepliesOnDelete(deletedMessageId) {
    const replies = document.querySelectorAll(`.reply-info[data-reply-to-id="${deletedMessageId}"]`);
    replies.forEach(reply => {
        reply.classList.add('deleted');
        reply.innerHTML = '<span class="reply-content-deleted"><i class="fa-solid fa-ban"></i> Удаленное сообщение</span>';
        
        const imageIndicator = reply.querySelector('.reply-image-indicator');
        if (imageIndicator) imageIndicator.style.display = 'none';
        
        const fileIndicator = reply.querySelector('.reply-file-indicator');
        if (fileIndicator) fileIndicator.style.display = 'none';
        
        const textDiv = reply.querySelector('.reply-text');
        if (textDiv) textDiv.style.display = 'none';
    });
}

function updateMessageContent(messageId, newContent) {
    const messageWrapper = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageWrapper) return;

    let targetElement = messageWrapper.querySelector('.message-caption');
    if (!targetElement) {
        targetElement = messageWrapper.querySelector('.message.text');
    }

    if (targetElement) {
        const isEncrypted = isEncryptedMessage(newContent);
        
        targetElement.textContent = newContent;
        parseEmojis(targetElement);

        if (!targetElement.querySelector('.edited-label')) {
            const editedLabel = document.createElement('span');
            editedLabel.className = 'edited-label';
            editedLabel.textContent = ' (ред.)';
            targetElement.appendChild(editedLabel);
        }

        if (isEncrypted && !messageWrapper.classList.contains('my-message-wrapper')) {
            const existingBtn = messageWrapper.querySelector('.translate-btn');
            if (existingBtn) existingBtn.remove();
            const existingTranslation = messageWrapper.querySelector('.translation');
            if (existingTranslation) existingTranslation.remove();

            const translateBtn = createTranslateButton(targetElement, newContent);
            targetElement.appendChild(translateBtn);
        }
    }
}

function displayMessage(data, type) {
    const messageWrapper = document.createElement('div');
    
    if (data.type === 'info') {
        messageWrapper.classList.add('message-wrapper', 'system-message-wrapper');
    } else {
        messageWrapper.classList.add('message-wrapper', type === 'my-message' ? 'my-message-wrapper' : 'friend-message-wrapper');
    }

    const authorName = data.username || (type === 'my-message' ? clientId : 'Пользователь');
    messageWrapper.dataset.author = authorName;

    messageWrapper.dataset.messageId = data.messageId || `${clientId}-${messageCounter++}`;

    if (data.replyTo) {
        const replyInfo = document.createElement('div');
        replyInfo.className = 'reply-info';
        
        replyInfo.dataset.replyToId = data.replyTo.id; 
        
        const replyAuthor = document.createElement('span');
        replyAuthor.className = 'reply-author';
        replyAuthor.textContent = data.replyTo.author;
        replyInfo.appendChild(replyAuthor);

        if (data.replyTo.type === 'image') {
            const imageIndicator = document.createElement('div');
            imageIndicator.className = 'reply-image-indicator';
            imageIndicator.textContent = '📷 Изображение';
            replyInfo.appendChild(imageIndicator);
        } else if (data.replyTo.type === 'file') {
            const fileIndicator = document.createElement('div');
            fileIndicator.className = 'reply-file-indicator';
            fileIndicator.textContent = '📁 Файл';
            replyInfo.appendChild(fileIndicator);
        } else {
            const replyText = document.createElement('div');
            replyText.className = 'reply-text';
            replyText.textContent = data.replyTo.content;
            replyInfo.appendChild(replyText);
        }
        messageWrapper.appendChild(replyInfo);
    }

    let messageElement;
    let images = [];
    let files = [];

    if (data.type === 'image') {
        if (data.images && Array.isArray(data.images)) {
            images = data.images;
        } else if (data.content && data.content.startsWith('data:image')) {
             images = [{ content: data.content, isSpoiler: data.isSpoiler }];
        }
    } else if (data.type === 'file') {
        if (data.files && Array.isArray(data.files)) {
            files = data.files;
        } else if (data.content) {
            files = [{ content: data.content, name: data.name || 'file', size: data.size || 0 }];
        }
    }

    if (images.length > 0) {
        messageElement = document.createElement('div');
        messageElement.classList.add('message', 'message-image', type);
        
        const grid = document.createElement('div');
        grid.className = 'image-grid';
        grid.dataset.count = images.length > 9 ? 9 : images.length; 

        images.forEach(imgData => {
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'image-wrapper';

            const img = document.createElement('img');
            img.src = imgData.content;
            img.style.cursor = 'pointer';
            img.loading = 'lazy';
            if (imgData.isSpoiler) {
                img.classList.add('spoiler');
                img.dataset.isSpoiler = 'true';
            }
            
            imageWrapper.appendChild(img);
            grid.appendChild(imageWrapper);
        });

        messageElement.appendChild(grid);

        const textContent = data.text || (data.type === 'image' && !data.images ? data.text : null); 
        
        if (textContent) {
            const textDiv = document.createElement('div');
            textDiv.classList.add('message-caption');
            textDiv.textContent = textContent;
            
            parseEmojis(textDiv);
            
            if (type === 'friend-message' && isEncryptedMessage(textContent)) {
                 const translateBtn = createTranslateButton(textDiv, textContent);
                 textDiv.appendChild(translateBtn);
            }
            
            messageElement.appendChild(textDiv);
        }
    } else if (files.length > 0) {
        messageElement = document.createElement('div');
        messageElement.classList.add('message', type);
        
        files.forEach(f => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-message';
            
            fileDiv.innerHTML = `
                <div class="file-icon"><i class="fa-solid fa-file"></i></div>
                <div class="file-info">
                    <span class="file-name" title="${f.name}">${f.name}</span>
                    <span class="file-size">${(f.size / 1024).toFixed(1)} KB</span>
                </div>
                <a href="${f.content}" download="${f.name}" class="file-download-btn"><i class="fa-solid fa-download"></i></a>
            `;
            messageElement.appendChild(fileDiv);
        });

        if (data.text) {
            const textDiv = document.createElement('div');
            textDiv.className = 'message-caption';
            textDiv.style.paddingTop = '5px';
            textDiv.textContent = data.text;
            parseEmojis(textDiv);
            messageElement.appendChild(textDiv);
        }

    } else if (data.type === 'text' || data.type === 'info') {
        messageElement = document.createElement('div');
        
        if (data.type === 'info') {
             messageElement.classList.add('message', 'system-message');
        } else {
             messageElement.classList.add('message', 'text', type);
        }
        
        messageElement.textContent = data.content;
        
        if (data.type !== 'info') {
            parseEmojis(messageElement);
            if (data.type === 'text' && type === 'friend-message' && isEncryptedMessage(data.content)) {
                const translateBtn = createTranslateButton(messageElement, data.content);
                messageElement.appendChild(translateBtn);
            }
        }
    }

    if (messageElement) {
        messageWrapper.appendChild(messageElement);
        messagesContainer.appendChild(messageWrapper);
        scrollToBottom();
    }
}

function handleReply(messageWrapper) {
    if (editingMessageId) cancelEdit();

    const messageElement = messageWrapper.querySelector('.message');
    const isImage = messageElement.classList.contains('message-image');
    const isFile = messageElement.querySelector('.file-message');
    
    const authorName = messageWrapper.dataset.author || 'Пользователь';

    let replyContent = 'Изображение';
    let type = 'text';

    if (isImage) {
        type = 'image';
        const caption = messageElement.querySelector('.message-caption');
        if (caption) {
            replyContent = caption.textContent;
        }
    } else if (isFile) {
        type = 'file';
        replyContent = 'Файл';
        const caption = messageElement.querySelector('.message-caption');
        if (caption) {
            replyContent = caption.textContent;
        }
    } else {
        replyContent = messageElement.textContent.trim();
    }
    
    const messageData = {
        messageId: messageWrapper.dataset.messageId,
        author: authorName, 
        clientId: messageWrapper.classList.contains('my-message-wrapper') ? clientId : 'Пользователь', 
        type: type,
        content: replyContent
    };

    setReplyTo(messageData);
}

async function handleCopy(messageWrapper, copyBtn) {
    const messageElement = messageWrapper.querySelector('.message');
    const isImage = messageElement.classList.contains('message-image');
    
    try {
        if (isImage) {
            const img = messageElement.querySelector('img');
            const response = await fetch(img.src);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            showCopyFeedback(copyBtn, 'Скопировано');
        } else {
            const text = messageElement.textContent.replace(' (ред.)', '').replace('перевести', '').trim();
            await navigator.clipboard.writeText(text);
            showCopyFeedback(copyBtn, 'Скопировано');
        }
    } catch (err) {
        console.error(err);
        showCopyFeedback(copyBtn, 'Ошибка');
    }
}

function showCopyFeedback(button, message) {
    const originalHTML = button.innerHTML;
    button.innerHTML = `<i class="fa-solid fa-check"></i> ${message}`;
    button.style.pointerEvents = 'none';
    
    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.pointerEvents = 'auto';
    }, 1500);
}

messagesContainer.addEventListener('contextmenu', (event) => {
    const messageWrapper = event.target.closest('.message-wrapper');
    if (messageWrapper && !messageWrapper.classList.contains('system-message-wrapper')) {
        event.preventDefault();
        showEmojiPicker(event, messageWrapper);
    }
});

messagesContainer.addEventListener('dblclick', (event) => {
    const messageWrapper = event.target.closest('.message-wrapper');
    if (messageWrapper && !messageWrapper.classList.contains('system-message-wrapper') && !event.target.closest('img, a, button, .reactions-container')) {
        handleReply(messageWrapper);
    }
});

let toggleTimeout;
function toggleSendButton() {
    clearTimeout(toggleTimeout);
    toggleTimeout = setTimeout(() => {
        const hasText = messageInput.value.trim() !== '';
        const hasImages = stagedFiles.length > 0;
        sendButton.style.display = (hasText || hasImages) ? 'flex' : 'none';
        
        if (editingMessageId) {
            sendButton.innerHTML = '<i class="fa-solid fa-check"></i>';
        } else {
            sendButton.innerHTML = '<i class="fa-regular fa-paper-plane"></i>';
        }
    }, 50);
}

function renderPreview() {
    previewContainer.innerHTML = '';
    
    if (stagedFiles.length === 0) {
        previewContainer.style.display = 'none';
        return;
    }
    
    previewContainer.style.display = 'flex';

    stagedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.draggable = true;
        if (file.isSpoiler) item.classList.add('is-spoiler');
        item.dataset.index = index;

        if (file.type === 'image') {
            const img = document.createElement('img');
            img.src = file.content;
            if (file.isSpoiler) img.classList.add('spoiler-preview');
            item.appendChild(img);
        } else {
            const icon = document.createElement('div');
            icon.className = 'file-preview-icon';
            icon.innerHTML = '<i class="fa-solid fa-file"></i>';
            item.appendChild(icon);
        }
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-preview-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stagedFiles.splice(index, 1);
            renderPreview();
            toggleSendButton();
            if(stagedFiles.length === 0) focusMessageInput();
        });

        const spoilerIndicator = document.createElement('div');
        spoilerIndicator.className = 'spoiler-indicator';
        spoilerIndicator.textContent = 'SPOILER';

        item.appendChild(removeBtn);
        if (file.type === 'image') item.appendChild(spoilerIndicator);

        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
        if (file.type === 'image') {
            item.addEventListener('contextmenu', (e) => handlePreviewContextMenu(e, index));
        }

        previewContainer.appendChild(item);
    });
}

function handlePreviewContextMenu(e, index) {
    e.preventDefault();
    document.getElementById('preview-context-menu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'preview-context-menu';

    const file = stagedFiles[index];
    const hideButton = document.createElement('button');
    hideButton.textContent = file.isSpoiler ? 'Показать' : 'Спрятать под спойлер';
    hideButton.addEventListener('click', () => {
        file.isSpoiler = !file.isSpoiler;
        renderPreview();
        menu.remove();
    });

    menu.appendChild(hideButton);
    document.body.appendChild(menu);

    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    const closeHandler = () => {
        menu.remove();
        document.removeEventListener('click', closeHandler);
    };
    requestAnimationFrame(() => document.addEventListener('click', closeHandler));
}

let dragStartIndex;

function handleDragStart(e) {
    isInternalDrag = true;
    dragStartIndex = +this.dataset.index;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dragEndIndex = +this.dataset.index;
    if (dragStartIndex !== dragEndIndex) {
        swapItems(dragStartIndex, dragEndIndex);
    }
    this.classList.remove('dragging');
    isInternalDrag = false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
    isInternalDrag = false;
    renderPreview();
}

function swapItems(fromIndex, toIndex) {
    const itemToMove = stagedFiles[fromIndex];
    stagedFiles.splice(fromIndex, 1);
    stagedFiles.splice(toIndex, 0, itemToMove);
    renderPreview();
}

function clearStagedFiles() {
    stagedFiles = [];
    renderPreview();
    toggleSendButton();
}

function sendMessage() {
    const messageText = messageInput.value.trim();

    if (editingMessageId) {
        if (messageText !== '') {
            const editData = {
                type: 'edit',
                clientId: clientId,
                messageId: editingMessageId,
                content: messageText
            };
            socket.send(JSON.stringify(editData));
            updateMessageContent(editingMessageId, messageText);
            
            updateRepliesOnEdit(editingMessageId, messageText);
            
            cancelEdit();
        }
        return;
    }

    const messageId = `${clientId}-${messageCounter++}`;
    let messageData = {
        clientId: clientId,
        messageId: messageId,
        replyTo: replyToMessage || null
    };

    const images = stagedFiles.filter(f => f.type === 'image');
    const files = stagedFiles.filter(f => f.type === 'file');

    if (images.length > 0) {
        messageData = {
            ...messageData,
            type: 'image',
            images: images.map(f => ({ content: f.content, isSpoiler: f.isSpoiler })),
            text: messageText
        };
    } else if (files.length > 0) {
        messageData = {
            ...messageData,
            type: 'file',
            files: files.map(f => ({ content: f.content, name: f.name, size: f.size })),
            text: messageText
        };
    } else {
        if (messageText === '' && !replyToMessage) return;
        messageData = {
            ...messageData,
            type: 'text',
            content: messageText || '(пустое сообщение)'
        };
    }

    messageInput.value = '';
    clearStagedFiles();
    
    socket.send(JSON.stringify(messageData));
    displayMessage(messageData, 'my-message');

    if (replyToMessage) {
        cancelReply();
    }

    toggleSendButton();
    focusMessageInput();
}


sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('input', toggleSendButton);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        if (document.activeElement === messageInput || stagedFiles.length > 0 || replyToMessage || editingMessageId) {
            event.preventDefault();
            sendMessage();
        }
    } else if (event.key === 'Escape') {
        if (modal.style.display === 'flex') {
            closeModal();
        } else if (deleteModal.style.display === 'flex') {
            closeDeleteModal();
        } else if (editingMessageId) {
            cancelEdit();
        } else if (replyToMessage) {
            cancelReply();
        }
    } else if (modal.style.display === 'flex') {
        if (event.key === 'ArrowRight') {
            showNextImage();
        } else if (event.key === 'ArrowLeft') {
            showPrevImage();
        }
    }
});

messageInput.addEventListener('paste', async (event) => {
    const items = Array.from(event.clipboardData.items);
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
                await addFileToStage(file);
            }
        }
    }
});

inputArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isInternalDrag) {
        inputArea.classList.add('drag-over');
    }
});

inputArea.addEventListener('dragleave', () => {
    inputArea.classList.remove('drag-over');
});

inputArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    inputArea.classList.remove('drag-over');

    if (isInternalDrag) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            alert(`Файл ${file.name} слишком большой (макс 5MB)`);
            continue;
        }
        await addFileToStage(file);
    }
});

let currentScale = 1;
let isDragging = false;
let startPos = { x: 0, y: 0 };
let translatePos = { x: 0, y: 0 };

function openModal(imagesArray, startIndex = 0) {
    currentGalleryImages = imagesArray;
    currentGalleryIndex = startIndex;
    
    updateModalButtons();
    
    modal.style.display = 'flex';
    if (modalLoader) modalLoader.style.display = 'block';
    modalImg.style.opacity = '0';
    
    setTimeout(() => {
        modal.classList.add('modal-visible');
    }, 10);

    document.body.classList.add('modal-open');
    resetImageTransform();

    updateModalImage();
}

function updateModalImage() {
    modalImg.style.opacity = '0';
    resetImageTransform();
    
    const imageSrc = currentGalleryImages[currentGalleryIndex];
    
    const preloader = new Image();
    preloader.onload = () => {
        modalImg.src = imageSrc;
        if (modalLoader) modalLoader.style.display = 'none';
        modalImg.style.opacity = '1';
    };
    preloader.src = imageSrc;
}

function updateModalButtons() {
    if (currentGalleryImages.length > 1) {
        modalPrevBtn.style.display = 'flex';
        modalNextBtn.style.display = 'flex';
    } else {
        modalPrevBtn.style.display = 'none';
        modalNextBtn.style.display = 'none';
    }
}

function showNextImage() {
    if (currentGalleryImages.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
    updateModalImage();
}

function showPrevImage() {
    if (currentGalleryImages.length <= 1) return;
    currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    updateModalImage();
}

modalNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showNextImage();
});

modalPrevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPrevImage();
});

function closeModal() {
    modal.classList.remove('modal-visible');
    
    const handleTransitionEnd = () => {
        modal.style.display = 'none';
        modalImg.src = '';
        document.body.classList.remove('modal-open');
        modal.removeEventListener('transitionend', handleTransitionEnd);
        focusMessageInput();
    };
    
    modal.addEventListener('transitionend', handleTransitionEnd);
}

function updateImageTransform() {
    modalImg.style.transform = `translate(${translatePos.x}px, ${translatePos.y}px) scale(${currentScale})`;
}

function resetImageTransform() {
    currentScale = 1;
    translatePos = { x: 0, y: 0 };
    updateImageTransform();
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getDragLimits() {
    if (currentScale <= 1) return { x: 0, y: 0 };
    
    const imageWidth = modalImg.offsetWidth * currentScale;
    const imageHeight = modalImg.offsetHeight * currentScale;
    
    const limitX = (imageWidth - window.innerWidth) / 2;
    const limitY = (imageHeight - window.innerHeight) / 2;
    
    return {
        x: Math.max(0, limitX),
        y: Math.max(0, limitY)
    };
}

messagesContainer.addEventListener('click', function(event) {
    const img = event.target;
    if (img.tagName === 'IMG' && !img.closest('.reactions-container')) {
        event.preventDefault();
        if (img.classList.contains('spoiler')) {
            img.classList.remove('spoiler');
        } else {
            const grid = img.closest('.image-grid');
            if (grid) {
                const images = Array.from(grid.querySelectorAll('img')).map(i => i.src);
                const idx = images.indexOf(img.src);
                openModal(images, idx !== -1 ? idx : 0);
            } else {
                openModal([img.src], 0);
            }
        }
    }
});

closeModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => (event.target === modal) && closeModal());
modalImg.addEventListener('dblclick', resetImageTransform);

modal.addEventListener('wheel', (event) => {
    event.preventDefault();
    const zoomFactor = 0.15;
    const oldScale = currentScale;
    
    if (event.deltaY < 0) {
        currentScale = Math.min(currentScale + zoomFactor, 5);
    } else {
        currentScale = Math.max(currentScale - zoomFactor, 1);
    }
    
    if (oldScale !== currentScale) {
        const limits = getDragLimits();
        translatePos.x = clamp(translatePos.x, -limits.x, limits.x);
        translatePos.y = clamp(translatePos.y, -limits.y, limits.y);
        updateImageTransform();
    }
});

modalImg.addEventListener('mousedown', (event) => {
    if (currentScale <= 1) return;

    event.preventDefault();
    isDragging = true;
    startPos = {
        x: event.clientX - translatePos.x,
        y: event.clientY - translatePos.y
    };
    modalImg.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (event) => {
    if (isDragging) {
        if (currentScale <= 1) {
            isDragging = false;
            modalImg.style.cursor = 'grab';
            return;
        }

        const rawX = event.clientX - startPos.x;
        const rawY = event.clientY - startPos.y;
        
        const limits = getDragLimits();
        
        translatePos.x = clamp(rawX, -limits.x, limits.x);
        translatePos.y = clamp(rawY, -limits.y, limits.y);
        
        updateImageTransform();
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    modalImg.style.cursor = 'grab';
});

function focusMessageInput() {
    requestAnimationFrame(() => {
        messageInput.focus();
    });
}

document.addEventListener('click', (event) => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
        return;
    }

    const interactiveSelectors = [
        'button',
        'a',
        'input',
        '.emoji-picker',
        '.modal',
        'img',
        '.reactions-container',
        '#preview-context-menu',
        '.context-menu',
        '.modal-nav',
        '#delete-modal',
        '.auth-content',
        '.profile-content',
        '#side-menu',
        '#menu-btn',
        '.attach-menu',
        '#attach-btn'
    ];

    const isInteractive = interactiveSelectors.some(selector => event.target.closest(selector));

    if (!isInteractive && authModal.style.display === 'none') {
        focusMessageInput();
    }

    if (sidebar.classList.contains('expanded') && !sidebar.contains(event.target) && !menuBtn.contains(event.target)) {
        sidebar.classList.remove('expanded');
    }
});
