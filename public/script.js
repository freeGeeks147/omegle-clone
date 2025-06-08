const socket = io();
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const nextBtn = document.getElementById('next-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let pc;
let localStream;
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

// Handle incoming signaling data (once)
socket.on('signal', async data => {
  if (!pc) return;
  try {
    if (data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (pc.remoteDescription.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error('Signal handling error:', err);
  }
});

// Waiting state
socket.on('waiting', () => {
  statusEl.innerText = 'Waiting for partner...';
});

// Start WebRTC
socket.on('start', async ({ initiator }) => {
  statusEl.style.display = 'none';

  // Capture local media
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localVideo.muted = true;

  // Prepare remote stream
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  // Create peer connection
  pc = new RTCPeerConnection(config);

  // ICE candidates
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('signal', { candidate });
  };

  // Remote track
  pc.ontrack = ({ track }) => {
    remoteStream.addTrack(track);
  };

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Initiator sends offer
  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { sdp: pc.localDescription });
  }

  // Fullscreen on double-click
  [localVideo, remoteVideo].forEach(v => {
    v.addEventListener('dblclick', () => v.requestFullscreen());
  });
});

// Text chat
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

// Next for new partner
nextBtn.addEventListener('click', () => location.reload());

// Partner disconnected
socket.on('partner-disconnected', () => {
  alert('Partner disconnected');
  location.reload();
});
