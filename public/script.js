const socket = io();

// Tab navigation
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
});

// Video and Text elements
const statusEl = document.getElementById('status');
const videosEl = document.getElementById('videos');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const textStatus = document.getElementById('text-status');
const chatEl = document.getElementById('chat');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');

let pc;
let localStream;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

socket.on('waiting', () => textStatus.innerText = 'Waiting for a partner...');

socket.on('paired', () => {
  textStatus.classList.add('hidden');
  chatEl.classList.remove('hidden');
});

socket.on('message', msg => {
  const div = document.createElement('div');
  div.className = 'message'; div.innerText = msg;
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on('startVideo', async ({ initiator }) => {
  statusEl.classList.add('hidden');
  videosEl.classList.remove('hidden');

  // Capture local media (video + audio)
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localVideo.muted = true;

  // Set up peer connection and remote stream
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  pc = new RTCPeerConnection(config);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = event => {
    if (event.candidate) socket.emit('signal', { candidate: event.candidate });
  };

  pc.ontrack = event => {
    // Attach entire remote stream (video+audio)
    event.streams[0] && (remoteStream.addTrack(event.track));
  };

  // Handle incoming signaling data
  socket.on('signal', async data => {
    if (data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('ICE candidate error:', err);
      }
    }
  });

  // Initiator sends offer
  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { sdp: pc.localDescription });
  }

  // Double-click to fullscreen
  [localVideo, remoteVideo].forEach(v => {
    v.addEventListener('dblclick', () => {
      if (v.requestFullscreen) v.requestFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
      else if (v.msRequestFullscreen) v.msRequestFullscreen();
    });
  });
});

// Send text messages
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && inputEl.value.trim()) {
    socket.emit('message', inputEl.value);
    const div = document.createElement('div'); div.className = 'message'; div.innerText = inputEl.value;
    messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  }
});

socket.on('partner-disconnected', () => { alert('Partner disconnected'); location.reload(); });
