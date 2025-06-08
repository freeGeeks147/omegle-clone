const socket = io();
const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const nextBtn = document.getElementById('next-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const volumeSlider = document.getElementById('volume-slider');

let pc;
let localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Single signal handler
socket.on('signal', async data => {
  if (!pc) return;
  try {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (pc.remoteDescription.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (e) {
    console.error('Signal error:', e);
  }
});

socket.on('waiting', () => statusEl.innerText = 'Waiting for partner...');

socket.on('start', async ({ initiator }) => {
  statusEl.style.display = 'none';

  // Capture compressed video + audio
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 300, height: 200, frameRate: { max: 10 } },
    audio: true
  });
  localVideo.srcObject = localStream;
  localVideo.muted = true;

  // Setup remote stream
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  remoteVideo.muted = false;

  // Peer connection
  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(track => {
    const sender = pc.addTrack(track, localStream);
    if (track.kind === 'video' && sender.setParameters) {
      const params = sender.getParameters();
      params.encodings = [{ maxBitrate: 150_000 }];
      sender.setParameters(params);
    }
  });

  pc.onicecandidate = ({ candidate }) => candidate && socket.emit('signal', { candidate });
  pc.ontrack = e => e.streams[0] && e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { sdp: pc.localDescription });
  }

  // Fullscreen toggles
  [localVideo, remoteVideo].forEach(v => v.addEventListener('dblclick', () => v.requestFullscreen()));

  // Volume control
  volumeSlider.oninput = () => remoteVideo.volume = parseFloat(volumeSlider.value);
});

// Chat controls
sendBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit('message', text);
  const msg = document.createElement('div');
  msg.className = 'message self';
  msg.innerText = text;
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  inputEl.value = '';
};

nextBtn.onclick = () => location.reload();

socket.on('message', msg => {
  const el = document.createElement('div');
  el.className = 'message other';
  el.innerText = msg;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on('partner-disconnected', () => { alert('Partner disconnected'); location.reload(); });
