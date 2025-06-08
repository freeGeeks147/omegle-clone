// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const gender = sessionStorage.getItem('gender');
  const rawLocation = sessionStorage.getItem('location');
  if (!gender || !rawLocation) {
    window.location.href = '/';
    return;
  }

  (async () => {
    // 1. Resolve rawLocation ("lat, lon") into country name via BigDataCloud API
    let location = 'Unknown';
    if (rawLocation.includes(',')) {
      const [lat, lon] = rawLocation.split(',').map(s => s.trim());
      try {
        const resp = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`
        );
        if (resp.ok) {
          const data = await resp.json();
          location = data.countryName || 'Unknown';
        }
      } catch (err) {
        console.warn('Reverse geocoding failed:', err);
      }
    } else {
      // if rawLocation was already a string (e.g. "Unknown")
      location = rawLocation;
    }

    // 2. Initialize socket with gender & resolved country
    const socket = io({ auth: { gender, location } });

    // 3. Grab UI elements
    const statusEl      = document.getElementById('status');
    const messagesEl    = document.getElementById('messages');
    const inputEl       = document.getElementById('input');
    const sendBtn       = document.getElementById('send-btn');
    const nextBtn       = document.getElementById('next-btn');
    const localVideo    = document.getElementById('localVideo');
    const remoteVideo   = document.getElementById('remoteVideo');
    const remoteVolume  = document.getElementById('remote-volume');
    const muteBtn       = document.getElementById('mute-btn');
    const partnerInfoEl = document.getElementById('partner-info');

    let localStream, pc, isMuted = false;

    // Enable send button only when there's text
    inputEl.addEventListener('input', () => {
      sendBtn.disabled = !inputEl.value.trim();
    });

    // Send text messages
    sendBtn.addEventListener('click', () => {
      const msg = inputEl.value.trim();
      if (!msg) return;
      socket.emit('message', msg);
      appendMessage('You', msg);
      inputEl.value = '';
      sendBtn.disabled = true;
    });

    // Next → reload for a new partner
    nextBtn.addEventListener('click', () => window.location.reload());

    // Control partner's volume
    remoteVolume.addEventListener('input', e => {
      remoteVideo.volume = e.target.value;
    });

    // Mute/unmute our mic
    muteBtn.addEventListener('click', () => {
      if (!localStream) return;
      isMuted = !isMuted;
      localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      muteBtn.textContent = isMuted ? '🔇' : '🎙️';
    });

    socket.on('waiting', () => {
      statusEl.innerText = 'Waiting for partner…';
    });

    socket.on('start', async ({ initiator, partner }) => {
      statusEl.style.display = 'none';

      // Display partner’s gender & country
      const icon = partner.gender === 'male'   ? '♂️'
                 : partner.gender === 'female' ? '♀️'
                 : '';
      const label = partner.gender
        ? partner.gender[0].toUpperCase() + partner.gender.slice(1)
        : 'Unknown';
      partnerInfoEl.innerText = `${icon} ${label}, from ${partner.location}`;
      partnerInfoEl.style.display = 'block';

      // 4. Acquire local media
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: { max: 25 } },
          audio: true
        });
      } catch (err) {
        statusEl.innerText = 'Camera/mic access error';
        console.error(err);
        return;
      }
      localVideo.srcObject = localStream;

      // 5. Set up WebRTC connection
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.addEventListener('track', e => {
        if (remoteVideo.srcObject !== e.streams[0]) {
          remoteVideo.srcObject = e.streams[0];
        }
      });
      pc.addEventListener('icecandidate', e => {
        if (e.candidate) socket.emit('signal', { candidate: e.candidate });
      });

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
            await pc.addIceCandidate(data.candidate);
          } catch (err) {
            console.error('ICE candidate error:', err);
          }
        }
      });

      if (initiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('signal', { sdp: pc.localDescription });
        } catch (err) {
          console.error('Offer creation error:', err);
        }
      }

      socket.on('message', msg => appendMessage('Stranger', msg));
      socket.on('partner-disconnected', () => appendMessage('System', 'Partner disconnected'));
    });

    function appendMessage(sender, message) {
      const el = document.createElement('div');
      el.innerHTML = `<strong>${sender}:</strong> ${message}`;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  })();
});
