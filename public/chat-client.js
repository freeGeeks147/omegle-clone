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

      // 1) getUserMedia with reduced load (360p @ 15fps)
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width:  { max: 640 },
            height: { max: 360 },
            frameRate: { max: 15 }
          },
          audio: true
        });
      } catch (err) {
        statusEl.innerText = 'Camera/mic access error';
        console.error(err);
        return;
      }
      localVideo.srcObject = localStream;
      localVideo.muted     = true;

      // 2) remote audio volume control
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

      // 4) build RTCPeerConnection & add tracks
      pc = new RTCPeerConnection(rtcConfig);
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

      // 5) force hardware H.264 on mobile browsers
      const h264Codecs = RTCRtpSender.getCapabilities('video')
        .codecs.filter(c => c.mimeType === 'video/H264');
      pc.getTransceivers().forEach(tr => {
        if (tr.sender.track.kind === 'video') {
          tr.setCodecPreferences(h264Codecs);
        }
      });

      // 6) throttle bitrate & downscale extra
      const videoSender = pc.getSenders()
        .find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        const params = videoSender.getParameters();
        params.encodings = [{
          maxBitrate: 200_000,       // ~200 kbps
          scaleResolutionDownBy: 2    // half again: ~320×180
        }];
        await videoSender.setParameters(params);
      }

      // 7) set up ICE candidate handling
      pc.onicecandidate = e => {
        if (e.candidate) socket.emit('signal', { candidate: e.candidate });
      };

      // 8) handle incoming tracks
      pc.ontrack = evt => {
        const remoteStream = remoteVideo.srcObject || new MediaStream();
        evt.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
        remoteVideo.srcObject = remoteStream;
      };

      // 9) signaling handler
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

      // 10) initiator sends offer
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
