const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const formData = new FormData(loginForm);
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: formData.get('login'),
        password: formData.get('password')
      })
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || 'Не удалось войти';
      loginError.hidden = false;
      submitBtn.disabled = false;
      return;
    }
    // Успех: сессия установлена сервером, переходим в саму панель —
    // её разметку и скрипт браузер загрузит только теперь, уже авторизованным.
    window.location.href = '/admin/posts';
  } catch (err) {
    loginError.textContent = 'Ошибка соединения с сервером';
    loginError.hidden = false;
    submitBtn.disabled = false;
  }
});
