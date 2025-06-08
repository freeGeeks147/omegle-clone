const socket = io();
// Tab navigation
document.querySelectorAll('header nav button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('header nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  };
});

// Video Chat Elements
const statusEl = document.getElementById('status');
const videosEl = document.getElementById('videos');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Text Chat Elements
const textStatus = document.getElementById('text-status');
const chatEl = document.getElementById('chat');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');

let pc;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// === Socket Events ===
socket.on('waiting', () => textStatus.innerText = 'Waiting for a partner...');

socket.on('paired', () => {
  textStatus.style.display = 'none';
  chatEl.classList.remove('hidden');
});

socket.on('message', msg => {
  const d = document.createElement('div'); d.className = 'message'; d.innerText = msg;
  messagesEl.appendChild(d); messagesEl.scrollTop = messagesEl.scrollHeight;
});

// === Video Setup ===
socket.on('startVideo', async () => {
  statusEl.style.display = 'none';
  videosEl.classList.remove('hidden');
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = stream;
  pc = new RTCPeerConnection(config);
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  pc.onicecandidate = e => e.candidate && socket.emit('signal', e);
  pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
  socket.on('signal', async data => {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else {
      await pc.addIceCandidate(data);
    }
  });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { sdp: pc.localDescription });
});

// === Text Chat Send ===
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const d = document.createElement('div'); d.className = 'message'; d.innerText = inputEl.value;
    messagesEl.appendChild(d); messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  }
});

socket.on('partner-disconnected', () => {
  alert('Partner disconnected'); location.reload();
});
