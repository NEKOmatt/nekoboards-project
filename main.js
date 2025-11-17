// Главный JavaScript файл для NEKOboards
console.log("Главный скрипт (main.js) загружен!");

document.addEventListener('DOMContentLoaded', () => {

    const supabase = window.supabaseClient;
    
    let roomSubscription = null;
    
    // (ИЗМЕНЕНИЕ) Канал для подписки на статусы друзей
    let friendStatusChannel = null;

    // ===================================================================
    // 1. ЛОГИКА САЙДБАРА И ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК
    // ===================================================================
    // (Без изменений)
    
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const body = document.body; 
    const homeNavLink = document.getElementById('home-nav-link');
    const friendsNavLink = document.getElementById('friends-nav-link');
    const homeContainer = document.getElementById('home-container');
    const friendsContainer = document.getElementById('friends-container');
    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        sidebar.classList.toggle('active');   
        body.classList.toggle('sidebar-open');
    });
    homeNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        homeContainer.classList.remove('hidden');
        friendsContainer.classList.add('hidden');
        homeNavLink.classList.add('active');
        friendsNavLink.classList.remove('active');
        menuToggle.classList.remove('active');
        sidebar.classList.remove('active');   
        body.classList.remove('sidebar-open');
    });
    friendsNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        homeContainer.classList.add('hidden');
        friendsContainer.classList.remove('hidden');
        homeNavLink.classList.remove('active');
        friendsNavLink.classList.add('active');
        menuToggle.classList.remove('active');
        sidebar.classList.remove('active');   
        body.classList.remove('sidebar-open');
    });


    // ===================================================================
    // 2. ОТСЛЕЖИВАНИЕ СОСТОЯНИЯ АУТЕНТИФИКАЦИИ (Supabase)
    // ===================================================================

    const welcomeMessage = document.getElementById('welcome-message');
    const showLoginBtn = document.getElementById('show-login-btn');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const userProfileDisplay = document.getElementById('user-profile-display');
    const userProfileName = document.getElementById('user-profile-name');
    const userProfileInitial = document.getElementById('user-profile-initial');
    const logoutBtn = document.getElementById('logout-btn');

    const roomListElement = document.getElementById('room-list');

    // (ИЗМЕНЕНИЕ) Рендер списка комнат из Supabase
    const renderRoomList = (rooms) => {
        roomListElement.innerHTML = ''; 

        if (!rooms || rooms.length === 0) {
            roomListElement.innerHTML = `
                <div class="room-item-placeholder">
                    <p>Пока нет открытых комнат. Создайте первую!</p>
                </div>
            `;
            return;
        }

        rooms.forEach(room => {
            let playerCount = 0;
            if (room.players) {
                try {
                    const playersObj = (typeof room.players === 'string') 
                        ? JSON.parse(room.players) 
                        : room.players;
                    playerCount = Object.keys(playersObj).length;
                } catch (e) {
                    console.error("Ошибка парсинга JSON игроков:", e);
                }
            }

            const roomItem = document.createElement('div');
            roomItem.classList.add('room-item');
            roomItem.dataset.roomId = room.id; 

            let gameIcon = 'fa-question-circle'; 
            if (room.game === 'tic-tac-toe') {
                gameIcon = 'fa-border-all';
            }
            if (room.game === 'who-guess') {
                gameIcon = 'fa-question-circle';
            }

            roomItem.innerHTML = `
                <div class="room-item-left">
                    <i class="fas ${gameIcon} room-game-icon"></i>
                    <div class="room-details">
                        <span class="room-name">${room.room_name}</span>
                        <span class="room-creator">Создатель: ${room.creator_name}</span>
                    </div>
                </div>
                <div class="room-item-right">
                    <span class="room-players">
                        <i class="fas fa-users"></i>
                        ${playerCount} / ${room.max_players}
                    </span>
                    <button class="join-btn" ${playerCount >= room.max_players ? 'disabled' : ''}>
                        ${playerCount >= room.max_players ? 'Заполнено' : 'Войти'}
                    </button>
                </div>
            `;
            roomListElement.appendChild(roomItem);
        });
    };

    // (ИЗМЕНЕНИЕ) Подписка на комнаты (Realtime)
    const listenForRooms = async () => {
        console.log("Начинаем слушать комнаты (Supabase Realtime)...");

        // Сначала загружаем текущий список
        loadInitialWaitingRooms();
        
        if (roomSubscription) {
            roomSubscription.unsubscribe(); 
        }
        
        roomSubscription = supabase.channel('public:rooms')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'rooms' }, 
                (payload) => {
                    console.log('Realtime: комнаты изменились!', payload);
                    // Просто перезагружаем ВЕСЬ список
                    loadInitialWaitingRooms();
                }
            )
            .subscribe();
    };
    
    // (ИЗМЕНЕНИЕ) Вспомогательная функция для обновления списка комнат
    const loadInitialWaitingRooms = async () => {
         try {
            const { data: rooms, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting');
            if (error) throw error;
            renderRoomList(rooms);
         } catch (error) {
            console.error("Ошибка обновления списка комнат:", error);
         }
    };


    const stopListeningForRooms = () => {
        console.log("Прекращаем слушать комнаты (Supabase).");
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
        }
        roomListElement.innerHTML = ''; 
    };


    const updateUIforUser = async (session) => {
        const user = session?.user; 

        if (user) {
            console.log("Пользователь вошел (Supabase):", user.id);
            
            welcomeMessage.classList.add('hidden');
            homeContainer.classList.remove('hidden');
            showLoginBtn.classList.add('hidden');
            showRegisterBtn.classList.add('hidden');
            userProfileDisplay.classList.remove('hidden');

            try {
                await supabase
                    .from('profiles')
                    .update({ status: 'online' })
                    .eq('id', user.id);
            } catch (error) {
                console.error("Ошибка обновления статуса:", error);
            }
            
            listenForRooms(); 

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', user.id)
                    .single(); 

                if (error) throw error;

                const username = data.username || user.email;
                window.currentUser = {
                    uid: user.id, 
                    username: username
                };

                userProfileName.textContent = username;
                userProfileInitial.textContent = username.charAt(0).toUpperCase(); 
                
                // (ИЗМЕНЕНИЕ) Теперь эта функция работает!
                listenForFriends(user.id);

            } catch (error) {
                console.error("Ошибка при получении профиля:", error);
                window.currentUser = { uid: user.id, username: user.email };
                userProfileName.textContent = user.email;
                userProfileInitial.textContent = user.email.charAt(0).toUpperCase();
            }

        } else {
            console.log("Пользователь не вошел.");
            
            welcomeMessage.classList.remove('hidden');
            homeContainer.classList.add('hidden');
            friendsContainer.classList.add('hidden');
            showLoginBtn.classList.remove('hidden');
            showRegisterBtn.classList.remove('hidden');
            userProfileDisplay.classList.add('hidden');

            stopListeningForRooms();
            // (ИЗМЕНЕНИЕ) Теперь эта функция работает!
            stopListeningForFriends();
            window.currentUser = null;
        }
    };

    supabase.auth.onAuthStateChange((event, session) => {
        console.log(`Supabase Auth Event: ${event}`, session);
        
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            updateUIforUser(session);
        } else if (event === 'SIGNED_OUT') {
            updateUIforUser(null);
        }
    });

    logoutBtn.addEventListener('click', async () => {
        if (confirm("Вы уверены, что хотите выйти?")) {
            
            if (window.currentUser) {
                try {
                    await supabase
                        .from('profiles')
                        .update({ status: 'offline' })
                        .eq('id', window.currentUser.uid);
                } catch (error) {
                    console.error("Ошибка обновления статуса:", error);
                }
            }
            
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                console.log("Пользователь вышел (Supabase).");
            } catch (error) {
                console.error("Ошибка выхода:", error);
                alert("Ошибка выхода: " + error.message);
            }
        }
    });


    // ===================================================================
    // 3. ЛОГИКА МОДАЛЬНОГО ОКНА "СОЗДАТЬ КОМНАТУ"
    // ===================================================================
    // (Без изменений)

    const showCreateRoomBtn = document.getElementById('show-create-room-btn');
    const createRoomModalOverlay = document.getElementById('create-room-modal-overlay');
    const closeCreateRoomModalBtn = document.getElementById('close-create-room-modal-btn');
    const createRoomForm = document.getElementById('create-room-form');
    const gameSelectRadios = document.querySelectorAll('input[name="game-select"]');
    const ticTacToeOptions = document.getElementById('tic-tac-toe-options');
    const whoGuessOptions = document.getElementById('who-guess-options');
    const categoryHeaders = document.querySelectorAll('.category-header');
    const openCreateRoomModal = () => {
        createRoomModalOverlay.classList.remove('hidden');
        document.querySelector('input[name="game-select"][value="tic-tac-toe"]').checked = true;
        updateGameOptionsInModal();
    };
    const closeCreateRoomModal = () => {
        createRoomModalOverlay.classList.add('hidden');
    };
    showCreateRoomBtn.addEventListener('click', openCreateRoomModal);
    closeCreateRoomModalBtn.addEventListener('click', closeCreateRoomModal);
    createRoomModalOverlay.addEventListener('click', (e) => {
        if (e.target === createRoomModalOverlay) {
            closeCreateRoomModal();
        }
    });
    const updateGameOptionsInModal = () => {
        const selectedGame = document.querySelector('input[name="game-select"]:checked').value;
        if (selectedGame === 'tic-tac-toe') {
            ticTacToeOptions.classList.remove('hidden');
            whoGuessOptions.classList.add('hidden');
        } else if (selectedGame === 'who-guess') {
            ticTacToeOptions.classList.add('hidden');
            whoGuessOptions.classList.remove('hidden');
        } else {
            ticTacToeOptions.classList.add('hidden');
            whoGuessOptions.classList.add('hidden');
        }
    };
    gameSelectRadios.forEach(radio => {
        radio.addEventListener('change', updateGameOptionsInModal);
    });
    categoryHeaders.forEach(header => {
        header.addEventListener('click', () => {
            categoryHeaders.forEach(h => {
                if (h !== header) {
                    h.classList.remove('active');
                    h.nextElementSibling.style.maxHeight = null;
                }
            });
            header.classList.toggle('active');
            const panel = header.nextElementSibling;
            if (panel.style.maxHeight) {
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        });
    });

    createRoomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = window.currentUser; 
        if (!user) {
            alert("Ошибка: вы не вошли в систему.");
            return;
        }

        const roomName = document.getElementById('room-name').value;
        const selectedGame = document.querySelector('input[name="game-select"]:checked').value;
        
        if (selectedGame === 'tic-tac-toe') {
            const opponentType = document.querySelector('input[name="opponent-type"]:checked').value;
            if (opponentType === 'bot') {
                closeCreateRoomModal();
                window.location.href = 'games/tic-tac-toe/index.html?bot=true';
                return; 
            }

            const newRoom = {
                room_name: roomName,
                game: selectedGame,
                max_players: 2,
                creator_id: user.uid,
                creator_name: user.username,
                status: 'waiting',
                players: {
                    [user.uid]: user.username
                },
                game_state: {
                    board: [ '', '', '', '', '', '', '', '', ''],
                },
                turn: user.uid,
            };

            try {
                const { data, error } = await supabase
                    .from('rooms')
                    .insert(newRoom)
                    .select('id') 
                    .single(); 

                if (error) throw error;

                const newRoomId = data.id;
                console.log("Комната TTT успешно создана:", newRoomId);
                closeCreateRoomModal();
                window.location.href = `games/tic-tac-toe/index.html?room=${newRoomId}`;

            } catch (error) {
                console.error("Ошибка создания комнаты TTT:", error);
                alert(`Ошибка: ${error.message}`);
            }
            
        } else if (selectedGame === 'who-guess') {
            const subCategoryInput = document.querySelector('input[name="who-guess-subcategory"]:checked');
            if (!subCategoryInput) {
                alert("Ошибка: пожалуйста, выберите подкатегорию.");
                return;
            }
            const subCategory = subCategoryInput.value;

            const newRoom = {
                room_name: roomName,
                game: selectedGame,
                max_players: 2,
                creator_id: user.uid,
                creator_name: user.username,
                status: 'waiting',
                players: {
                    [user.uid]: user.username
                },
                game_state: {},
                turn: user.uid,
                sub_category: subCategory 
            };
            
            try {
                const { data, error } = await supabase
                    .from('rooms')
                    .insert(newRoom)
                    .select('id')
                    .single();

                if (error) throw error;
                
                const newRoomId = data.id;
                console.log("Комната 'Кто я?' создана:", newRoomId);
                closeCreateRoomModal();
                window.location.href = `games/guess-who/index.html?room=${newRoomId}&subCategory=${subCategory}`;

            } catch (error) {
                console.error("Ошибка создания комнаты 'Кто я?':", error);
                alert(`Ошибка: ${error.message}`);
            }

        } else {
            alert("Эта игра пока не доступна!");
        }
    });

    // ===================================================================
    // 4. ЛОГИКА ВХОДА В КОМНАТУ
    // ===================================================================
    // (Без изменений)
    
    roomListElement.addEventListener('click', async (e) => {
        if (e.target.classList.contains('join-btn')) {
            const roomItem = e.target.closest('.room-item');
            const roomId = roomItem.dataset.roomId;
            
            try {
                const { data: roomData, error } = await supabase
                    .from('rooms')
                    .select('game, sub_category') 
                    .eq('id', roomId)
                    .single();

                if (error) throw error;
                if (!roomData) {
                    alert("Ошибка: Комната не найдена.");
                    return;
                }
                
                const gameType = roomData.game;
                
                if (gameType === 'tic-tac-toe') {
                    window.location.href = `games/tic-tac-toe/index.html?room=${roomId}`;
                } 
                else if (gameType === 'who-guess') {
                    const subCategory = roomData.sub_category; 
                    if (!subCategory) {
                        alert("Ошибка: у комнаты 'Кто я?' нет категории.");
                        return;
                    }
                    window.location.href = `games/guess-who/index.html?room=${roomId}&subCategory=${subCategory}`;
                }

            } catch (error) {
                console.error("Ошибка входа в комнату:", error);
                alert("Ошибка входа: " + error.message);
            }
        }
    });

    // ===================================================================
    // 5. ЛОГИКА ДРУЗЕЙ (Supabase)
    // ===================================================================
    // (ИЗМЕНЕНИЕ) Весь этот раздел переписан

    const friendSearchForm = document.getElementById('friend-search-form');
    const friendSearchInput = document.getElementById('friend-search-input');
    const friendSearchResults = document.getElementById('friend-search-results');
    const friendList = document.getElementById('friend-list');
    
    // (ИЗМЕНЕНИЕ) Поиск друзей (Supabase)
    friendSearchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const searchTerm = friendSearchInput.value.trim();
        if (searchTerm === '' || !window.currentUser) return;
        
        friendSearchResults.innerHTML = `<p>Поиск...</p>`;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username') 
                .like('username', `%${searchTerm}%`) 
                .neq('id', window.currentUser.uid) 
                .limit(10); 

            if (error) throw error;
            
            if (!data || data.length === 0) {
                friendSearchResults.innerHTML = `<p>Пользователь "${searchTerm}" не найден.</p>`;
                return;
            }
            
            friendSearchResults.innerHTML = ''; 
            
            data.forEach(user => {
                const resultItem = document.createElement('div');
                resultItem.classList.add('user-search-item');
                resultItem.innerHTML = `
                    <span>${user.username}</span>
                    <button class="add-friend-btn" data-uid="${user.id}">
                        <i class="fas fa-user-plus"></i> Добавить
                    </button>
                `;
                friendSearchResults.appendChild(resultItem);
            });
            
        } catch (error) {
            console.error("Ошибка поиска друзей:", error);
            friendSearchResults.innerHTML = `<p>Ошибка поиска.</p>`;
        }
    });

    // (ИЗМЕНЕНИЕ) Добавление друга (Supabase)
    friendSearchResults.addEventListener('click', async (e) => {
        if (e.target.classList.contains('add-friend-btn') || e.target.closest('.add-friend-btn')) {
            const btn = e.target.closest('.add-friend-btn');
            const friendId = btn.dataset.uid;
            
            if (!friendId || !window.currentUser) return;

            try {
                // (ИЗМЕНЕНИЕ) Вставляем запись в 'friendship' (единственное число)
                const { error } = await supabase
                    .from('friendship') // <-- Используем твое название таблицы
                    .insert({ 
                        user_id: window.currentUser.uid, 
                        friend_id: friendId 
                    });

                if (error) throw error;
                
                alert("Друг добавлен!");
                friendSearchResults.innerHTML = '';
                friendSearchInput.value = '';
                
                // (ИЗМЕНЕНИЕ) Обновляем список друзей на экране
                listenForFriends(window.currentUser.uid);

            } catch (error) {
                if (error.code === '23505') { // Код ошибки 'Unique constraint violation'
                    alert("Этот пользователь уже у вас в друзьях.");
                } else {
                    console.error("Ошибка добавления друга:", error);
                    alert("Ошибка: " + error.message);
                }
            }
        }
    });

    // (ИЗМЕНЕНИЕ) Получение списка друзей (Supabase)
    const listenForFriends = async (userId) => {
        if (!userId) return;
        
        stopListeningForFriends();
        
        try {
            // (ИЗМЕНЕНИЕ) Запрос к 'friendship' (единственное число)
            const { data: friendsData, error } = await supabase
                .from('friendship') // <-- Используем твое название таблицы
                .select(`
                    profiles (id, username, status)
                `)
                .eq('user_id', userId);

            if (error) throw error;
            
            if (!friendsData || friendsData.length === 0) {
                friendList.innerHTML = `
                    <div class="friend-item-placeholder">
                        <p>У вас пока нет друзей. Найдите их по логину!</p>
                    </div>`;
                return;
            }
            
            friendList.innerHTML = ''; 
            const friendIds = []; 
            
            friendsData.forEach(item => {
                const friendData = item.profiles; 
                if (!friendData) return;
                
                friendIds.push(friendData.id); 
                
                const friendItem = document.createElement('div');
                friendItem.classList.add('friend-item');
                friendItem.id = `friend-item-${friendData.id}`;
                
                friendItem.innerHTML = `
                    <div class="friend-info">
                        <span class="friend-name">${friendData.username}</span>
                        <span class="friend-status" data-status="${friendData.status}">
                            ${getStatusText(friendData.status)}
                        </span>
                    </div>
                `;
                friendList.appendChild(friendItem);
            });
            
            // (ИЗМЕНЕНИЕ) Запускаем Realtime подписку
            // на ИЗМЕНЕНИЯ в 'profiles'
            friendStatusChannel = supabase
                .channel('public:profiles:friends')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    // (ИЗМЕНЕНИЕ) Убедимся, что friendIds не пустой
                    filter: `id=in.(${friendIds.length > 0 ? friendIds.join(',') : "'00000000-0000-0000-0000-000000000000'"})` 
                }, (payload) => {
                    console.log("Realtime: Статус друга изменился!", payload);
                    const newFriendData = payload.new;
                    const statusElement = document.querySelector(`#friend-item-${newFriendData.id} .friend-status`);
                    if (statusElement) {
                        statusElement.textContent = getStatusText(newFriendData.status);
                        statusElement.dataset.status = newFriendData.status;
                    }
                })
                .subscribe();

        } catch (error) {
            console.error("Ошибка загрузки друзей:", error);
            friendList.innerHTML = `<p>Ошибка загрузки списка друзей.</p>`;
        }
    };

    // (ИЗМЕНЕНИЕ) Отписка от статусов друзей
    const stopListeningForFriends = () => {
        if (friendStatusChannel) {
            friendStatusChannel.unsubscribe();
            friendStatusChannel = null;
        }
        friendList.innerHTML = '';
    };

    // (Без изменений)
    const getStatusText = (status) => {
        switch (status) {
            case 'online': return 'В сети';
            case 'offline': return 'Не в сети';
            case 'in-game': return 'В игре';
            default: return 'Неизвестно';
        }
    };

}); // Конец 'DOMContentLoaded'
