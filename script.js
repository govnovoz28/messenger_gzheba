// ВАЖНО: ЗАМЕНИТЕ АДРЕС В КАВЫЧКАХ НИЖЕ НА АДРЕС, КОТОРЫЙ ВЫДАСТ ХОСТИНГ (например: 'wss://my-chat.onrender.com')
// Обязательно используйте wss:// (это защищенное соединение)
const socket = new WebSocket('wss://ВАШ-САЙТ.onrender.com'); 

const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const cancelPreviewBtn = document.getElementById('cancel-preview-btn');

const replyPreview = document.getElementById('reply-preview');
const cancelReplyBtn = replyPreview.querySelector('.cancel-reply-btn');
const replyAuthorSpan = replyPreview.querySelector('.reply-author');
const replyTextDiv = replyPreview.querySelector('.reply-text');
const replyImageIndicator = replyPreview.querySelector('.reply-image-indicator');

const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-image');
const closeModalBtn = document.querySelector('.modal-close');
const modalLoader = document.getElementById('modal-loader');

const clientId = 'user-' + Date.now() + Math.random();

let stagedImage = null;
let isStagedImageSpoiler = false;
let messageCounter = 0;

let replyToMessage = null;

const localReactions = new Map();

const emojiCache = new Map();
const encryptionCache = new Map();
const decryptionCache = new Map();

function parseEmojis(element) {
    if (typeof twemoji !== 'undefined') {
        requestAnimationFrame(() => {
            twemoji.parse(element, {
                folder: 'svg',
                ext: '.svg',
                base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/',
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
    '😢', '🤔', '🤣', '🤝', '😐', '😨', '🥰', '😘',
    '🤬', '😭', '👎', '🤯', '😱', '🤮',
    '💩', '🏆', '🥱', '🙏🏻', '😴', '🖕🏻', '👀',
    '😎', '😈'
];

function setReplyTo(messageData) {
    replyToMessage = {
        id: messageData.messageId || messageData.id,
        author: messageData.clientId === clientId ? 'Вы' : 'Пользователь',
        content: messageData.content,
        type: messageData.type
    };

    replyAuthorSpan.textContent = `Ответ ${replyToMessage.author}`;

    if (replyToMessage.type === 'image') {
        replyTextDiv.style.display = 'none';
        replyImageIndicator.style.display = 'block';
    } else {
        replyTextDiv.textContent = replyToMessage.content;
        replyTextDiv.style.display = 'block';
        replyImageIndicator.style.display = 'none';
    }

    replyPreview.style.display = 'block';
    messageInput.placeholder = 'Ответить...';
    messageInput.focus();
}

function cancelReply() {
    replyToMessage = null;
    replyPreview.style.display = 'none';
    messageInput.placeholder = 'Сообщение...';
    messageInput.focus();
}

cancelReplyBtn.addEventListener('click', cancelReply);

function closeAllPopups() {
    document.querySelectorAll('.emoji-picker, .hide-spoiler-btn, .reply-btn').forEach(el => el.remove());
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
        expandButton.title = 'Показать все эмодзи';

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
            checkAndCreateButtons(messageWrapper, expandedPicker);
        });

        fragment.appendChild(expandButton);
        picker.appendChild(fragment);
        document.body.appendChild(picker);

        parseEmojis(picker);

        picker.style.left = `${event.pageX}px`;
        picker.style.top = `${event.pageY}px`;

        checkAndCreateButtons(messageWrapper, picker);

        const closeHandler = (e) => {
            if (!picker.contains(e.target) && !e.target.closest('.hide-spoiler-btn, .reply-btn')) {
                closeAllPopups();
                document.removeEventListener('click', closeHandler);
            }
        };

        requestAnimationFrame(() => document.addEventListener('click', closeHandler));
    }, 10);
}


function checkAndCreateButtons(messageWrapper, picker) {
    createReplyButton(messageWrapper, picker);

    const img = messageWrapper.querySelector('img[data-is-spoiler="true"]');
    if (img && !img.classList.contains('spoiler')) {
        createSpoilerButton(messageWrapper, picker);
    }
}

function createReplyButton(messageWrapper, picker) {
    document.querySelector('.reply-btn')?.remove();

    const replyBtn = document.createElement('button');
    replyBtn.className = 'reply-btn';
    replyBtn.innerHTML = '<i class="fa-solid fa-reply"></i> Ответить';
    document.body.appendChild(replyBtn);

    const pickerRect = picker.getBoundingClientRect();
    replyBtn.style.position = 'absolute';
    replyBtn.style.top = `${window.scrollY + pickerRect.bottom + 4}px`;
    replyBtn.style.left = `${window.scrollX + pickerRect.left + pickerRect.width / 2}px`;

    replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleReply(messageWrapper);
        closeAllPopups();
    });
}

