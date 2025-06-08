// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  const genderRaw = sessionStorage.getItem('gender');
  const locationRaw = sessionStorage.getItem('location');
  const prefsRaw = sessionStorage.getItem('prefs');
  if (!genderRaw || !locationRaw || !prefsRaw) {
    window.location.href = '/';
    return;
  }

  (async () => {
    // reverse-geocode to get country name
    let country = 'Unknown';
    if (locationRaw.includes(',')) {
      const [lat, lon] = locationRaw.split(',').map(s => s.trim());
      try {
        const resp = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        );
        if (resp.ok) {
          const data = await resp.json();
          country = data.countryName || 'Unknown';
        }
      } catch (err) {
        console.warn('Geocoding failed:', err);
      }
    }

    const prefs = JSON.parse(prefsRaw);
    const socket = io({ auth: { gender: genderRaw, location: country, prefs } });

    const statusEl     = document.getElementById('status');
    const messagesEl   = document.getElementById('messages');
    const inputEl      = document.getElementById('input');
    const sendBtn      = document.getElementById('send-btn');
    const nextBtn      = document.getElementById('next-btn');
    const localVideo   = document.getElementById('localVideo');
    const remoteVideo  = document.getElementById('remoteVideo');
    const remoteVolume = document.getElementById('remote-volume');
    const muteBtn      = document.getElementById('mute-btn');
    const partnerInfo  = document.getElementById('partner-info');

    let localStream, pc, isMuted = false;

    inputEl.addEventListener('input', () => {
      sendBtn.disabled = !inputEl.value.trim();
    });
    sendBtn.addEventListener('click', () => {
      const msg = inputEl.value.trim();
      if (!msg) return;
      socket.emit('message', msg);
      append('You', msg);
      inputEl.value = '';
      sendBtn.disabled = true;
    });
    nextBtn.addEventListener('click', () => window.location.reload());
    remoteVolume.addEventListener('input', e => {
      remoteVideo.volume = e.target.value;
    });
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
      const icon = partner.gender === 'male'   ? '♂️'
                 : partner.gender === 'female' ? '♀️'
                 : '';
      const label = partner.gender
        ? partner.gender.charAt(0).toUpperCase() + partner.gender.slice(1)
        : 'Unknown';
      partnerInfo.innerText = `${icon} ${label}, from ${partner.location}`;
      partnerInfo.style.display = 'block';

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: { max: 25 } },
          audio: true
        });
      } catch {
        statusEl.innerText = 'Camera/mic error';
        return;
      }
      localVideo.srcObject = localStream;

      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.ontrack = e => {
        if (remoteVideo.srcObject !== e.streams[0]) {
          remoteVideo.srcObject = e.streams[0];
        }
      };
      pc.onicecandidate = e => {
        if (e.candidate) socket.emit('signal', { candidate: e.candidate });
      };

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
          } catch (_) {}
        }
      });

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { sdp: pc.localDescription });
      }

      socket.on('message', msg => append('Stranger', msg));
      socket.on('partner-disconnected', () => append('System', 'Partner disconnected'));
    });

    function append(who, text) {
      const d = document.createElement('div');
      d.innerHTML = `<strong>${who}:</strong> ${text}`;
      messagesEl.appendChild(d);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  })();
});
