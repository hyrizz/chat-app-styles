// DOM Elements
const searchInput = document.getElementById('searchInput');
const memberList = document.getElementById('memberList');
const recentChats = document.getElementById('recentChats');
const chatRoom = document.getElementById('chatRoom');
const chatList = document.getElementById('chatList');
const backBtn = document.getElementById('backBtn');
const chatName = document.getElementById('chatName');
const chatStatus = document.getElementById('chatStatus');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let selectedMember = null;
let selectedMessageElement = null;

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Kemarin';
    } else if (diffDays < 7) {
        return date.toLocaleDateString('id-ID', { weekday: 'long' });
    } else {
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    }
}

// Update unread count
function getUnreadCount(chatId, userId) {
    return new Promise((resolve) => {
        database.ref(`chats/${chatId}/messages`).once('value', (snapshot) => {
            let count = 0;
            snapshot.forEach((messageSnapshot) => {
                const message = messageSnapshot.val();
                if (message.receiverId === userId && !message.seen) {
                    count++;
                }
            });
            resolve(count);
        });
    });
}

// Load members
function loadMembers() {
    const membersRef = database.ref(packagename + '/balapan');
    membersRef.on('value', (snapshot) => {
        memberList.innerHTML = '';
        snapshot.forEach((childSnapshot) => {
            const member = childSnapshot.val();
            if (member.id_user !== currentUser.id) {
                const div = document.createElement('div');
                div.className = 'member-item d-flex align-items-center';
                div.innerHTML = `
                    <div class="member-avatar me-3">${member.nama_user.charAt(0)}</div>
                    <div>
                        <div class="fw-bold">${member.nama_user}</div>
                        <small class="text-muted">ID: ${member.id_user}</small>
                    </div>
                `;
                div.onclick = () => {
                    openChat(member);
                    memberList.classList.remove('active');
                    searchInput.value = '';
                };
                memberList.appendChild(div);
            }
        });
    });
}

// Load recent chats
async function loadRecentChats() {
    const chatsRef = database.ref('chats');
    chatsRef.on('value', async (snapshot) => {
        recentChats.innerHTML = '';
        const chats = [];
        
        snapshot.forEach((chatSnapshot) => {
            const chatData = chatSnapshot.val();
            if (chatData.lastMessage) {
                const [user1Id, user2Id] = chatSnapshot.key.split('_');
                if (user1Id === currentUser.id || user2Id === currentUser.id) {
                    chats.push({
                        chatId: chatSnapshot.key,
                        ...chatData
                    });
                }
            }
        });
        
        chats.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
        
        for (const chat of chats) {
            const [user1Id, user2Id] = chat.chatId.split('_');
            const memberId = user1Id === currentUser.id ? user2Id : user1Id;
            
            const memberSnapshot = await database.ref(`${packagename}/balapan/${memberId}`).once('value');
            const member = memberSnapshot.val();
            
            if (member) {
                const unreadCount = await getUnreadCount(chat.chatId, currentUser.id);
                const lastMessage = Object.values(chat.messages || {}).pop();
                
                const div = document.createElement('div');
                div.className = 'member-item d-flex align-items-center';
                div.innerHTML = `
                    <div class="member-avatar me-3">${member.nama_user.charAt(0)}</div>
                    <div class="preview-container">
                        <div class="fw-bold">${member.nama_user}</div>
                        <div class="preview-message">${lastMessage?.text || ''}</div>
                    </div>
                    <div class="d-flex flex-column align-items-end">
                        <div class="message-time">${formatTime(lastMessage?.timestamp)}</div>
                        ${unreadCount ? `<div class="unread-count">${unreadCount}</div>` : ''}
                    </div>
                `;
                div.onclick = () => openChat(member);
                recentChats.appendChild(div);
            }
        }
    });
}

