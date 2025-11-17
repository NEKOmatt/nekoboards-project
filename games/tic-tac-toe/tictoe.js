// ===================================================================
//
//  ФАЙЛ ДЛЯ ИГРЫ "КРЕСТИКИ-НОЛИКИ" (tictoe.js)
//  (ЗАДАЧА 7 - МИГРАЦИЯ НА SUPABASE DB)
//
// ===================================================================
console.log("Логика 'Крестики-нолики' (tictoe.js) загружена!");

document.addEventListener('DOMContentLoaded', () => {

    // (ИЗМЕНЕНИЕ) Получаем клиент Supabase
    const supabase = window.supabaseClient;

    // (ИЗМЕНЕНИЕ) 'activeGameListener' теперь хранит 
    // Supabase Realtime Channel
    let currentRoomId = null;
    let mySymbol = null; // 'X' или 'O'
    let activeGameListener = null; 

    // Локальная игра с ботом (без изменений)
    let isBotGame = false;
    let botBoardState = [];
    const PLAYER_X = 'X'; 
    const PLAYER_O = 'O'; 

    // ===================================================================
    // 1. ЭЛЕМЕНТЫ DOM (Без изменений)
    // ===================================================================
    const gameContainer = document.getElementById('game-container');
    const gameRoomName = document.getElementById('game-room-name');
    const leaveGameBtn = document.getElementById('leave-game-btn');
    const gameStatusText = document.getElementById('game-status-text');
    const ticTacToeWrapper = document.getElementById('tic-tac-toe-wrapper');
    const gameBoardElement = document.getElementById('tic-tac-toe-board');
    const playerSymbolElement = document.getElementById('player-symbol');
    const winnerLine = document.getElementById('tic-tac-toe-winner-line');

    // ===================================================================
    // 2. ЛОГИКА ЗАПУСКА ИГРЫ (Supabase Auth)
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

    // (ИЗМЕНЕНИЕ) Проверка URL и запуск (Supabase)
    const checkUrlAndStart = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('room');
        const isBotGameFromUrl = urlParams.get('bot') === 'true';

        if (isBotGameFromUrl) {
            console.log("Запускаем игру с NekoBot...");
            startLocalBotGame(); // <-- Использует Supabase для статуса
        } 
        else if (roomIdFromUrl) {
            console.log("Подключаемся к комнате:", roomIdFromUrl);
            
            // (ИЗМЕНЕНИЕ) Получаем данные комнаты из Supabase
            try {
                const { data: roomData, error } = await supabase
                    .from('rooms')
                    .select('room_name') // Нам нужно только имя
                    .eq('id', roomIdFromUrl)
                    .single();

                if (error) throw error;
                if (roomData) {
                    joinMultiplayerGame(roomIdFromUrl, roomData.room_name);
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
            alert("Ошибка: Не указан ID комнаты.");
            gameStatusText.textContent = "Ошибка: Не указан ID комнаты.";
        }
    };


    // ===================================================================
    // 3. ЛОГИКА: МНОГОПОЛЬЗОВАТЕЛЬСКАЯ ИГРА (Supabase)
    // ===================================================================

    // (ИЗМЕНЕНИЕ) Вход в МП игру (Supabase)
    const joinMultiplayerGame = async (roomId, roomName) => {
        if (!window.currentUser) return;
        const userId = window.currentUser.uid;
        const username = window.currentUser.username;

        try {
            // (ИЗМЕНЕНИЕ) Обновляем статус в 'profiles'
            await supabase
                .from('profiles')
                .update({ status: 'in-game' })
                .eq('id', userId);

            // (ИЗМЕНЕНИЕ) Добавляем игрока в JSONB 'players' в 'rooms'
            // Это сложный запрос, который атомарно обновляет JSON
            // 1. Получаем текущий 'players' JSON
            const { data: roomData, error: fetchError } = await supabase
                .from('rooms')
                .select('players')
                .eq('id', roomId)
                .single();
            
            if (fetchError) throw fetchError;

            // 2. Обновляем JSON локально
            const currentPlayers = roomData.players || {};
            currentPlayers[userId] = username;

            // 3. Отправляем обновленный JSON обратно
            const { error: updateError } = await supabase
                .from('rooms')
                .update({ players: currentPlayers, status: 'playing' }) // Также меняем статус комнаты
                .eq('id', roomId);
            
            if (updateError) throw updateError;
            
            // (ИЗМЕНЕНИЕ) onDisconnect() в Supabase работает иначе
            // Мы будем использовать 'Presence' или 'onbeforeunload'
            // для очистки. Пока что `closeGame()` будет чистить за нами.
            
            isBotGame = false; 
            currentRoomId = roomId;
            gameRoomName.textContent = roomName || `Игра ${roomId}`;
            
            // Запускаем слушатель Realtime
            startGameListener(roomId);

        } catch (error) {
            console.error("Ошибка входа в комнату:", error);
            alert("Не удалось войти в комнату.");
        }
    };


    // (ИЗМЕНЕНИЕ) Главный слушатель игры (Supabase Realtime)
    const startGameListener = (roomId) => {
        
        if (activeGameListener) {
            activeGameListener.unsubscribe(); // Отписываемся от старого
        }

        activeGameListener = supabase
            .channel(`room-${roomId}`) // Уникальный канал для этой комнаты
            .on('postgres_changes', 
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'rooms',
                    filter: `id=eq.${roomId}` // Слушаем ИЗМЕНЕНИЯ ТОЛЬКО ЭТОЙ КОМНАТЫ
                }, 
                (payload) => {
                    console.log('Realtime: Комната TTT обновлена!', payload);
                    const roomData = payload.new; // 'new' содержит обновленную строку
                    
                    // (ИЗМЕНЕНИЕ) Проверка на удаление комнаты (если payload.old пустой,
                    // или если мы не можем ее найти, но это сложнее)
                    // Вместо этого, `closeGame` будет обрабатывать выход
                    
                    if (roomData.game !== 'tic-tac-toe') return;

                    const userId = window.currentUser.uid;
                    
                    const playersObj = roomData.players || {};
                    const playerIds = Object.keys(playersObj);
                    const creatorId = roomData.creator_id;
                    const player1 = creatorId; 
                    const player2 = playerIds.find(id => id !== creatorId); 

                    mySymbol = (userId === creatorId) ? 'X' : 'O';
                    playerSymbolElement.textContent = mySymbol;

                    // (ИЗМЕНЕНИЕ) game_state теперь JSONB
                    // { "board": [...] }
                    const boardState = roomData.game_state.board || ['', '', '', '', '', '', '', '', ''];

                    renderBoard(boardState, roomData, player1, player2);

                    const winState = getWinState(boardState);
                    if (winState.winner) {
                        if (winState.winner === 'draw') {
                            gameStatusText.textContent = "Ничья!";
                        } else {
                            const p1Name = playersObj[player1] || 'Игрок 1';
                            const p2Name = playersObj[player2] || 'Игрок 2';

                            const winnerName = (winState.winner === 'X') ? p1Name : p2Name;
                            gameStatusText.textContent = `Победил ${winnerName} (${winState.winner})!`;
                        }
                        // (ИЗМЕНЕНИЕ) Закрываем канал, игра окончена
                        if (activeGameListener) {
                            activeGameListener.unsubscribe();
                            activeGameListener = null;
                        }
                        return;
                    }

                    if (!player2) {
                        gameStatusText.textContent = "Ожидание второго игрока...";
                    } else if (roomData.turn === userId) {
                        gameStatusText.textContent = "Ваш ход! (" + mySymbol + ")";
                    } else {
                        const turnName = (roomData.turn === player1) ? 
                                         (playersObj[player1] || 'Игрок 1') : 
                                         (playersObj[player2] || 'Игрок 2');
                        gameStatusText.textContent = `Ходит ${turnName}...`;
                    }
                }
            )
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Подписан на комнату ${roomId}`);
                    // (ИЗМЕНЕНИЕ) Нам нужно "пнуть" канал, чтобы 
                    // получить текущее состояние, так как Realtime
                    // срабатывает только на *будущие* изменения.
                    // Мы сделаем это, запросив данные комнаты еще раз.
                    const { data, error } = await supabase
                        .from('rooms')
                        .select('*')
                        .eq('id', roomId)
                        .single();
                    
                    if (error) throw error;
                    
                    // (ИЗМЕНЕНИЕ) Имитируем payload, чтобы 
                    // запустить наш рендер
                    const fakePayload = { new: data };
                    // Вызываем наш обработчик вручную
                    activeGameListener
                        .listeners.postgres_changes[0]
                        .callback(fakePayload);
                }
            });
    };

    // (ИЗМЕНЕНИЕ) Рендер доски (Supabase)
    // (boardState - это уже массив, roomData - это строка из Supabase)
    const renderBoard = (boardState, roomData, player1, player2) => {
        gameBoardElement.innerHTML = '';
        winnerLine.className = 'winner-line hidden';

        const myTurn = roomData.turn === window.currentUser.uid;
        const gameFull = player1 && player2;
        const winState = getWinState(boardState); 

        boardState.forEach((cell, index) => {
            const cellElement = document.createElement('div');
            cellElement.classList.add('game-cell');
            cellElement.textContent = cell;
            
            if(cell === 'X') cellElement.classList.add('x');
            if(cell === 'O') cellElement.classList.add('o');

            if (winState.winner || !gameFull || !myTurn || cell !== '') { 
                cellElement.classList.add('disabled'); 
            } else {
                cellElement.dataset.index = index;
                cellElement.addEventListener('click', handleCellClick);
            }
            gameBoardElement.appendChild(cellElement);
        });

        if (winState.winner && winState.winner !== 'draw') {
            winnerLine.classList.remove('hidden');
            winnerLine.classList.add(winState.lineClass);
            winnerLine.classList.add(winState.winner === 'X' ? 'win-x' : 'win-o');
        }
    };

    // (ИЗМЕНЕНИЕ) Обработчик клика (Supabase)
    const handleCellClick = async (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        if (isNaN(index)) return;

        const userId = window.currentUser.uid;

        try {
            // (ИЗМЕНЕНИЕ) Получаем текущее состояние из Supabase
            const { data: roomData, error: fetchError } = await supabase
                .from('rooms')
                .select('game_state, turn, creator_id, players')
                .eq('id', currentRoomId)
                .single();

            if (fetchError) throw fetchError;

            // Проверки
            if (roomData.turn !== userId) return; // Не мой ход
            
            const boardState = roomData.game_state.board || [];
            if (boardState[index] !== '') return; // Ячейка занята
            if (getWinState(boardState).winner) return; // Игра окончена

            // Определяем, кто ходит следующим
            const player1 = roomData.creator_id;
            const player2 = Object.keys(roomData.players).find(id => id !== player1);
            const nextTurn = (mySymbol === 'X') ? player2 : player1; 

            // Обновляем массив доски
            boardState[index] = mySymbol;
            
            // (ИЗМЕНЕНИЕ) Обновляем game_state и turn в Supabase
            const { error: updateError } = await supabase
                .from('rooms')
                .update({ 
                    // Обновляем весь JSONB
                    game_state: { board: boardState }, 
                    turn: nextTurn 
                })
                .eq('id', currentRoomId);

            if (updateError) throw updateError;
            
            // Обновление произойдет через Realtime,
            // нам не нужно вызывать renderBoard() вручную.

        } catch (error) {
            console.error("Ошибка хода:", error);
        }
    };

    // ===================================================================
    // 4. ЛОГИКА: ИГРА С БОТОМ (Локальная)
    // ===================================================================

    // (ИЗМЕНЕНИЕ) startLocalBotGame (Supabase)
    const startLocalBotGame = async () => {
        if (window.currentUser) {
            // (ИЗМЕНЕНИЕ) Обновляем статус в 'profiles'
            try {
                await supabase
                    .from('profiles')
                    .update({ status: 'in-game' })
                    .eq('id', window.currentUser.uid);
            } catch (error) {
                console.error("Ошибка обновления статуса (бот):", error);
            }
        }

        isBotGame = true;
        botBoardState = ['', '', '', '', '', '', '', '', ''];
        
        gameRoomName.textContent = "Игра с NekoBot";
        gameStatusText.textContent = "Ваш ход! (X)";
        playerSymbolElement.textContent = "X";
        
        renderBotBoard(botBoardState, true); 
    };

    // --- (Без изменений в остальной логике бота) ---
    const renderBotBoard = (board, playerTurn) => {
        gameBoardElement.innerHTML = '';
        winnerLine.className = 'winner-line hidden';
        const winState = getWinState(board);
        
        board.forEach((cell, index) => {
            const cellElement = document.createElement('div');
            cellElement.classList.add('game-cell');
            cellElement.textContent = cell;
            if(cell === 'X') cellElement.classList.add('x');
            if(cell === 'O') cellElement.classList.add('o');
            
            if (winState.winner || !playerTurn || cell !== '') { 
                cellElement.classList.add('disabled');
            } else {
                cellElement.dataset.index = index;
                cellElement.addEventListener('click', handleBotCellClick);
            }
            gameBoardElement.appendChild(cellElement);
        });

        if (winState.winner && winState.winner !== 'draw') {
            winnerLine.classList.remove('hidden');
            winnerLine.classList.add(winState.lineClass);
            winnerLine.classList.add(winState.winner === 'X' ? 'win-x' : 'win-o');
        }
    };
    const handleBotCellClick = (e) => {
        const index = parseInt(e.target.dataset.index, 10);
        if (botBoardState[index] !== '' || !isBotGame) return;

        botBoardState[index] = PLAYER_X;
        renderBotBoard(botBoardState, false); 

        let winState = getWinState(botBoardState);
        if (winState.winner) {
            gameStatusText.textContent = (winState.winner === 'draw') ? "Ничья!" : "Вы победили!";
            return;
        }
        
        gameStatusText.textContent = "NekoBot думает...";
        setTimeout(runBotMove, 700); 
    };
    const runBotMove = () => {
        if (!isBotGame) return; 

        let availableCells = [];
        botBoardState.forEach((cell, i) => {
            if (cell === '') availableCells.push(i);
        });

        if (availableCells.length === 0) return; 

        const botMoveIndex = availableCells[Math.floor(Math.random() * availableCells.length)];
        botBoardState[botMoveIndex] = PLAYER_O;

        renderBotBoard(botBoardState, true); 

        let winState = getWinState(botBoardState);
        if (winState.winner) {
            gameStatusText.textContent = (winState.winner === 'draw') ? "Ничья!" : "NekoBot победил!";
        } else {
            gameStatusText.textContent = "Ваш ход! (X)";
        }
    };

    // ===================================================================
    // 5. ОБЩАЯ ЛОГИКА (Проверка победы, Выход)
    // ===================================================================
    // (getWinState без изменений)
    const getWinState = (board) => {
        const winConditions = [
            { line: [0, 1, 2], class: 'win-row-1' },
            { line: [3, 4, 5], class: 'win-row-2' },
            { line: [6, 7, 8], class: 'win-row-3' },
            { line: [0, 3, 6], class: 'win-col-1' },
            { line: [1, 4, 7], class: 'win-col-2' },
            { line: [2, 5, 8], class: 'win-col-3' },
            { line: [0, 4, 8], class: 'win-diag-1' },
            { line: [2, 4, 6], class: 'win-diag-2' }
        ];

        for (const condition of winConditions) {
            const [a, b, c] = condition.line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return { winner: board[a], lineClass: condition.class }; 
            }
        }

        if (board.every(cell => cell !== '')) {
            return { winner: 'draw' }; 
        }

        return { winner: null }; 
    };


    // (ИЗМЕНЕНИЕ) Выход из игры (Supabase)
    const closeGame = async () => {
        
        winnerLine.className = 'winner-line hidden';

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
        
        // 2. Если это игра с ботом, просто уходим
        if (isBotGame) {
            isBotGame = false;
            botBoardState = [];
            console.log("Bot game closed.");
            window.location.href = '../../index.html';
            return;
        }

        // 3. Отписываемся от Realtime
        if (activeGameListener) {
            activeGameListener.unsubscribe();
            activeGameListener = null;
        }
        
        if (!currentRoomId || !window.currentUser) {
            window.location.href = '../../index.html';
            return;
        }

        // 4. (ИЗМЕНЕНИЕ) Логика удаления игрока из комнаты
        const userId = window.currentUser.uid;
        try {
            // 4.1. Получаем текущий 'players' JSON
            const { data: roomData, error: fetchError } = await supabase
                .from('rooms')
                .select('players')
                .eq('id', currentRoomId)
                .single();
            
            if (fetchError) throw fetchError;

            // 4.2. Удаляем себя из JSON
            const currentPlayers = roomData.players || {};
            delete currentPlayers[userId];

            const playerCount = Object.keys(currentPlayers).length;

            if (playerCount === 0) {
                // 4.3. Если игроков не осталось - УДАЛЯЕМ комнату
                console.log("Последний игрок покинул TTT. Удаляем комнату.");
                const { error: deleteError } = await supabase
                    .from('rooms')
                    .delete()
                    .eq('id', currentRoomId);
                
                if (deleteError) throw deleteError;
                
            } else {
                // 4.4. Если кто-то остался - ОБНОВЛЯЕМ JSON
                const { error: updateError } = await supabase
                    .from('rooms')
                    .update({ players: currentPlayers }) 
                    .eq('id', currentRoomId);
                
                if (updateError) throw updateError;
            }

        } catch (error) {
            console.error("Ошибка при выходе из комнаты TTT:", error);
        } finally {
            // 5. В любом случае уходим на главную
            currentRoomId = null;
            mySymbol = null;
            window.location.href = '../../index.html';
        }
    };

    // --- Навешиваем обработчики ---
    leaveGameBtn.addEventListener('click', closeGame);
    
    // ===================================================================
    // 6. ЗАПУСК
    // ===================================================================
    initializeGame();

}); // Конец 'DOMContentLoaded'