function createSpoilerButton(messageWrapper, picker) {
    const img = messageWrapper.querySelector('img[data-is-spoiler="true"]');
    document.querySelector('.hide-spoiler-btn')?.remove();

    const hideButton = document.createElement('button');
    hideButton.className = 'hide-spoiler-btn';
    hideButton.textContent = 'Спрятать под спойлер';
    document.body.appendChild(hideButton);

    const pickerRect = picker.getBoundingClientRect();
    const replyBtn = document.querySelector('.reply-btn');
    let topOffset = pickerRect.bottom + 4;

    if (replyBtn) {
        topOffset = replyBtn.getBoundingClientRect().bottom + 4;
    }

    hideButton.style.position = 'absolute';
    hideButton.style.top = `${window.scrollY + topOffset}px`;
    hideButton.style.left = `${window.scrollX + pickerRect.left + pickerRect.width / 2}px`;

    hideButton.addEventListener('click', (e) => {
        e.stopPropagation();
        img.classList.add('spoiler');
        closeAllPopups();
    });
}

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
            reaction.innerHTML = `${count > 1 ? count : ''} <span class="emoji-in-reaction">${emoji}</span>`;

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

function displayMessage(data, type) {
    const messageWrapper = document.createElement('div');
    messageWrapper.classList.add('message-wrapper', type === 'my-message' ? 'my-message-wrapper' : 'friend-message-wrapper');
    messageWrapper.dataset.messageId = data.messageId || `${clientId}-${messageCounter++}`;

    if (data.replyTo) {
        const replyInfo = document.createElement('div');
        replyInfo.className = 'reply-info';
        const replyAuthor = document.createElement('span');
        replyAuthor.className = 'reply-author';
        replyAuthor.textContent = data.replyTo.author;
        replyInfo.appendChild(replyAuthor);

        if (data.replyTo.type === 'image') {
            const imageIndicator = document.createElement('div');
            imageIndicator.className = 'reply-image-indicator';
            imageIndicator.textContent = '📷 Изображение';
            replyInfo.appendChild(imageIndicator);
        } else {
            const replyText = document.createElement('div');
            replyText.className = 'reply-text';
            replyText.textContent = data.replyTo.content;
            replyInfo.appendChild(replyText);
        }
        messageWrapper.appendChild(replyInfo);
    }

    let messageElement;
    if (data.type === 'image') {
        messageElement = document.createElement('div');
        messageElement.classList.add('message', 'message-image');
        const img = document.createElement('img');
        img.src = data.content;
        img.style.cursor = 'pointer';
        img.loading = 'lazy';
        if (data.isSpoiler) {
            img.classList.add('spoiler');
            img.dataset.isSpoiler = 'true';
        }
        messageElement.appendChild(img);
    } else if (data.type === 'text' || data.type === 'info') {
        messageElement = document.createElement('div');
        messageElement.classList.add('message', type);
        messageElement.textContent = data.content;
        parseEmojis(messageElement);
        if (data.type === 'text' && type === 'friend-message' && isEncryptedMessage(data.content)) {
            const translateBtn = createTranslateButton(messageElement, data.content);
            messageElement.appendChild(translateBtn);
        }
    }

    if (messageElement) {
        messageWrapper.appendChild(messageElement);
        messagesContainer.appendChild(messageWrapper);
        scrollToBottom();
    }
}

function handleReply(messageWrapper) {
    const messageElement = messageWrapper.querySelector('.message');
    const isImage = messageElement.classList.contains('message-image');
    
    const messageData = {
        messageId: messageWrapper.dataset.messageId,
        clientId: messageWrapper.classList.contains('my-message-wrapper') ? clientId : 'other-user',
        type: isImage ? 'image' : 'text',
        content: isImage ? 'Изображение' : messageElement.textContent.trim()
    };
    
    setReplyTo(messageData);
}

messagesContainer.addEventListener('contextmenu', (event) => {
    const messageWrapper = event.target.closest('.message-wrapper');
    if (messageWrapper) {
        event.preventDefault();
        showEmojiPicker(event, messageWrapper);
    }
});

messagesContainer.addEventListener('dblclick', (event) => {
    const messageWrapper = event.target.closest('.message-wrapper');
    if (messageWrapper && !event.target.closest('img, a, button, .reactions-container')) {
        handleReply(messageWrapper);
    }
});

let toggleTimeout;
function toggleSendButton() {
    clearTimeout(toggleTimeout);
    toggleTimeout = setTimeout(() => {
        const hasText = messageInput.value.trim() !== '';
        const hasImage = stagedImage !== null;
        sendButton.style.display = (hasText || hasImage) ? 'flex' : 'none';
    }, 50);
}

socket.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (data.clientId === clientId) return;

        if (data.type === 'reaction') {
            handleReactionFromServer(data);
        } else {
            displayMessage(data, 'friend-message');
        }
    } catch (error) {
        console.error('Ошибка парсинга JSON:', error);
    }
};

