const socket = io();
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const nextBtn = document.getElementById('next-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
let pc, localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

socket.on('waiting', () => {
  statusEl.innerText = 'Waiting for partner...';
});

socket.on('start', async ({ initiator }) => {
  statusEl.style.display = 'none';
  // get media
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  // remote stream
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // correct ICE candidate emit
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('signal', { candidate });
  };

  pc.ontrack = ({ track }) => {
    remoteStream.addTrack(track);
  };

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

  // fullscreen on dblclick
  [localVideo, remoteVideo].forEach(v => {
    v.addEventListener('dblclick', () => v.requestFullscreen());
  });
});

socket.on('message', msg => {
  const div = document.createElement('div');
  div.className = 'message other';
  div.innerText = msg;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const div = document.createElement('div');
    div.className = 'message self';
    div.innerText = inputEl.value;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  }
});

nextBtn.addEventListener('click', () => location.reload());

socket.on('partner-disconnected', () => {
  alert('Partner disconnected');
  location.reload();
});
