// JavaScript файл для NEKOboards
console.log("Логика аутентификации (auth.js) загружена!");

document.addEventListener('DOMContentLoaded', () => {
    
    // (ИЗМЕНЕНИЕ) Получаем клиент Supabase из global scope
    const auth = window.supabaseClient;
    // 'database' нам здесь больше не нужен для регистрации,
    // но он понадобится для создания 'profile'
    
    // ===================================================================
    // 2. ЛОГИКА ОТОБРАЖЕНИЯ МОДАЛЬНОГО ОКНА (АУТЕНТИФИКАЦИИ)
    // ===================================================================
    // (Без изменений)

    const showLoginBtn = document.getElementById('show-login-btn');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const modalOverlay = document.getElementById('auth-modal-overlay');
    const modalContainer = document.getElementById('auth-modal-container');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    const welcomeMessage = document.getElementById('welcome-message');
    
    const openModal = () => modalOverlay.classList.remove('hidden');
    const closeModal = () => modalOverlay.classList.add('hidden');
    
    const showLoginForm = () => {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        openModal();
    };
    const showRegisterForm = () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        openModal();
    };

    showLoginBtn.addEventListener('click', showLoginForm);
    showRegisterBtn.addEventListener('click', showRegisterForm);
    showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
    showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // ===================================================================
    // 3. ЛОГИКА АУТЕНТИФИКАЦИИ (Supabase)
    // ===================================================================

    // (ИЗМЕНЕНИЕ) setPersistence больше не нужен. Supabase
    // по умолчанию использует localStorage.

    // --- Обработчик Регистрации (Supabase) ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const username = document.getElementById('register-username').value; 

        try {
            // Шаг 1: Создаем пользователя в Supabase Auth
            const { data: authData, error: authError } = await auth.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Пользователь не был создан.");
            
            console.log('Пользователь создан в Auth:', authData.user);

            // Шаг 2: Создаем запись в нашей публичной таблице 'profiles'
            // (Это НЕОБХОДИМО, т.к. auth.users() приватная)
            const { error: profileError } = await auth
                .from('profiles')
                .insert({
                    id: authData.user.id, // Связываем с ID из Auth
                    username: username,
                    email: email,
                    status: 'offline'
                });

            if (profileError) throw profileError;

            alert('Регистрация прошла успешно! Проверьте email для подтверждения.');
            closeModal(); 
            
            welcomeMessage.textContent = `Добро пожаловать, ${username}! Можете входить.`;
            showLoginBtn.classList.add('hidden');
            showRegisterBtn.classList.add('hidden');
        
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            alert(`Ошибка: ${error.message}`);
        }
    });

    // --- Обработчик Входа (Supabase) ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            // (ИЗМЕНЕНИЕ) Используем signInWithPassword
            const { data, error } = await auth.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            console.log('Пользователь вошел:', data.user);
            alert('Вход выполнен успешно!');
            closeModal(); 
            
            // Логика обновления UI (username и т.д.) теперь
            // будет в main.js, в обработчике onAuthStateChange

        } catch (error) {
            console.error('Ошибка входа:', error);
            alert(`Ошибка: ${error.message}`);
        }
    });

}); // Конец 'DOMContentLoaded'
