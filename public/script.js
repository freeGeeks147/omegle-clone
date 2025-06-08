document.addEventListener('DOMContentLoaded', () => {
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
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (pc.remoteDescription.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { sdp: pc.localDescription });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (e) {
      console.error('Signal error:', e);
    }
  });

  socket.on('waiting', () => {
    statusEl.innerText = 'Waiting for partner...';
  });

  socket.on('start', async ({ initiator }) => {
    statusEl.style.display = 'none';

    try {
      // Capture compressed video + audio
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { max: 25 } },
        audio: true
      });
    } catch (err) {
      console.error('Could not access media devices.', err);
      statusEl.innerText = 'Error accessing camera/microphone';
      return;
    }

    localVideo.srcObject = localStream;
    localVideo.muted = true;

    // Setup remote stream
    const remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    // Mobile browsers may require explicit play call
    remoteVideo.onloadedmetadata = () => remoteVideo.play().catch(() => { console.warn('Remote video play failed'); });
    remoteVideo.muted = false;

    // Peer connection
    pc = new RTCPeerConnection(config);

    // Add local tracks and limit bitrate
    localStream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, localStream);
      if (track.kind === 'video' && sender.setParameters) {
        const params = sender.getParameters();
        // Increase bitrate to improve quality
      params.encodings = [{ maxBitrate: 500_000 }];
        sender.setParameters(params);
      }
    });

    pc.onicecandidate = ({ candidate }) => candidate && socket.emit('signal', { candidate });
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { sdp: pc.localDescription });
    }

    // === Adaptive Bitrate Logic ===
    let lastBytesSent = 0;
    setInterval(async () => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (!sender || !sender.getParameters) return;
      const params = sender.getParameters();
      const stats = await sender.getStats();
      stats.forEach(report => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          const bytesSent = report.bytesSent;
          const bitrate = (bytesSent - lastBytesSent) * 8; // bits per second since last interval
          lastBytesSent = bytesSent;
          // Simple adaptation: target around 400kbps
          let targetBitrate = params.encodings[0].maxBitrate || 500_000;
          if (bitrate < targetBitrate * 0.8) {
            // network poor: reduce by 10%
            targetBitrate = Math.max(100_000, targetBitrate * 0.9);
          } else if (bitrate > targetBitrate * 1.2) {
            // network good: increase by 10%
            targetBitrate = Math.min(1_000_000, targetBitrate * 1.1);
          }
          params.encodings[0].maxBitrate = Math.floor(targetBitrate);
          sender.setParameters(params);
        }
      });
    }, 3000);

    // Fullscreen toggles
    [localVideo, remoteVideo].forEach(videoEl => {
      videoEl.addEventListener('dblclick', () => {
        if (videoEl.requestFullscreen) videoEl.requestFullscreen();
      });
    });

    // Volume control: toggle local microphone
    volumeSlider.oninput = () => {
      const enabled = parseFloat(volumeSlider.value) > 0;
      localStream.getAudioTracks().forEach(track => track.enabled = enabled);
    };
  });

  // Chat controls
  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) return;
    socket.emit('message', text);
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message self';
    msgDiv.innerText = text;
    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.value = '';
  });

  nextBtn.addEventListener('click', () => {
    if (pc) pc.close();
    location.reload();
  });

  socket.on('message', msg => {
    const el = document.createElement('div');
    el.className = 'message other';
    el.innerText = msg;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  socket.on('partner-disconnected', () => {
    // Silent reload
    if (pc) pc.close();
    location.reload();
  });
});