// Load messages
function loadMessages() {
    if (!selectedMember) return;
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    const messagesRef = database.ref(`chats/${chatId}/messages`);
    
    messagesRef.on('value', (snapshot) => {
        messagesContainer.innerHTML = '';
        
        snapshot.forEach((messageSnapshot) => {
            const message = messageSnapshot.val();
            const messageKey = messageSnapshot.key;
            const isSent = message.senderId === currentUser.id;
            
            const div = document.createElement('div');
            div.className = `message ${isSent ? 'message-sent' : ''}`;
            div.dataset.messageKey = messageKey;
            
            // Buat container untuk konten pesan
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageContent.innerHTML = formatMessageText(message.text);
            
            // Buat container untuk waktu dan status
            const messageInfo = document.createElement('div');
            messageInfo.className = 'message-time';
            messageInfo.innerHTML = `
                ${formatTime(message.timestamp)}
                ${isSent ? `
                    <span class="message-status">
                        ${message.delivered 
                            ? (message.seen 
                                ? '<i class="fas fa-check-double seen"></i>' 
                                : '<i class="fas fa-check-double"></i>')
                            : '<i class="fas fa-check"></i>'}
                    </span>
                ` : ''}
            `;
            
            div.appendChild(messageContent);
            div.appendChild(messageInfo);
            
            messagesContainer.appendChild(div);
        });
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        markMessagesSeen();
        
        // Tambahkan interaksi setelah pesan dimuat
        addMessageInteraction();
    });
}



// Event listener untuk menutup blur
document.addEventListener('click', (e) => {
    // Jika klik di luar pesan
    if (!e.target.closest('.message[data-interactive="true"]')) {
        const messages = document.querySelectorAll('.message');
        messages.forEach(msg => {
            msg.classList.remove('message-blurred');
            const overlay = msg.querySelector('.message-overlay');
            if (overlay) overlay.remove();
        });
    }
});

// Mark messages as seen
function markMessagesSeen() {
    if (!selectedMember) return;
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    const messagesRef = database.ref(`chats/${chatId}/messages`);
    
    if (!document.hidden) {
        messagesRef.once('value', (snapshot) => {
            snapshot.forEach((messageSnapshot) => {
                const message = messageSnapshot.val();
                if (message.receiverId === currentUser.id && !message.seen) {
                    messageSnapshot.ref.update({ 
                        seen: true,
                        delivered: true 
                    });
                }
            });
        });
    }
}

// Send message
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !selectedMember) return;
    
    if (text.length > 3000) {
        alert('Pesan tidak boleh lebih dari 3000 karakter!');
        return;
    }
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    const messagesRef = database.ref(`chats/${chatId}/messages`);
    
    const messageData = {
        text: text,
        senderId: currentUser.id,
        receiverId: selectedMember.id_user,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        delivered: true,
        seen: false
    };
    
    messagesRef.push(messageData).then(() => {
        messageInput.value = '';
        updateCharacterCount();
        
        // Update last message
        database.ref(`chats/${chatId}/lastMessage`).set({
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
        });
    });
}

// Format message text
function formatMessageText(text) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlPattern, '<a href="$1" target="_blank">$1</a>').replace(/\n/g, '<br>');
}

// Update character count
function updateCharacterCount() {
    const count = messageInput.value.length;
    const countElement = document.querySelector('.character-count');
    if (count > 0) {
        countElement.textContent = `${count}/3000`;
        countElement.style.color = count > 3000 ? 'red' : '#667781';
    } else {
        countElement.textContent = '';
    }
}

// Open chat
function openChat(member) {
    selectedMember = member;
    chatName.textContent = member.nama_user;
    
    updateOnlineStatus(member.id_user, (statusText) => {
        chatStatus.innerHTML = statusText;
    });
    
    chatList.style.display = 'none';
    chatRoom.classList.add('active');
    loadMessages();
}

// Get chat ID
function getChatId(user1Id, user2Id) {
    return [user1Id, user2Id].sort().join('_');
}

