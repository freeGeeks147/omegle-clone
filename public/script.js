const socket = io();
const statusEl = document.getElementById('status');
const videoChat = document.getElementById('video-chat');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');

let pc;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function addMessage(text, self) {
  const div = document.createElement('div');
  div.className = 'message';
  div.style.textAlign = self ? 'right' : 'left';
  div.innerText = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

socket.on('waiting', () => statusEl.innerText = 'Waiting for a partner...');

socket.on('start', async () => {
  statusEl.style.display = 'none';
  videoChat.style.display = 'flex';

  // Capture local media
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = stream;

  pc = new RTCPeerConnection(config);
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('signal', { candidate: e.candidate });
  };
  pc.ontrack = e => { remoteVideo.srcObject = e.streams[0]; };

  // Offer/answer logic
  socket.on('signal', async msg => {
    if (msg.sdp) {
      await pc.setRemoteDescription(msg.sdp);
      if (msg.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else if (msg.candidate) {
      await pc.addIceCandidate(msg.candidate);
    }
  });

  // Create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { sdp: pc.localDescription });
});

socket.on('message', msg => addMessage(msg, false));
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    addMessage(inputEl.value, true);
    inputEl.value = '';
  }
});

socket.on('partner-disconnected', () => {
  alert('Partner disconnected');
  location.reload();
});
