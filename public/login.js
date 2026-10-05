const form = document.querySelector('#login-form');
const errorMessage = document.querySelector('#login-error');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  errorMessage.hidden = true;
  try {
    const response = await fetch(new URL('api/auth/login', document.baseURI), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Accesso non riuscito.');
    window.location.assign(new URL('./', document.baseURI));
  } catch (error) {
    errorMessage.textContent = error.message || 'Impossibile contattare il server.';
    errorMessage.hidden = false;
    button.disabled = false;
  }
});
