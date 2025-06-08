// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  // --- retrieve and validate entry data ---
  const gender       = sessionStorage.getItem('gender');
  const ageOK        = sessionStorage.getItem('ageConfirmed') === 'true';
  const tcOK         = sessionStorage.getItem('tcConfirmed') === 'true';
  const rawLoc       = sessionStorage.getItem('location') || 'Unknown';
  if (!gender || !ageOK || !tcOK) {
    return window.location.href = '/';
  }

  // --- reverse-geocode lat/lon → country name ---
  let country = 'Unknown';
  if (rawLoc.includes(',')) {
    const [lat, lon] = rawLoc.split(',').map(s => s.trim());
    fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      `&localityLanguage=en`
    )
    .then(r => r.json())
    .then(data => country = data.countryName || country)
    .catch(_ => {});
  } else {
    country = rawLoc;
  }

  // --- open socket with your info ---
  const socket = io({ auth: { gender, location: country } });

  // --- UI elements ---
  const statusEl    = document.getElementById('status');
  const messagesEl  = document.getElementById('messages');
  const inputEl     = document.getElementById('input');
  const sendBtn     = document.getElementById('send-btn');
  const nextBtn     = document.getElementById('next-btn');
  const localVideo  = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const volSlider   = document.getElementById('remote-volume');
  const muteBtn     = document.getElementById('mute-btn');
  const partnerInfo = document.createElement('div');

  // insert partner-info into header
  const header = document.getElementById('chat-header');
  partnerInfo.id = 'partner-info';
  partnerInfo.style.display = 'none';
  header.appendChild(partnerInfo);

  // preserve line breaks in messages
  const style = document.createElement('style');
  style.textContent = `
    .message { white-space: pre-wrap; }
  `;
  document.head.appendChild(style);

  // enable send button on input
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim();
  });

  // send on Enter (Shift+Enter → newline)
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendBtn.click();
    }
  });

  // send button handler
  sendBtn.addEventListener('click', () => {
    const txt = inputEl.value;
    if (!txt.trim()) return;
    socket.emit('message', txt);
    append('You', txt);
    inputEl.value = '';
    sendBtn.disabled = true;
  });

  // reload for a new partner
  nextBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // receive remote text
  socket.on('message', msg => {
    append('Peer', msg);
  });

  // receive mute toggle
  socket.on('mute',   () => remoteVideo.muted  = true);
  socket.on('unmute', () => remoteVideo.muted  = false);

  // --- signaling & media setup ---
  let pc, localStream;
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  socket.on('waiting', () => {
    statusEl.innerText = 'Waiting for partner…';
  });

  socket.on('start', async ({ initiator, partner }) => {
    // hide status, show partner’s info
    statusEl.style.display = 'none';
    const icon  = partner.gender === 'male'   ? '♂️'
                : partner.gender === 'female' ? '♀️'
                : '⚧';
    partnerInfo.innerText = `${icon} ${partner.gender}, from ${partner.location}`;
    partnerInfo.style.display = 'block';

    // get camera + mic
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate:{ max:25 } },
        audio: true
      });
    } catch (err) {
      statusEl.innerText = 'Camera/mic access error';
      return console.error(err);
    }
    localVideo.srcObject = localStream;
    localVideo.muted     = true;

    // partner volume control
    remoteVideo.srcObject = new MediaStream();
    volSlider.addEventListener('input', () => {
      remoteVideo.volume = parseFloat(volSlider.value);
    });

    // mute/unmute local mic
    let micOn = true;
    muteBtn.addEventListener('click', () => {
      micOn = !micOn;
      localStream.getAudioTracks().forEach(t => t.enabled = micOn);
      muteBtn.textContent = micOn ? '🎙️' : '🔇';
    });

    // build peer connection
    pc = new RTCPeerConnection(config);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = e => e.streams[0].getTracks().forEach(t => remoteVideo.srcObject.addTrack(t));
    pc.onicecandidate = e => e.candidate && socket.emit('signal', { candidate: e.candidate });

    socket.on('signal', async data => {
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('signal', { sdp: pc.localDescription });
        }
      } else {
        await pc.addIceCandidate(data.candidate);
      }
    });

    // if we initiated, create & send offer
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { sdp: pc.localDescription });
    }
  });

  socket.on('partner-disconnected', () => {
    pc?.close();
    window.location.reload();
  });

  // helper to append a chat bubble
  function append(who, text) {
    const div = document.createElement('div');
    div.className = who === 'You' ? 'message self' : 'message other';
    div.innerText = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
});
