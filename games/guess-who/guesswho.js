// ===================================================================
//
//  ФАЙЛ ДЛЯ ИГРЫ "КТО Я? (GUESS WHO?)" (guesswho.js)
//  (ЗАДАЧА 7 - МИГРАЦИЯ НА SUPABASE DB)
//
// ===================================================================
console.log("Логика 'Кто я?' (guesswho.js) загружена!");

document.addEventListener('DOMContentLoaded', () => {

    // (ИЗМЕНЕНИЕ) Получаем клиент Supabase
    const supabase = window.supabaseClient;

    // ===================================================================
    // 1. ЭЛЕМЕНТЫ DOM (Без изменений)
    // ===================================================================
    const gameRoomName = document.getElementById('game-room-name');
    const gameStatusText = document.getElementById('game-status-text');
    const leaveGameBtn = document.getElementById('leave-game-btn');
    const whoGuessWrapper = document.getElementById('who-guess-wrapper');
    const wgGameBoard = document.getElementById('wg-game-board');
    const wgMySecretCard = document.getElementById('wg-my-secret-card');
    const wgOpponentSecretCard = document.getElementById('wg-opponent-secret-card');
    const wgChatLog = document.getElementById('wg-chat-log');
    const wgAskBtn = document.getElementById('wg-ask-btn');
    const wgGuessBtn = document.getElementById('wg-guess-btn');
    const wgYesBtn = document.getElementById('wg-yes-btn');
    const wgNoBtn = document.getElementById('wg-no-btn');
    const imageZoomOverlay = document.getElementById('image-zoom-overlay');
    const closeZoomModalBtn = document.getElementById('close-zoom-modal-btn');
    const imageZoomContainer = document.getElementById('image-zoom-container'); 
    const zoomedImage = document.getElementById('zoomed-image');

    // ===================================================================
    // 2. ПЕРЕМЕННЫЕ СОСТОЯНИЯ ИГРЫ
    // ===================================================================
    // (ИЗМЕНЕНИЕ) activeWhoGuessListener теперь канал Supabase
    let currentWhoGuessRoomId = null;
    let mySecretCard = null; 
    let opponentSecretCard = null; 
    let opponentId = null; 
    let currentGameState = 'loading'; 
    let activeWhoGuessListener = null; 

    let pressTimer = null;
    let isLongPress = false;


    // ===================================================================
    // 2.5. ЛОГИКА ЗАПУСКА ИГРЫ (Supabase Auth)
    // ===================================================================
    // (Этот блок уже был обновлен в Шаге 2.1)
    const initializeGame = () => {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
                const user = session.user;
                if (user) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('id', user.id)
                        .single();
                    const username = (data && !error) ? data.username : user.email;
                    window.currentUser = {
                        uid: user.id,
                        username: username
                    };
                    checkUrlAndStart();
                } else {
                     alert("Вы не вошли в систему. Перенаправляем на главную.");
                     window.location.href = '../../index.html';
                }
            } else if (event === 'SIGNED_OUT') {
                 alert("Вы вышли из системы. Перенаправляем на главную.");
                 window.location.href = '../../index.html';
            }
        });
        
        const checkExistingSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                 const user = session.user;
                 const { data, error } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', user.id)
                    .single();
                 const username = (data && !error) ? data.username : user.email;
                 window.currentUser = { uid: user.id, username: username };
                 checkUrlAndStart();
            }
        };
        checkExistingSession();
    };

    // (ИЗМЕНЕНИЕ) Проверка URL (Supabase)
    const checkUrlAndStart = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('room');
        const subCategoryFromUrl = urlParams.get('subCategory');

        if (roomIdFromUrl && subCategoryFromUrl) {
            console.log(`Подключаемся к "Кто я?": ${roomIdFromUrl}, Категория: ${subCategoryFromUrl}`);
            
            // (ИЗМЕНЕНИЕ) Получаем имя комнаты из Supabase
            try {
                const { data: roomData, error } = await supabase
                    .from('rooms')
                    .select('room_name')
                    .eq('id', roomIdFromUrl)
                    .single();

                if (error) throw error;
                if (roomData) {
                    // Передаем subCategoryFromUrl, так как он уже есть
                    joinWhoGuessGame(roomIdFromUrl, roomData.room_name, subCategoryFromUrl);
                } else {
                    alert("Ошибка: Комната не найдена.");
                    gameStatusText.textContent = "Ошибка: Комната не найдена.";
                }
            } catch (error) {
                 console.error("Ошибка получения комнаты:", error);
                 alert("Ошибка: Не удалось загрузить комнату.");
            }
        } 
        else {
            alert("Ошибка: Не указан ID комнаты или категория.");
            gameStatusText.textContent = "Ошибка: Неверные параметры игры.";
        }
    };


    // ===================================================================
    // 3. ЛОГИКА: ОБРАБОТЧИКИ КЛИКОВ И НАЖАТИЙ
    // ===================================================================
    // (onCardClick и toggleEliminateCard без изменений)

    const onCardClick = (e) => {
        if (isLongPress) {
            e.preventDefault();
            return;
        }

        const card = e.currentTarget;
        const characterId = card.dataset.characterId;

        if (currentGameState === 'choosing') {
            selectSecretCard(card, characterId);
        } else if (currentGameState === 'playing') {
            toggleEliminateCard(card, characterId);
        } else if (currentGameState === 'guessing') {
            handleGuess(characterId);
        }
    };

    const toggleEliminateCard = (card, characterId) => {
        if (characterId === mySecretCard) {
            return;
        }
        card.classList.toggle('eliminated');
    };

    // (ИЗМЕНЕНИЕ) Выбор карты (Supabase)
    const selectSecretCard = async (card, characterId) => {
        if (mySecretCard) return;

        mySecretCard = characterId;
        currentGameState = 'waiting';
        
        card.classList.add('selected');
        gameStatusText.textContent = 'Ожидаем выбор противника...';

        const img = card.querySelector('img').cloneNode();
        wgMySecretCard.innerHTML = '';
        wgMySecretCard.appendChild(img);

        if (!currentWhoGuessRoomId || !window.currentUser) return;
        
        // (ИЗМЕНЕНИЕ) Обновляем game_state в Supabase
        const userId = window.currentUser.uid;
        try {
            // 1. Получаем текущий game_state
            const { data, error: fetchError } = await supabase
                .from('rooms')
                .select('game_state')
                .eq('id', currentWhoGuessRoomId)
                .single();
            
            if (fetchError) throw fetchError;
            
            // 2. Модифицируем JSON
            const newGameState = data.game_state || {};
            if (!newGameState.secret_cards) {
                newGameState.secret_cards = {};
            }
            newGameState.secret_cards[userId] = characterId;
            
            // 3. Отправляем обратно
            const { error: updateError } = await supabase
                .from('rooms')
                .update({ game_state: newGameState })
                .eq('id', currentWhoGuessRoomId);
                
            if (updateError) throw updateError;
            
            // Обновление придет через Realtime

        } catch (err) {
            console.error("Ошибка сохранения секретной карты:", err);
            alert("Произошла ошибка, попробуйте еще раз.");
            mySecretCard = null;
            currentGameState = 'choosing';
            card.classList.remove('selected');
            gameStatusText.textContent = 'Выберите вашего секретного персонажа!';
            wgMySecretCard.innerHTML = '?';
        }
    };

    // (ИЗМЕНЕНИЕ) Угадывание (Supabase)
    const handleGuess = async (guessedCharacterId) => {
        if (!opponentSecretCard || !currentWhoGuessRoomId || !opponentId) return;

        const userId = window.currentUser.uid;
        const isCorrect = (guessedCharacterId === opponentSecretCard);
        const winnerId = isCorrect ? userId : opponentId;
        const loserId = isCorrect ? opponentId : userId;

        currentGameState = 'game_over'; 
        
        try {
            // 1. Получаем текущий game_state
            const { data, error: fetchError } = await supabase
                .from('rooms')
                .select('game_state')
                .eq('id', currentWhoGuessRoomId)
                .single();
                
            if (fetchError) throw fetchError;

            // 2. Модифицируем JSON
            const newGameState = data.game_state || {};
            
            // 2.1 Добавляем в чат
            if (!newGameState.chat_log) newGameState.chat_log = [];
            const guessLogEntry = {
                type: isCorrect ? 'guess-win' : 'guess-fail',
                senderId: userId,
                text: isCorrect ? `Я угадал! Это был персонаж #${guessedCharacterId.replace('character', '')}!` : `Я думаю, это персонаж #${guessedCharacterId.replace('character', '')}... (Неверно)`
            };
            newGameState.chat_log.push(guessLogEntry);
            
            // 2.2 Устанавливаем победителя
            newGameState.winner = winnerId;
            newGameState.loser = loserId;

            // 3. Отправляем обратно
            const { error: updateError } = await supabase
                .from('rooms')
                .update({ 
                    game_state: newGameState,
                    status: 'finished' // (ИЗМЕНЕНИЕ) Обновляем статус комнаты
                })
                .eq('id', currentWhoGuessRoomId);

            if (updateError) throw updateError;
            
            // Обновление придет через Realtime
            
        } catch (error) {
            console.error("Ошибка при угадывании:", error);
        }
    };

    // ===================================================================
    // 4. ЛОГИКА: ЗУМ КАРТЫ И 3D-ЭФФЕКТ
    // ===================================================================
    // (Без изменений)
    const openZoomModal = (imageSrc) => {
        if (!zoomedImage || !imageZoomOverlay) {
            console.error("Элементы зума не найдены в HTML!");
            return;
        }
        zoomedImage.src = imageSrc;
        zoomedImage.classList.remove('zoomed-in');
        zoomedImage.style.transform = 'perspective(1000px) scale(1) rotateX(0deg) rotateY(0deg)';
        imageZoomOverlay.classList.remove('hidden');
    };
    const closeZoomModal = () => {
        if (!imageZoomOverlay) return;
        imageZoomOverlay.classList.add('hidden');
        zoomedImage.src = ""; 
    };
    if (closeZoomModalBtn) {
        closeZoomModalBtn.addEventListener('click', closeZoomModal);
    }
    if (imageZoomOverlay) {
        imageZoomOverlay.addEventListener('click', (e) => {
            if (e.target === imageZoomOverlay) {
                closeZoomModal();
            }
        });
    }
    if (imageZoomContainer && zoomedImage) {
        const applyTilt = (rotateX = 0, rotateY = 0) => {
            const isMobile = window.innerWidth <= 768;
            const hasZoomClass = zoomedImage.classList.contains('zoomed-in');
            const scale = isMobile ? 1 : (hasZoomClass ? 1.5 : 1);
            zoomedImage.style.transform = `perspective(1000px) scale(${scale}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        };
        const handleTilt = (e) => {
            const isTouchEvent = e.type === 'touchmove';
            if (isTouchEvent) {
                e.preventDefault(); 
            }
            const rect = imageZoomContainer.getBoundingClientRect();
            const x = isTouchEvent ? e.touches[0].clientX : e.clientX;
            const y = isTouchEvent ? e.touches[0].clientY : e.clientY;
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const offsetX = x - centerX;
            const offsetY = y - centerY;
            const maxTilt = 12; 
            const rotateY = (offsetX / (rect.width / 2)) * maxTilt;
            const rotateX = (-offsetY / (rect.height / 2)) * maxTilt;
            const finalRotateY = Math.max(-maxTilt, Math.min(maxTilt, rotateY));
            const finalRotateX = Math.max(-maxTilt, Math.min(maxTilt, rotateX));
            applyTilt(finalRotateX, finalRotateY);
        };
        const resetTilt = () => {
            applyTilt(0, 0);
        };
        const zoomClickHandler = () => {
            zoomedImage.classList.toggle('zoomed-in');
            resetTilt(); 
        };
        imageZoomContainer.addEventListener('mousemove', handleTilt);
        imageZoomContainer.addEventListener('mouseleave', resetTilt);
        imageZoomContainer.addEventListener('touchmove', handleTilt, { passive: false });
        imageZoomContainer.addEventListener('touchend', resetTilt);
        imageZoomContainer.addEventListener('touchcancel', resetTilt);
        zoomedImage.addEventListener('click', zoomClickHandler);
    }
    const startPress = (e) => {
        const cardElement = e.currentTarget; 
        if (currentGameState === 'game_over') return;
        isLongPress = false;
        pressTimer = setTimeout(() => {
            isLongPress = true;
            if(e.type === 'mousedown') e.preventDefault();
            openZoomModal(cardElement.querySelector('img').src); 
        }, 500);
    };
    const endPress = (e) => {
        clearTimeout(pressTimer);
        if (isLongPress) {
            e.preventDefault(); 
        }
    };
    const cancelPress = () => {
        clearTimeout(pressTimer);
    };

    // ===================================================================
    // 5. ЛОГИКА: ГЕНЕРАЦИЯ ДОСКИ И ПУТИ
    // ===================================================================
    // (Без изменений, т.к. пути к ассетам не поменялись)
    const subCategoryToPath = (subCategory) => {
        switch (subCategory) {
            case 'anime-naruto':
                return '../../assets/Who Guess/Anime/Naruto/';
            case 'games-minecraft':
                return '../../assets/Who Guess/Games/Minecraft/';
            case 'cartoons-lion-king':
                return '../../assets/Who Guess/Cartoons/Lion king/';
            case 'films-kitchen':
                return '../../assets/Who Guess/Films/Kitchen/';
            default:
                console.warn('Неизвестная подкатегория:', subCategory);
                return '../../assets/Who Guess/'; 
        }
    };
    const generateBoard = (subCategory) => {
        if (!wgGameBoard) {
            console.error("wg-game-board не найден!");
            return;
        }
        wgGameBoard.innerHTML = ''; 
        wgGameBoard.classList.remove('disabled'); 
        const path = subCategoryToPath(subCategory);
        for (let i = 1; i <= 18; i++) {
            const card = document.createElement('div');
            card.classList.add('wg-character-card');
            card.dataset.characterId = `character${i}`; 
            if (i === 17) {
                card.style.gridColumn = '2 / 3';
            }
            if (i === 18) {
                card.style.gridColumn = '3 / 4';
            }
            const img = document.createElement('img');
            img.src = `${path}character${i}.png`;
            img.alt = `Персонаж ${i}`;
            img.onerror = () => { 
                card.innerHTML = `<span style="font-size: 0.7rem; padding: 5px; text-align: center; word-break: break-all;">${img.src.split('/').pop()}</span>`;
                console.error(`Ошибка загрузки: ${img.src}`);
            };
            card.appendChild(img);
            card.addEventListener('mousedown', startPress);
            card.addEventListener('mouseup', endPress);
            card.addEventListener('mouseleave', cancelPress);
            card.addEventListener('touchstart', startPress, { passive: true });
            card.addEventListener('touchend', endPress);
            card.addEventListener('touchcancel', cancelPress);
            card.addEventListener('click', onCardClick);
            wgGameBoard.appendChild(card);
        }
    };
    
    // (ИЗМЕНЕНИЕ) Рендер чата (Supabase)
    // logData - это теперь МАССИВ, а не объект
    const renderChatLog = (logData, players) => {
        if (!wgChatLog) return; 

        if (!logData || logData.length === 0) {
            wgChatLog.innerHTML = '<p class="wg-chat-message system">Игра началась! Ожидание выбора карт...</p>';
            return;
        }

        wgChatLog.innerHTML = ''; 
        
        logData.forEach(entry => {
            const username = players[entry.senderId] || 'Игрок';
            const p = document.createElement('p');
            p.classList.add('wg-chat-message');

            switch (entry.type) {
                case 'question':
                    p.classList.add('question');
                    p.innerHTML = `<b>${username}:</b> ${entry.text}`;
                    break;
                case 'answer-yes':
                    p.classList.add('answer-yes');
                    p.innerHTML = `<b>${username}:</b> Да`;
                    break;
                case 'answer-no':
                    p.classList.add('answer-no');
                    p.innerHTML = `<b>${username}:</b> Нет`;
                    break;
                case 'guess-win':
                    p.classList.add('guess-win');
                    p.innerHTML = `<b>${username}:</b> ${entry.text}`;
                    break;
                case 'guess-fail':
                    p.classList.add('guess-fail');
                    p.innerHTML = `<b>${username}:</b> ${entry.text}`;
                    break;
                case 'system':
                default:
                    p.classList.add('system');
                    p.textContent = entry.text;
                    break;
            }
            wgChatLog.appendChild(p);
        });
        
        wgChatLog.scrollTop = wgChatLog.scrollHeight;
    };


    // ===================================================================
    // 6. ЛОГИКА: СЛУШАТЕЛЬ SUPABASE И ВХОД/ВЫХОД
    // ===================================================================

    // (ИЗМЕНЕНИЕ) Остановка слушателя (Supabase)
    const stopWhoGuessListener = (isManualExit = false) => {
        const roomId = currentWhoGuessRoomId; 
        const userId = window.currentUser?.uid;

        if (activeWhoGuessListener) {
            activeWhoGuessListener.unsubscribe();
        }
        
        activeWhoGuessListener = null;
        currentWhoGuessRoomId = null;
        mySecretCard = null;
        opponentSecretCard = null;
        opponentId = null;
        currentGameState = 'loading';
        
        if (wgGameBoard) {
            wgGameBoard.innerHTML = '';
            wgGameBoard.classList.remove('disabled'); 
        }
        if (wgMySecretCard) wgMySecretCard.innerHTML = '?';
        if (wgOpponentSecretCard) wgOpponentSecretCard.innerHTML = '?';
        if (wgChatLog) wgChatLog.innerHTML = ''; 

        // (ИЗМЕНЕНИЕ) Логика выхода (перенесена в closeGame)
    };

    // (ИЗМЕНЕНИЕ) Главный слушатель игры (Supabase Realtime)
    const startWhoGuessListener = (roomId, subCategory) => {
        generateBoard(subCategory); // Генерируем доску 1 раз

        if (activeWhoGuessListener) {
            activeWhoGuessListener.unsubscribe();
        }

        activeWhoGuessListener = supabase
            .channel(`room-${roomId}`)
            .on('postgres_changes', 
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'rooms',
                    filter: `id=eq.${roomId}`
                }, 
                (payload) => {
                    console.log('Realtime: Комната "Кто я?" обновлена!', payload);
                    const roomData = payload.new;
                    
                    if (roomData.game !== 'who-guess') return; 
                    if (!window.currentUser) return;

                    const userId = window.currentUser.uid;
                    const players = roomData.players || {};
                    const playerCount = Object.keys(players).length;
                    
                    // (ИЗМЕНЕНИЕ) game_state - это JSONB
                    const gameState = roomData.game_state || {};
                    const secretCards = gameState.secret_cards || {};
                    const chatLog = gameState.chat_log || []; // Это массив
                    
                    const myChoice = secretCards[userId];
                    opponentId = Object.keys(players).find(id => id !== userId);
                    const opponentChoice = opponentId ? secretCards[opponentId] : null;

                    const questionActive = gameState.question_active || false;
                    const myTurn = roomData.turn === userId;
                    const winnerId = gameState.winner;

                    renderChatLog(chatLog, players);

                    if (winnerId) {
                        currentGameState = 'game_over';
                        const winnerName = players[winnerId] || 'Игрок';
                        const statusMsg = (winnerId === userId) ? `Вы победили!` : `Победил ${winnerName}!`;
                        gameStatusText.textContent = statusMsg;

                        if (wgGameBoard) wgGameBoard.classList.add('disabled');
                        if (wgAskBtn) wgAskBtn.classList.add('hidden');
                        if (wgGuessBtn) wgGuessBtn.classList.add('hidden');
                        if (wgYesBtn) wgYesBtn.classList.add('hidden');
                        if (wgNoBtn) wgNoBtn.classList.add('hidden');
                        
                        if (opponentChoice && wgOpponentSecretCard && wgOpponentSecretCard.innerHTML.includes('?')) {
                             const cardOnBoard = wgGameBoard.querySelector(`[data-character-id="${opponentChoice}"]`);
                             if (cardOnBoard) {
                                const img = cardOnBoard.querySelector('img').cloneNode();
                                wgOpponentSecretCard.innerHTML = '';
                                wgOpponentSecretCard.appendChild(img);
                             }
                        }
                        
                        // Отписываемся, игра окончена
                        if (activeWhoGuessListener) {
                            activeWhoGuessListener.unsubscribe();
                            activeWhoGuessListener = null;
                        }
                        return; 
                    }

                    if (playerCount < 2) {
                        currentGameState = 'loading';
                        gameStatusText.textContent = 'Ожидание второго игрока...';
                    } 
                    else if (!myChoice) {
                        currentGameState = 'choosing';
                        gameStatusText.textContent = 'Выберите вашего секретного персонажа!';
                    } 
                    else if (!opponentChoice) {
                        currentGameState = 'waiting';
                        gameStatusText.textContent = 'Ожидаем выбор противника...';
                        
                        if (myChoice && !mySecretCard) {
                            mySecretCard = myChoice;
                            const cardOnBoard = wgGameBoard.querySelector(`[data-character-id="${myChoice}"]`);
                            if (cardOnBoard) {
                                cardOnBoard.classList.add('selected');
                                const img = cardOnBoard.querySelector('img').cloneNode();
                                wgMySecretCard.innerHTML = '';
                                wgMySecretCard.appendChild(img);
                            }
                        }
                    }
                    else {
                        if (currentGameState !== 'guessing') {
                            currentGameState = 'playing';
                        }
                        
                        mySecretCard = myChoice; 
                        opponentSecretCard = opponentChoice;

                        if (wgOpponentSecretCard && wgOpponentSecretCard.innerHTML === '?') {
                             wgOpponentSecretCard.innerHTML = '★'; 
                             wgOpponentSecretCard.style.color = "#e74c3c";
                        }
                        
                        if (wgMySecretCard && wgMySecretCard.innerHTML === '?') {
                             const cardOnBoard = wgGameBoard.querySelector(`[data-character-id="${myChoice}"]`);
                             if (cardOnBoard) {
                                cardOnBoard.classList.add('selected');
                                const img = cardOnBoard.querySelector('img').cloneNode();
                                wgMySecretCard.innerHTML = '';
                                wgMySecretCard.appendChild(img);
                            }
                        }
                        
                        const turnName = roomData.players[roomData.turn] || 'Игрок';
                        
                        if (currentGameState === 'guessing' && myTurn) {
                            gameStatusText.textContent = 'Выберите персонажа, которого хотите угадать.';
                            wgAskBtn.classList.add('hidden');
                            wgGuessBtn.classList.add('hidden');
                            wgYesBtn.classList.add('hidden');
                            wgNoBtn.classList.add('hidden');
                        }
                        else if (myTurn) {
                            if (questionActive) {
                                gameStatusText.textContent = `Ожидаем ответ от ${turnName}...`;
                                wgAskBtn.classList.add('hidden');
                                wgGuessBtn.classList.add('hidden');
                                wgYesBtn.classList.add('hidden');
                                wgNoBtn.classList.add('hidden');
                            } else {
                                gameStatusText.textContent = 'Ваш ход! Задайте вопрос или угадайте.';
                                wgAskBtn.classList.remove('hidden');
                                wgGuessBtn.classList.remove('hidden');
                                wgYesBtn.classList.add('hidden');
                                wgNoBtn.classList.add('hidden');
                            }
                        } else {
                            if (questionActive) {
                                gameStatusText.textContent = `${turnName} задал вопрос. Ваш ответ?`;
                                wgAskBtn.classList.add('hidden');
                                wgGuessBtn.classList.add('hidden');
                                wgYesBtn.classList.remove('hidden');
                                wgNoBtn.classList.remove('hidden');
                            } else {
                                gameStatusText.textContent = `Ходит ${turnName}...`;
                                wgAskBtn.classList.add('hidden');
                                wgGuessBtn.classList.add('hidden');
                                wgYesBtn.classList.add('hidden');
                                wgNoBtn.classList.add('hidden');
                            }
                        }
                    }
                }
            )
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Подписан на комнату ${roomId}`);
                    // "Пинаем" канал, чтобы получить текущее состояние
                    const { data, error } = await supabase
                        .from('rooms')
                        .select('*')
                        .eq('id', roomId)
                        .single();
                    
                    if (error) throw error;
                    
                    const fakePayload = { new: data };
                    activeWhoGuessListener
                        .listeners.postgres_changes[0]
                        .callback(fakePayload);
                }
            });
    };

    // (ИЗМЕНЕНИЕ) Вход в игру (Supabase)
    const joinWhoGuessGame = async (roomId, roomName, subCategory) => { 
        console.log(`Входим в "Кто я?": ${roomId}, Категория: ${subCategory}`);
        
        stopWhoGuessListener();
        currentWhoGuessRoomId = roomId;
        
        if (window.currentUser) {
            const userId = window.currentUser.uid;
            const username = window.currentUser.username;
            
            try {
                // Обновляем статус
                await supabase
                    .from('profiles')
                    .update({ status: 'in-game' })
                    .eq('id', userId);
                
                // Добавляем игрока
                const { data: roomData, error: fetchError } = await supabase
                    .from('rooms')
                    .select('players')
                    .eq('id', roomId)
                    .single();
                
                if (fetchError) throw fetchError;

                const currentPlayers = roomData.players || {};
                currentPlayers[userId] = username;

                const { error: updateError } = await supabase
                    .from('rooms')
                    .update({ players: currentPlayers, status: 'playing' })
                    .eq('id', roomId);
                
                if (updateError) throw updateError;

            } catch (error) {
                console.error("Ошибка входа в комнату 'Кто я?':", error);
                alert("Не удалось войти в комнату.");
                return;
            }
        }
        
        gameRoomName.textContent = roomName;
        gameStatusText.textContent = 'Загрузка доски...'; 
        if(whoGuessWrapper) whoGuessWrapper.classList.remove('hidden');
        
        startWhoGuessListener(roomId, subCategory); 
    };

    // (ИЗМЕНЕНИЕ) Выход из игры (Supabase)
    const closeGame = async () => {
        // Вызываем стоп-слушатель
        stopWhoGuessListener(false); // (isManualExit больше не нужен)
        
        // 1. Обновляем статус в 'profiles' на 'online'
        if (window.currentUser) {
            try {
                await supabase
                    .from('profiles')
                    .update({ status: 'online' })
                    .eq('id', window.currentUser.uid);
            } catch (error) {
                console.error("Ошибка обновления статуса (выход):", error);
            }
        }

        // 2. Логика удаления игрока из комнаты
        if (currentWhoGuessRoomId && window.currentUser) {
            const userId = window.currentUser.uid;
            try {
                const { data: roomData, error: fetchError } = await supabase
                    .from('rooms')
                    .select('players')
                    .eq('id', currentWhoGuessRoomId)
                    .single();
                
                if (fetchError) throw fetchError;

                const currentPlayers = roomData.players || {};
                delete currentPlayers[userId];

                const playerCount = Object.keys(currentPlayers).length;

                if (playerCount === 0) {
                    console.log("Последний игрок покинул 'Кто я?'. Удаляем комнату.");
                    await supabase
                        .from('rooms')
                        .delete()
                        .eq('id', currentWhoGuessRoomId);
                    
                } else {
                    await supabase
                        .from('rooms')
                        .update({ players: currentPlayers }) 
                        .eq('id', currentWhoGuessRoomId);
                }

            } catch (error) {
                console.error("Ошибка при выходе из комнаты 'Кто я?':", error);
            }
        }
        
        // 3. Редирект на главную
        currentWhoGuessRoomId = null; // Сбрасываем ID
        window.location.href = '../../index.html';
    };


    // ===================================================================
    // 7. ЛОГИКА: ОБРАБОТЧИКИ КНОПОК "КТО Я?" (Supabase)
    // ===================================================================

    // (ИЗМЕНЕНИЕ) Вспомогательная функция для обновления game_state
    const updateGameState = async (updates) => {
        try {
            // 1. Получаем текущий game_state
            const { data, error: fetchError } = await supabase
                .from('rooms')
                .select('game_state')
                .eq('id', currentWhoGuessRoomId)
                .single();
            
            if (fetchError) throw fetchError;

            // 2. Применяем обновления к JSON
            const newGameState = data.game_state || {};
            Object.assign(newGameState, updates); // Мержим наши обновления
            
            // 3. Отправляем обратно
            const { error: updateError } = await supabase
                .from('rooms')
                .update({ game_state: newGameState })
                .eq('id', currentWhoGuessRoomId);
                
            if (updateError) throw updateError;
            
        } catch (error) {
            console.error("Ошибка обновления game_state:", error);
        }
    };
    
    // (ИЗМЕНЕНИЕ) Вспомогательная функция для обновления комнаты (turn и т.д.)
    const updateRoom = async (updates) => {
         try {
            const { error } = await supabase
                .from('rooms')
                .update(updates)
                .eq('id', currentWhoGuessRoomId);
            if (error) throw error;
         } catch (error) {
            console.error("Ошибка обновления комнаты:", error);
         }
    };

    // (ИЗМЕНЕНИЕ) Функция для добавления в чат
    const addChatLog = async (logEntry) => {
         try {
            // 1. Получаем game_state
            const { data, error: fetchError } = await supabase
                .from('rooms')
                .select('game_state')
                .eq('id', currentWhoGuessRoomId)
                .single();
            
            if (fetchError) throw fetchError;
            
            // 2. Модифицируем чат
            const newGameState = data.game_state || {};
            if (!newGameState.chat_log) newGameState.chat_log = [];
            newGameState.chat_log.push(logEntry);
            
            // 3. Отправляем обратно
            await supabase
                .from('rooms')
                .update({ game_state: newGameState })
                .eq('id', currentWhoGuessRoomId);

         } catch (error) {
            console.error("Ошибка добавления в чат:", error);
         }
    };


    if (wgAskBtn) {
        wgAskBtn.addEventListener('click', async () => {
            if (currentGameState !== 'playing' || !currentWhoGuessRoomId) return;
            
            const question = prompt("Какой ваш вопрос?");
            if (question && question.trim() !== "") {
                
                const logEntry = {
                    type: 'question',
                    senderId: window.currentUser.uid,
                    text: question.trim()
                };
                
                // 1. Добавляем в чат
                await addChatLog(logEntry);
                // 2. Обновляем game_state
                await updateGameState({ 'question_active': true });
            }
        });
    }

    if (wgGuessBtn) {
        wgGuessBtn.addEventListener('click', () => {
            if (currentGameState !== 'playing' || !currentWhoGuessRoomId) return;
            
            if (confirm("Вы уверены, что хотите угадать? В случае ошибки вы проиграете.")) {
                currentGameState = 'guessing';
                gameStatusText.textContent = 'Выберите персонажа, которого хотите угадать.';
                wgAskBtn.classList.add('hidden');
                wgGuessBtn.classList.add('hidden');
            }
        });
    }

    if (wgYesBtn) {
        wgYesBtn.addEventListener('click', async () => {
            if (currentGameState !== 'playing' || !currentWhoGuessRoomId || !opponentId) return;
            
            const logEntry = {
                type: 'answer-yes',
                senderId: window.currentUser.uid
            };
            
            // 1. Добавляем в чат
            await addChatLog(logEntry);
            // 2. Обновляем комнату (ход и статус вопроса)
            await updateRoom({
                'turn': opponentId,
                'game_state': { 'question_active': false } // (Примечание: это обновит только game_state)
                // Более безопасный способ - использовать updateGameState
            });
            // Переделаем на updateGameState для безопасности
            await updateGameState({ 'question_active': false });
            await updateRoom({ 'turn': opponentId });
        });
    }

    if (wgNoBtn) {
        wgNoBtn.addEventListener('click', async () => {
            if (currentGameState !== 'playing' || !currentWhoGuessRoomId || !opponentId) return;

            const logEntry = {
                type: 'answer-no',
                senderId: window.currentUser.uid
            };
            
            // 1. Добавляем в чат
            await addChatLog(logEntry);
            // 2. Обновляем (аналогично 'Yes')
            await updateGameState({ 'question_active': false });
            await updateRoom({ 'turn': opponentId });
        });
    }

    // ===================================================================
    // 8. ЗАПУСК
    // ===================================================================
    
    if (leaveGameBtn) {
        leaveGameBtn.addEventListener('click', closeGame);
    }
    
    initializeGame();

}); // Конец 'DOMContentLoaded'
