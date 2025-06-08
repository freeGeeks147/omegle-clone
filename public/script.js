const socket = io();
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const nextBtn = document.getElementById('next-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
let pc, localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

socket.on('waiting', () => statusEl.innerText = 'Waiting for partner...');

socket.on('start', async ({ initiator }) => {
  statusEl.style.display = 'none';

  // capture media
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localVideo.muted = true;
  localVideo.autoplay = true;
  localVideo.play().catch(()=>{});

  // remote stream
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  remoteVideo.muted = false;
  remoteVideo.autoplay = true;
  remoteVideo.play().catch(()=>{});

  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = ({ candidate }) => candidate && socket.emit('signal', { candidate });
  pc.ontrack = ({ track }) => remoteStream.addTrack(track);

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

  // fullscreen on dblclick
  [localVideo, remoteVideo].forEach(v => v.addEventListener('dblclick', () => v.requestFullscreen()));
});

socket.on('message', msg => {
  const d = document.createElement('div'); d.className = 'message other'; d.innerText = msg;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const d = document.createElement('div'); d.className = 'message self'; d.innerText = inputEl.value;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  }
});

nextBtn.addEventListener('click', () => location.reload());

socket.on('partner-disconnected', () => { alert('Partner disconnected'); location.reload(); });