// Update online status
function updateOnlineStatus(userId, callback) {
    const userStatusRef = database.ref(`users/${userId}`);
    userStatusRef.on('value', (snapshot) => {
        const status = snapshot.val();
        if (status) {
            const statusText = status.online 
                ? '<span class="online-status active">online</span>'
                : `<span class="online-status">${formatLastSeen(status.lastSeen)}</span>`;
            callback(statusText);
        }
    });
}

// Format last seen
function formatLastSeen(timestamp) {
    if (!timestamp) return '';
    
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diff = now - lastSeen;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) {
        return `terakhir dilihat ${minutes} menit yang lalu`;
    } else if (hours < 24) {
        return `terakhir dilihat ${hours} jam yang lalu`;
    } else {
        return `terakhir dilihat ${days} hari yang lalu`;
    }
}

// Event listeners
searchInput.addEventListener('focus', () => {
    memberList.classList.add('active');
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !memberList.contains(e.target)) {
        memberList.classList.remove('active');
    }
});



searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    Array.from(memberList.children).forEach(item => {
        const name = item.querySelector('.fw-bold').textContent.toLowerCase();
        const id = item.querySelector('.text-muted').textContent.toLowerCase();
        const isMatch = name.includes(searchTerm) || id.includes(searchTerm);
        item.style.display = isMatch ? '' : 'none';
    });
});

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
    updateCharacterCount();
});

sendBtn.onclick = sendMessage;

messageInput.onkeypress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    // Hapus kondisi lain agar spasi bisa digunakan
};

backBtn.onclick = () => {
    chatRoom.classList.remove('active');
    chatList.style.display = 'flex';
    selectedMember = null;
    
    if (selectedMember) {
        const chatId = getChatId(currentUser.id, selectedMember.id_user);
        database.ref(`chats/${chatId}/messages`).off();
    }
};

// Handle visibility change for online status
document.addEventListener('visibilitychange', () => {
    const userStatusRef = database.ref(`users/${currentUser.id}`);
    
    if (document.hidden) {
        userStatusRef.update({
            online: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        userStatusRef.update({
            online: true
        });
        if (selectedMember) {
            markMessagesSeen();
        }
    }
});

// Initialize
loadMembers();
loadRecentChats();

// Set initial online status
const userStatusRef = database.ref(`users/${currentUser.id}`);
userStatusRef.onDisconnect().update({
    online: false,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
});

userStatusRef.update({
    name: currentUser.name,
    online: true
});

// Handle unread messages
function markAsDelivered(chatId) {
    database.ref(`chats/${chatId}/messages`).once('value', (snapshot) => {
        snapshot.forEach((messageSnapshot) => {
            const message = messageSnapshot.val();
            if (message.receiverId === currentUser.id && !message.delivered) {
                messageSnapshot.ref.update({ delivered: true });
            }
        });
    });
}

// Handle message options
function copyMessage(messageId) {
    if (!selectedMember) return;
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    database.ref(`chats/${chatId}/messages/${messageId}`).once('value', (snapshot) => {
        const message = snapshot.val();
        if (message) {
            navigator.clipboard.writeText(message.text).then(() => {
                alert('Pesan disalin ke clipboard');
            });
        }
    });
}

function deleteMessage(messageId) {
    if (!selectedMember) return;
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    database.ref(`chats/${chatId}/messages/${messageId}`).remove();
}

// Handle auto resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// Handle scroll to load more messages
let isLoadingMore = false;
let firstMessageKey = null;

messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop === 0 && !isLoadingMore && selectedMember) {
        loadMoreMessages();
    }
});

