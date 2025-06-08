const socket = io();
const statusEl = document.getElementById('status');
const chatEl = document.getElementById('chat');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');

socket.on('waiting', () => statusEl.innerText = 'Waiting for a partner...');
socket.on('paired', () => {
  statusEl.style.display = 'none';
  chatEl.style.display = 'block';
});

socket.on('message', msg => {
  const div = document.createElement('div');
  div.innerText = `Stranger: ${msg}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on('partner-disconnected', () => {
  alert('Your partner disconnected. Refresh to find a new one.');
  window.location.reload();
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const div = document.createElement('div');
    div.innerText = `You: ${inputEl.value}`;
    messagesEl.appendChild(div);
    inputEl.value = '';
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
});