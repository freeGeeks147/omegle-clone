// public/script.js

let captchaToken = '';

function onCaptchaSuccess(token) {
  captchaToken = token;
  checkGate();
}
function onCaptchaExpired() {
  captchaToken = '';
  checkGate();
}

function checkGate() {
  const gender = document.querySelector('input[name=gender]:checked');
  const isAdult = document.getElementById('age-check').checked;
  const ok = gender && isAdult && captchaToken;
  document.getElementById('enter-btn').disabled = !ok;
}

document.addEventListener('DOMContentLoaded', () => {
  const enterBtn = document.getElementById('enter-btn');
  document.getElementById('gatekeeper').addEventListener('change', checkGate);

  enterBtn.addEventListener('click', async e => {
    e.preventDefault();
    // verify on server
    const res = await fetch('/verify-captcha', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ token: captchaToken })
    });
    if (!res.ok) {
      alert('Captcha failed – try again');
      grecaptcha.reset();
      return;
    }
    // show main UI
    document.getElementById('entry-form').style.display = 'none';
    document.getElementById('container').style.display  = 'block';
    initApp();
  });
});

function initApp() {
  const socket       = io();
  const statusEl     = document.getElementById('status');
  const messagesEl   = document.getElementById('messages');
  const inputEl      = document.getElementById('input');
  const sendBtn      = document.getElementById('send-btn');
  const nextBtn      = document.getElementById('next-btn');
  const localVideo   = document.getElementById('localVideo');
  const remoteVideo  = document.getElementById('remoteVideo');
  const muteBtn      = document.getElementById('mute-btn');
  const volSlider    = document.getElementById('remote-volume');

  let pc, localStream;
  const config = { iceServers:[{urls:'stun:stun.l.google.com:19302'}] };

  // text chat
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim();
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key==='Enter' && inputEl.value.trim()) {
      e.preventDefault();
      sendBtn.click();
    }
  });
  sendBtn.addEventListener('click', () => {
    const txt = inputEl.value.trim();
    socket.emit('message', txt);
    append('You', txt);
    inputEl.value = '';
    sendBtn.disabled = true;
  });
  socket.on('message', msg => append('Peer', msg));

  // next / disconnect
  nextBtn.addEventListener('click', () => {
    pc?.close(); location.reload();
  });
  socket.on('partner-disconnected', () => {
    pc?.close(); location.reload();
  });

  // signaling
  socket.on('signal', async data => {
    if (!pc) return;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (pc.remoteDescription.type==='offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        socket.emit('signal',{sdp:pc.localDescription});
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  });
  socket.on('waiting', () => statusEl.textContent='Waiting…');

  socket.on('start', async ({initiator}) => {
    statusEl.style.display = 'none';
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video:{width:640,height:480}, audio:true });
    } catch {
      statusEl.textContent = 'Camera/mic error';
      return;
    }
    localVideo.srcObject = localStream;
    localVideo.muted      = true;

    const remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    remoteVideo.muted     = false;

    pc = new RTCPeerConnection(config);
    localStream.getTracks().forEach(t => {
      const sender = pc.addTrack(t, localStream);
      if (t.kind==='video' && sender.setParameters) {
        const p = sender.getParameters();
        p.encodings = [{maxBitrate:500_000}];
        sender.setParameters(p);
      }
    });
    pc.onicecandidate = e => e.candidate && socket.emit('signal',{candidate:e.candidate});
    pc.ontrack       = e => e.streams[0].getTracks().forEach(t=>remoteStream.addTrack(t));

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal',{sdp:pc.localDescription});
    }

    // local mic toggle
    let micOn = true;
    muteBtn.addEventListener('click',() => {
      micOn = !micOn;
      localStream.getAudioTracks().forEach(t=>t.enabled=micOn);
      muteBtn.textContent = micOn ? '🎙️' : '🔇';
      socket.emit(micOn ? 'unmute':'mute');
    });

    // remote mute/unmute UI
    socket.on('mute',   () => remoteVideo.muted = true);
    socket.on('unmute', () => remoteVideo.muted = false);

    // remote volume slider
    remoteVideo.volume = parseFloat(volSlider.value);
    volSlider.addEventListener('input',() => {
      remoteVideo.volume = parseFloat(volSlider.value);
    });
  });

  function append(who, txt) {
    const d = document.createElement('div');
    d.className = who==='You'?'message self':'message other';
    d.textContent = txt;
    messagesEl.appendChild(d);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}
