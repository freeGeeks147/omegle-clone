// script.js
document.addEventListener('DOMContentLoaded', () => {
  const socket      = io();
  const statusEl    = document.getElementById('status');
  const messagesEl  = document.getElementById('messages');
  const inputEl     = document.getElementById('input');
  const sendBtn     = document.getElementById('send-btn');
  const nextBtn     = document.getElementById('next-btn');
  const localVideo  = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');

  let pc, localStream;
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  // enable send on input & send on Enter
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim();
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && inputEl.value.trim()) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Signaling
  socket.on('signal', async data => {
    if (!pc) return;
    try {
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (pc.remoteDescription.type === 'offer') {
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('signal', { sdp: pc.localDescription });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate);
      }
    } catch (e) { console.error(e); }
  });

  socket.on('waiting', () => {
    statusEl.innerText = 'Waiting for partner...';
  });

  socket.on('start', async ({ initiator }) => {
    statusEl.style.display = 'none';

    // 1) getUserMedia
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { max: 25 } },
        audio: true
      });
    } catch (err) {
      statusEl.innerText = 'Camera/mic access error';
      return console.error(err);
    }

    localVideo.srcObject = localStream;
    localVideo.muted      = true;

    // 2) prepare remote stream
    const remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    // start muted; will unmute on peer's signal
    remoteVideo.muted = true;
    remoteVideo.onloadedmetadata = () => {
      remoteVideo.play().catch(()=>{});
    };

    // 3) create RTCPeerConnection
    pc = new RTCPeerConnection(config);

    // 4) add local tracks + throttle bitrate
    localStream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, localStream);
      if (track.kind === 'video' && sender.setParameters) {
        const p = sender.getParameters();
        p.encodings = [{ maxBitrate: 500_000 }];
        sender.setParameters(p);
      }
    });

    pc.onicecandidate = ({ candidate }) =>
      candidate && socket.emit('signal', { candidate });

    pc.ontrack = evt =>
      evt.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));

    // 5) offer/answer
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { sdp: pc.localDescription });
    }

    // 7) fullscreen on double-click
    [localVideo, remoteVideo].forEach(v => {
      v.addEventListener('dblclick', () => {
        v.requestFullscreen?.();
      });
    });

    // listen for peer mute/unmute
    socket.on('mute',   () => remoteVideo.muted = true);
    socket.on('unmute', () => remoteVideo.muted = false);
  });

  // CHAT
  sendBtn.addEventListener('click', () => {
    const txt = inputEl.value.trim();
    if (!txt) return;
    socket.emit('message', txt);
    append('You', txt);
    inputEl.value = '';
    sendBtn.disabled = true;
  });
  socket.on('message', msg => append('Peer', msg));

  nextBtn.addEventListener('click', () => {
    pc?.close();
    location.reload();
  });

  socket.on('partner-disconnected', () => {
    pc?.close();
    location.reload();
  });

  function append(who, text) {
    const div = document.createElement('div');
    div.className = who === 'You' ? 'message self' : 'message other';
    div.innerText = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
});