socket.onclose = () => {
    displayMessage({ type: 'info', content: 'Вы были отключены от чата.' }, 'friend-message');
};

socket.onerror = (error) => {
    console.error('Ошибка WebSocket:', error);
};

function showImagePreview(imageBase64) {
    stagedImage = imageBase64;
    previewImage.src = imageBase64;
    previewContainer.style.display = 'flex';
    isStagedImageSpoiler = false;
    previewImage.classList.remove('spoiler');
    toggleSendButton();
}

function cancelImagePreview() {
    stagedImage = null;
    isStagedImageSpoiler = false;
    previewContainer.style.display = 'none';
    previewImage.classList.remove('spoiler');
    messageInput.value = '';
    toggleSendButton();
    focusMessageInput();
}

function sendMessage() {
    const messageId = `${clientId}-${messageCounter++}`;
    let messageData = {
        clientId: clientId,
        messageId: messageId,
        replyTo: replyToMessage || null
    };

    if (stagedImage) {
        messageData = {
            ...messageData,
            type: 'image',
            content: stagedImage,
            isSpoiler: isStagedImageSpoiler
        };
        cancelImagePreview();
    } else {
        const messageText = messageInput.value.trim();
        if (messageText === '' && !replyToMessage) return;
        messageData = {
            ...messageData,
            type: 'text',
            content: messageText || '(пустое сообщение)'
        };
        messageInput.value = '';
    }
    
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
        if (document.activeElement === messageInput || stagedImage || replyToMessage) {
            event.preventDefault();
            sendMessage();
        }
    } else if (event.key === 'Escape') {
        if (modal.style.display === 'flex') {
            closeModal();
        } else if (replyToMessage) {
            cancelReply();
        }
    }
});

messageInput.addEventListener('paste', (event) => {
    const item = Array.from(event.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => showImagePreview(e.target.result);
            reader.readAsDataURL(file);
        }
    }
});

cancelPreviewBtn.addEventListener('click', cancelImagePreview);

previewContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    document.getElementById('preview-context-menu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'preview-context-menu';

    const hideButton = document.createElement('button');
    hideButton.textContent = isStagedImageSpoiler ? 'Показать' : 'Спрятать под спойлер';
    hideButton.addEventListener('click', () => {
        isStagedImageSpoiler = !isStagedImageSpoiler;
        previewImage.classList.toggle('spoiler', isStagedImageSpoiler);
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
});


let currentScale = 1;
let isDragging = false;
let startPos = { x: 0, y: 0 };
let translatePos = { x: 0, y: 0 };

function openModal(imageSrc) {
    modal.style.display = 'flex';
    if (modalLoader) modalLoader.style.display = 'block';
    modalImg.style.opacity = '0';
    
    setTimeout(() => {
        modal.classList.add('modal-visible');
    }, 10);

    document.body.classList.add('modal-open');
    resetImageTransform();

    const preloader = new Image();
    
    preloader.onload = () => {
        modalImg.src = imageSrc;
        if (modalLoader) modalLoader.style.display = 'none';
        modalImg.style.opacity = '1';
    };
    
    preloader.src = imageSrc;
}

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
    modalImg.style.transform = `scale(${currentScale}) translate(${translatePos.x}px, ${translatePos.y}px)`;
}

function resetImageTransform() {
    currentScale = 1;
    translatePos = { x: 0, y: 0 };
    updateImageTransform();
}

messagesContainer.addEventListener('click', function(event) {
    const img = event.target;
    if (img.tagName === 'IMG' && !img.closest('.reactions-container')) {
        event.preventDefault();
        if (img.classList.contains('spoiler')) {
            img.classList.remove('spoiler');
        } else {
            openModal(img.src);
        }
    }
});

closeModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => (event.target === modal) && closeModal());
modalImg.addEventListener('dblclick', resetImageTransform);

modal.addEventListener('wheel', (event) => {
    event.preventDefault();
    const zoomFactor = 0.1;
    const rect = modalImg.getBoundingClientRect();
    const offsetX = (event.clientX - rect.left) / currentScale;
    const offsetY = (event.clientY - rect.top) / currentScale;
    
    const scale = currentScale;
    currentScale = event.deltaY < 0 ? Math.min(scale + zoomFactor, 5) : Math.max(scale - zoomFactor, 0.5);

    translatePos.x += (offsetX * (scale - currentScale));
    translatePos.y += (offsetY * (scale - currentScale));

    updateImageTransform();
});

modalImg.addEventListener('mousedown', (event) => {
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
        translatePos.x = event.clientX - startPos.x;
        translatePos.y = event.clientY - startPos.y;
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
    const interactiveSelectors = [
        'button',
        'a',
        'input',
        '.emoji-picker',
        '.modal',
        'img',
        '.reactions-container',
        '#preview-context-menu'
    ];

    const isInteractive = interactiveSelectors.some(selector => event.target.closest(selector));

    if (!isInteractive) {
        focusMessageInput();
    }
});