const socket = new WebSocket('wss://messenger-gzheba.onrender.com');

const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const previewContainer = document.getElementById('image-preview-container');

const replyPreview = document.getElementById('reply-preview');
const cancelReplyBtn = replyPreview.querySelector('.cancel-reply-btn');
const replyAuthorSpan = replyPreview.querySelector('.reply-author');
const replyTextDiv = replyPreview.querySelector('.reply-text');
const replyImageIndicator = replyPreview.querySelector('.reply-image-indicator');

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

const clientId = 'user-' + Date.now() + Math.random();

let stagedFiles = []; 
let messageCounter = 0;
let replyToMessage = null;
let currentGalleryImages = [];
let currentGalleryIndex = 0;

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
    '😢', '🤔', '🤣', '🤝', '👋🏻', '😐', '😨', '🥰', '😘',
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

    const copyBtn = document.createElement('button');
    copyBtn.className = 'context-btn';
    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Копировать';
    copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleCopy(messageWrapper, copyBtn);
        closeAllPopups();
    });
    menu.appendChild(copyBtn);

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
    let images = [];
    if (data.type === 'image') {
        if (data.images && Array.isArray(data.images)) {
            images = data.images;
        } else if (data.content && data.content.startsWith('data:image')) {
             images = [{ content: data.content, isSpoiler: data.isSpoiler }];
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
    
    let replyContent = 'Изображение';
    if (isImage) {
        const caption = messageElement.querySelector('.message-caption');
        if (caption) {
            replyContent = caption.textContent;
        }
    } else {
        replyContent = messageElement.textContent.trim();
    }
    
    const messageData = {
        messageId: messageWrapper.dataset.messageId,
        clientId: messageWrapper.classList.contains('my-message-wrapper') ? clientId : 'other-user',
        type: isImage && replyContent === 'Изображение' ? 'image' : 'text',
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
            const text = messageElement.textContent.trim();
            await navigator.clipboard.writeText(text);
            showCopyFeedback(copyBtn, 'Скопировано');
        }
    } catch (err) {
        console.error('Ошибка копирования:', err);
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
        const hasImages = stagedFiles.length > 0;
        sendButton.style.display = (hasText || hasImages) ? 'flex' : 'none';
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

function addImageToStage(imageBase64) {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    stagedFiles.push({
        id: id,
        content: imageBase64,
        isSpoiler: false
    });
    renderPreview();
    toggleSendButton();
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

        const img = document.createElement('img');
        img.src = file.content;
        if (file.isSpoiler) img.classList.add('spoiler-preview');
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-preview-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Удалить';
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

        item.appendChild(img);
        item.appendChild(removeBtn);
        item.appendChild(spoilerIndicator);

        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('contextmenu', (e) => handlePreviewContextMenu(e, index));

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
    const dragEndIndex = +this.dataset.index;
    swapItems(dragStartIndex, dragEndIndex);
    this.classList.remove('dragging');
}

function handleDragEnd() {
    this.classList.remove('dragging');
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
    const messageId = `${clientId}-${messageCounter++}`;
    let messageData = {
        clientId: clientId,
        messageId: messageId,
        replyTo: replyToMessage || null
    };

    const messageText = messageInput.value.trim();

    if (stagedFiles.length > 0) {
        messageData = {
            ...messageData,
            type: 'image',
            images: stagedFiles.map(f => ({ content: f.content, isSpoiler: f.isSpoiler })),
            text: messageText
        };
        clearStagedFiles();
    } else {
        if (messageText === '' && !replyToMessage) return;
        messageData = {
            ...messageData,
            type: 'text',
            content: messageText || '(пустое сообщение)'
        };
    }
    messageInput.value = '';
    
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
        if (document.activeElement === messageInput || stagedFiles.length > 0 || replyToMessage) {
            event.preventDefault();
            sendMessage();
        }
    } else if (event.key === 'Escape') {
        if (modal.style.display === 'flex') {
            closeModal();
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

messageInput.addEventListener('paste', (event) => {
    const items = Array.from(event.clipboardData.items);
    
    items.forEach(item => {
        if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => addImageToStage(e.target.result);
                reader.readAsDataURL(file);
            }
        }
    });
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
        '.modal-nav'
    ];

    const isInteractive = interactiveSelectors.some(selector => event.target.closest(selector));

    if (!isInteractive) {
        focusMessageInput();
    }
});
