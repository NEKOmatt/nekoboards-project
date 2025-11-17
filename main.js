// Главный JavaScript файл для NEKOboards
console.log("Главный скрипт (main.js) загружен!");

document.addEventListener('DOMContentLoaded', () => {

    const supabase = window.supabaseClient;
    
    // (ИЗМЕНЕНИЕ) Эта переменная будет хранить нашу "подписку"
    // на изменения в комнатах
    let roomSubscription = null;
    
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
    let friendsRef = null;
    let friendStatusListeners = {}; 

    // (ИЗМЕНЕНИЕ) Рендер списка комнат из Supabase
    // 'rooms' - это теперь МАССИВ объектов, а не объект
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

        // (ИЗМЕНЕНИЕ) Мы итерируем массив
        rooms.forEach(room => {
            // (ИЗМЕНЕНИЕ) 'players' - это JSONB. Нам нужно 
            // распарсить его, если это строка, или просто
            // получить ключи, если это уже объект.
            let playerCount = 0;
            if (room.players) {
                try {
                    // Firebase хранил как объект, Supabase может хранить
                    // как объект или как строку JSON.
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
            // (ИЗМЕНЕНИЕ) ID комнаты теперь в room.id
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

        // 1. Получаем начальный список комнат
        try {
            const { data: initialRooms, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting'); // Показываем только те, что ждут
                
            if (error) throw error;
            renderRoomList(initialRooms); // Рендерим первый раз

        } catch (error) {
            console.error("Ошибка получения комнат:", error);
            roomListElement.innerHTML = `<p>Ошибка загрузки комнат.</p>`;
        }

        // 2. Подписываемся на БУДУЩИЕ изменения
        if (roomSubscription) {
            roomSubscription.unsubscribe(); // Чистим старую подписку
        }
        
        roomSubscription = supabase.channel('public:rooms')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'rooms' }, 
                (payload) => {
                    console.log('Realtime: комнаты изменились!', payload);
                    // Это самый простой способ: 
                    // просто перезагружаем ВЕСЬ список при любом изменении.
                    listenForRooms(); 
                }
            )
            .subscribe();
    };

    // (ИЗМЕНЕНИЕ) Отписка от комнат
    const stopListeningForRooms = () => {
        console.log("Прекращаем слушать комнаты (Supabase).");
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
        }
        roomListElement.innerHTML = ''; 
    };


    // (ИЗМЕНЕНИЕ) Обновляем UI, но теперь с Supabase
    const updateUIforUser = async (session) => {
        const user = session?.user; 

        if (user) {
            console.log("Пользователь вошел (Supabase):", user.id);
            
            welcomeMessage.classList.add('hidden');
            homeContainer.classList.remove('hidden');
            showLoginBtn.classList.add('hidden');
            showRegisterBtn.classList.add('hidden');
            userProfileDisplay.classList.remove('hidden');

            // (ИЗМЕНЕНИЕ) Система присутствия (Presence)
            // Это сложнее, чем в Firebase. Мы сделаем это позже.
            // Пока просто ставим статус 'online' при входе.
            try {
                await supabase
                    .from('profiles')
                    .update({ status: 'online' })
                    .eq('id', user.id);
            } catch (error) {
                console.error("Ошибка обновления статуса:", error);
            }
            
            listenForRooms(); // <-- Теперь эта функция работает!

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
                
                listenForFriends(user.id); // <-- Включаем (но она пока пустая)

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
            
            // (ИЗМЕНЕНИЕ) Ставим 'offline' перед выходом
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
    // (Без изменений в DOM-элементах)

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

    // (ИЗМЕНЕНИЕ) Создание комнаты (Supabase)
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

            // (ИЗМЕНЕНИЕ) Создаем объект для вставки в Supabase
            const newRoom = {
                room_name: roomName,
                game: selectedGame,
                max_players: 2,
                creator_id: user.uid,
                creator_name: user.username,
                status: 'waiting',
                // (ИЗМЕНЕНИЕ) JSONB-поля
                players: {
                    [user.uid]: user.username
                },
                game_state: {
                    // (ИЗМЕНЕНИЕ) В Supabase мы можем хранить массив
                    // напрямую в JSONB
                    board: [ '', '', '', '', '', '', '', '', ''],
                },
                turn: user.uid,
                // sub_category остается NULL
            };

            try {
                // (ИЗМЕНЕНИЕ) Вставляем в таблицу и 
                // .select() чтобы получить ID обратно
                const { data, error } = await supabase
                    .from('rooms')
                    .insert(newRoom)
                    .select('id') // <-- Важно: получаем ID созданной комнаты
                    .single(); // <-- Ожидаем один результат

                if (error) throw error;

                const newRoomId = data.id;
                console.log("Комната TTT успешно создана:", newRoomId);
                closeCreateRoomModal();
                // (ИЗМЕНЕНИЕ) ID теперь число, но это не страшно
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

            // (ИЗМЕНЕНИЕ) Создаем объект для "Кто я?"
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
                    // Пустое состояние, игра создаст его сама
                },
                turn: user.uid,
                sub_category: subCategory // <-- Указываем подкатегорию
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
    
    // (ИЗМЕНЕНИЕ) Вход в комнату (Supabase)
    roomListElement.addEventListener('click', async (e) => {
        if (e.target.classList.contains('join-btn')) {
            const roomItem = e.target.closest('.room-item');
            const roomId = roomItem.dataset.roomId;
            
            try {
                // (ИЗМЕНЕНИЕ) Получаем данные комнаты из Supabase
                const { data: roomData, error } = await supabase
                    .from('rooms')
                    .select('game, sub_category') // Нам нужны только эти поля
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
    // 5. (Задача 2) ЛОГИКА ДРУЗЕЙ
    // ===================================================================
    // (ИЗМЕНЕНИЕ) Эта логика пока НЕ РАБОТАЕТ.
    // Мы сделаем ее в следующем шаге (нужна таблица 'friends')
    
    const friendSearchForm = document.getElementById('friend-search-form');
    const friendSearchInput = document.getElementById('friend-search-input');
    const friendSearchResults = document.getElementById('friend-search-results');
    const friendList = document.getElementById('friend-list');
    
    friendSearchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        alert("Поиск друзей будет доступен в следующем шаге.");
    });

    friendSearchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-friend-btn') || e.target.closest('.add-friend-btn')) {
            alert("Добавление друзей будет доступно в следующем шаге.");
        }
    });

    const listenForFriends = (userId) => {
        friendList.innerHTML = `
            <div class="friend-item-placeholder">
                <p>Загрузка друзей (Supabase)...</p>
            </div>`;
    };
    const stopListeningForFriends = () => {
        friendList.innerHTML = '';
    };
    const getStatusText = (status) => {
        switch (status) {
            case 'online': return 'В сети';
            case 'offline': return 'Не в сети';
            case 'in-game': return 'В игре';
            default: return 'Неизвестно';
        }
    };

}); // Конец 'DOMContentLoaded'
