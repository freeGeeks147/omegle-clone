const socket = io();
const statusEl = document.getElementById('status');
const wrapper = document.getElementById('wrapper');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');

let pc, localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

socket.on('waiting', () => statusEl.innerText = 'Waiting for a partner...');

socket.on('start', async ({ initiator }) => {
  statusEl.style.display = 'none';
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = e => e.candidate && socket.emit('signal', { candidate: e.candidate });
  pc.ontrack = e => remoteStream.addTrack(e.track);

  socket.on('signal', async data => {
    if (data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  });

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { sdp: pc.localDescription });
  }

  // Double-click fullscreen
  [localVideo, remoteVideo].forEach(v => v.addEventListener('dblclick', () => v.requestFullscreen()));
});

socket.on('message', msg => {
  const div = document.createElement('div');
  div.className = 'message other'; div.innerText = msg;
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const div = document.createElement('div');
    div.className = 'message self'; div.innerText = inputEl.value;
    messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  }
});

socket.on('partner-disconnected', () => { alert('Partner disconnected'); location.reload(); });