function loadMoreMessages() {
    if (!selectedMember || isLoadingMore) return;
    
    isLoadingMore = true;
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    const messagesRef = database.ref(`chats/${chatId}/messages`);
    
    const query = messagesRef.orderByKey().endAt(firstMessageKey).limitToLast(20);
    
    query.once('value', (snapshot) => {
        const messages = [];
        snapshot.forEach(child => {
            messages.unshift({
                key: child.key,
                ...child.val()
            });
        });
        
        if (messages.length > 1) {
            firstMessageKey = messages[0].key;
            messages.forEach(message => {
                // Add message to top of container
                const messageElement = createMessageElement(message);
                messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
            });
        }
        
        isLoadingMore = false;
    });
}

// Function to create message element

function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message ${message.senderId === currentUser.id ? 'message-sent' : ''}`;
    div.dataset.messageKey = message.key;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = formatMessageText(message.text);
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-time';
    messageInfo.innerHTML = `
        ${formatTime(message.timestamp)}
        ${message.senderId === currentUser.id ? `
            <span class="message-status">
                ${message.delivered 
                    ? (message.seen 
                        ? '<i class="fas fa-check-double seen"></i>' 
                        : '<i class="fas fa-check-double"></i>')
                    : '<i class="fas fa-check"></i>'}
            </span>
        ` : ''}
    `;
    
    div.appendChild(messageContent);
    div.appendChild(messageInfo);
    
    // Tambahkan event listener untuk memilih pesan
    div.addEventListener('click', (e) => {
        // Jika sudah ada pesan yang dipilih, kembalikan ke keadaan semula
        if (selectedMessageElement) {
            selectedMessageElement.classList.remove('message-selected');
            const existingOverlay = selectedMessageElement.querySelector('.message-interaction-overlay');
            if (existingOverlay) {
                existingOverlay.remove();
            }
        }
        
        // Jika pesan yang sama diklik, batalkan pemilihan
        if (selectedMessageElement === div) {
            selectedMessageElement = null;
            return;
        }
        
        // Tambahkan opsi interaksi pada pesan
        addMessageInteraction(div, message);
    });
    
    return div;
}

document.addEventListener('click', (e) => {
    if (selectedMessageElement && 
        !selectedMessageElement.contains(e.target) && 
        !e.target.closest('.message-interaction-overlay')) {
        selectedMessageElement.classList.remove('message-selected');
        const overlay = selectedMessageElement.querySelector('.message-interaction-overlay');
        if (overlay) {
            overlay.remove();
        }
        selectedMessageElement = null;
    }
});
// Handle typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!selectedMember) return;
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    const typingRef = database.ref(`chats/${chatId}/typing/${currentUser.id}`);
    
    typingRef.set(true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingRef.remove();
    }, 3000);
});

// Listen for typing status
function listenForTyping() {
    if (!selectedMember) return;
    
    const chatId = getChatId(currentUser.id, selectedMember.id_user);
    const typingRef = database.ref(`chats/${chatId}/typing/${selectedMember.id_user}`);
    
    typingRef.on('value', (snapshot) => {
        const isTyping = snapshot.val();
        if (isTyping) {
            chatStatus.innerHTML = '<span class="online-status">mengetik...</span>';
        } else {
            updateOnlineStatus(selectedMember.id_user, (status) => {
                chatStatus.innerHTML = status;
            });
        }
    });
}

// Clean up function
function cleanUp() {
    if (selectedMember) {
        const chatId = getChatId(currentUser.id, selectedMember.id_user);
        database.ref(`chats/${chatId}/messages`).off();
        database.ref(`chats/${chatId}/typing/${selectedMember.id_user}`).off();
    }
    database.ref(`users/${currentUser.id}`).off();
    userStatusRef.off();
}
function addMessageInteraction() {
    const messages = document.querySelectorAll('.message');
    
    messages.forEach(message => {
        // Tambahkan penanda untuk interaksi
        message.setAttribute('data-interactive', 'true');
        
        message.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Hapus seluruh overlay sebelumnya
            document.querySelectorAll('.message-overlay').forEach(el => el.remove());
            
            // Buat overlay opsi
            const overlay = document.createElement('div');
            overlay.className = 'message-overlay';
            overlay.innerHTML = `
                <div class="message-overlay-content">
                    <button class="btn-copy">
                        <i class="fas fa-copy"></i> Salin Pesan
                    </button>
                    <button class="btn-delete">
                        <i class="fas fa-trash"></i> Hapus Pesan
                    </button>
                </div>
            `;
            
            // Tambahkan overlay ke pesan
            this.appendChild(overlay);
            
            // Blur seluruh pesan kecuali pesan ini
            messages.forEach(msg => {
                if (msg !== this) {
                    msg.classList.add('message-blurred');
                }
            });
            
            // Tombol salin
            const copyBtn = overlay.querySelector('.btn-copy');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageContent = this.querySelector('.message-content').textContent;
                navigator.clipboard.writeText(messageContent).then(() => {
                    showNotification('Pesan berhasil disalin!');
                });
            });
            
            // Tombol hapus
            const deleteBtn = overlay.querySelector('.btn-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!selectedMember) return;
                
                const messageKey = this.dataset.messageKey;
                const chatId = getChatId(currentUser.id, selectedMember.id_user);
                
                // Hapus pesan dari database
                database.ref(`chats/${chatId}/messages/${messageKey}`).remove().then(() => {
                    showNotification('Pesan berhasil dihapus!');
                });
            });
        });
    });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'custom-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 500);
    }, 2000);
}

// Fungsi untuk menampilkan notifikasi berhasil disalin
function showCopiedNotification() {
    const notification = document.createElement('div');
    notification.className = 'copied-notification';
    notification.innerHTML = `
        <i class="fas fa-copy"></i>
        Pesan berhasil disalin!
    `;
    document.body.appendChild(notification);

    notification.offsetWidth;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 2000);
}

function addMessageBlurInteraction() {
    const messages = document.querySelectorAll('.message');
    
    messages.forEach(message => {
        message.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Hapus semua blur sebelumnya
            document.body.classList.remove('messages-blurred');
            document.querySelectorAll('.message-focused').forEach(el => {
                el.classList.remove('message-focused');
                const overlay = el.querySelector('.message-options-overlay');
                if (overlay) overlay.remove();
            });
            
            // Tambahkan blur dan fokus pada pesan yang dipilih
            document.body.classList.add('messages-blurred');
            this.classList.add('message-focused');
            
            // Buat overlay opsi
            const overlay = document.createElement('div');
            overlay.className = 'message-options-overlay';
            overlay.innerHTML = `
                <div class="message-option-buttons">
                    <button class="btn-copy-message">
                        <i class="fas fa-copy"></i> Salin
                    </button>
                    <button class="btn-delete-message">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </div>
            `;

            // Tambahkan overlay ke pesan
            this.appendChild(overlay);

            // Event listener untuk tombol salin
            overlay.querySelector('.btn-copy-message').addEventListener('click', () => {
                const messageText = this.querySelector('.message-content').textContent;
                navigator.clipboard.writeText(messageText).then(() => {
                    showCopiedNotification();
                });
            });

            // Event listener untuk tombol hapus
            overlay.querySelector('.btn-delete-message').addEventListener('click', () => {
                const messageKey = this.dataset.messageKey;
                if (!selectedMember) return;
                
                const chatId = getChatId(currentUser.id, selectedMember.id_user);
                database.ref(`chats/${chatId}/messages/${messageKey}`).remove();
            });
        });
    });

    // Tambahkan event listener untuk menutup blur
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message-focused')) {
            document.body.classList.remove('messages-blurred');
            document.querySelectorAll('.message-focused').forEach(el => {
                el.classList.remove('message-focused');
                const overlay = el.querySelector('.message-options-overlay');
                if (overlay) overlay.remove();
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    addMessageBlurInteraction();
});

// Handle page unload
window.addEventListener('unload', cleanUp);
