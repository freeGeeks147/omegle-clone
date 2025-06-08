const socket = io();
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const nextBtn = document.getElementById('next-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
let pc, localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Pairing
socket.on('waiting', () => statusEl.innerText = 'Waiting for a partner...');
socket.on('start', async ({ initiator }) => {
  statusEl.style.display = 'none';
  // get media
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.onicecandidate = e => e.candidate && socket.emit('signal', e);
  pc.ontrack = e => remoteStream.addTrack(e.track);
  socket.on('signal', async data => {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  });
  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { sdp: pc.localDescription });
  }
});

// Text chat
socket.on('message', msg => {
  const d = document.createElement('div'); d.className = 'message other'; d.innerText = msg;
  messagesEl.appendChild(d); messagesEl.scrollTop = messagesEl.scrollHeight;
});
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const d = document.createElement('div'); d.className = 'message self'; d.innerText = inputEl.value;
    messagesEl.appendChild(d); messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  }
});

// Next button reloads for new partner
nextBtn.addEventListener('click', () => location.reload());

// Disconnect
socket.on('partner-disconnected', () => { alert('Partner disconnected'); location.reload(); });
