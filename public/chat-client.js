// public/chat-client.js
document.addEventListener('DOMContentLoaded', () => {
  // 1) validate entry data
  const gender       = sessionStorage.getItem('gender');
  const ageOK        = sessionStorage.getItem('ageConfirmed') === 'true';
  const tcOK         = sessionStorage.getItem('tcConfirmed') === 'true';
  const rawLoc       = sessionStorage.getItem('location') || 'Unknown';
  if (!gender || !ageOK || !tcOK) {
    return window.location.href = '/';
  }

  (async () => {
    // 2) reverse-geocode BEFORE creating socket
    let country = 'Unknown';
    if (rawLoc.includes(',')) {
      const [lat, lon] = rawLoc.split(',').map(s => s.trim());
      try {
        const res  = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client` +
          `?latitude=${encodeURIComponent(lat)}` +
          `&longitude=${encodeURIComponent(lon)}` +
          `&localityLanguage=en`
        );
        if (res.ok) {
          const data = await res.json();
          country = data.countryName || country;
        }
      } catch (err) {
        console.warn('Reverse-geocode failed:', err);
      }
    } else {
      country = rawLoc;
    }

    // 3) now open socket with real country
    const socket = io({ auth: { gender, location: country } });

    // 4) grab your DOM nodes
    const statusEl    = document.getElementById('status');
    const messagesEl  = document.getElementById('messages');
    const inputEl     = document.getElementById('input');
    const sendBtn     = document.getElementById('send-btn');
    const nextBtn     = document.getElementById('next-btn');
    const localVideo  = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const volSlider   = document.getElementById('remote-volume');
    const muteBtn     = document.getElementById('mute-btn');
    const header      = document.getElementById('chat-header');

    // ensure partner-info slot exists
    let partnerInfo = document.getElementById('partner-info');
    if (!partnerInfo) {
      partnerInfo = document.createElement('div');
      partnerInfo.id = 'partner-info';
      partnerInfo.style.display = 'none';
      header.appendChild(partnerInfo);
    }

    // allow multiline messages
    const style = document.createElement('style');
    style.textContent = `.message { white-space: pre-wrap; }`;
    document.head.appendChild(style);

    // text input handlers
    inputEl.addEventListener('input',  () => sendBtn.disabled = !inputEl.value.trim());
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendBtn.click();
      }
    });
    sendBtn.addEventListener('click', () => {
      const txt = inputEl.value;
      if (!txt.trim()) return;
      socket.emit('message', txt);
      append('You', txt);
      inputEl.value = '';
      sendBtn.disabled = true;
    });
    nextBtn.addEventListener('click', () => window.location.reload());

    // WebRTC setup
    let pc, localStream;
    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    socket.on('waiting', () => {
      statusEl.innerText = 'Waiting for partner…';
    });

    socket.on('start', async ({ initiator, partner }) => {
      statusEl.style.display = 'none';

      // show partner info
      const icon = partner.gender === 'male'   ? '♂️'
                 : partner.gender === 'female' ? '♀️'
                 : '⚧';
      partnerInfo.innerText   = `${icon} ${partner.gender}, from ${partner.location}`;
      partnerInfo.style.display = 'block';

      // 1) getUserMedia
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate:{ max:25 } },
          audio: true
        });
      } catch (err) {
        statusEl.innerText = 'Camera/mic access error';
        console.error(err);
        return;
      }
      localVideo.srcObject = localStream;
      localVideo.muted     = true;

      // 2) remote audio volume
      volSlider.addEventListener('input', () => {
        remoteVideo.volume = parseFloat(volSlider.value);
      });

      // 3) mute/unmute local mic
      let micOn = true;
      muteBtn.addEventListener('click', () => {
        micOn = !micOn;
        localStream.getAudioTracks().forEach(t => t.enabled = micOn);
        muteBtn.textContent = micOn ? '🎙️' : '🔇';
      });

      // 4) build RTCPeerConnection
      pc = new RTCPeerConnection(rtcConfig);
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

      pc.ontrack = evt => {
        // send every incoming track into a MediaStream for remoteVideo
        const remoteStream = remoteVideo.srcObject || new MediaStream();
        evt.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
        remoteVideo.srcObject = remoteStream;
      };
      pc.onicecandidate = e => e.candidate && socket.emit('signal', { candidate: e.candidate });

      socket.on('signal', async data => {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { sdp: pc.localDescription });
          }
        } else if (data.candidate) {
          await pc.addIceCandidate(data.candidate);
        }
      });

      // 5) if I’m the initiator, kick off the offer
      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { sdp: pc.localDescription });
      }
    });

    // chat message handlers
    socket.on('message', msg => append('Peer', msg));
    socket.on('partner-disconnected', () => {
      pc?.close();
      window.location.reload();
    });

    // helper to append a text bubble
    function append(who, text) {
      const d = document.createElement('div');
      d.className = 'message ' + (who === 'You' ? 'self' : 'other');
      d.innerText = text;
      messagesEl.appendChild(d);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  })();
});
