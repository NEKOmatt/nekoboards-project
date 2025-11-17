// JavaScript файл для NEKOboards
console.log("Supabase (supabase-init.js) загружен!");

// ===================================================================
// 1. КОНФИГУРАЦИЯ SUPABASE
// ===================================================================

//
// ⛔️ ВАЖНО! ⛔️
// Вставь сюда свои ключи из настроек проекта Supabase
//
const SUPABASE_URL = 'https://skjippdxeclialfwmjaj.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNramlwcGR4ZWNsaWFsZndtamFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMTY1MDgsImV4cCI6MjA3ODg5MjUwOH0.g-2d_3whlWqoaqLqwjzyBNi7b8urk2fBE9YARYFxKtk';

// Создаем клиент Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Экспортируем клиент, чтобы он был доступен в других скриптах
// (Мы будем использовать 'db' вместо 'auth' и 'database' из Firebase)
window.supabaseClient = db;
