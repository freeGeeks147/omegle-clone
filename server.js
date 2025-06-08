const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
let waiting = null;

io.on('connection', socket => {
  console.log('Connected:', socket.id);
  if (waiting) {
    // Pair users
    socket.partner = waiting;
    waiting.partner = socket;
    // Notify text chat readiness
    waiting.emit('paired');
    socket.emit('paired');
    // Notify video chat readiness
    waiting.emit('startVideo');
    socket.emit('startVideo');
    waiting = null;
  } else {
    waiting = socket;
    socket.emit('waiting');
  }

  // WebRTC signaling
  socket.on('signal', data => {
    if (socket.partner) socket.partner.emit('signal', data);
  });

  // Text messages
  socket.on('message', msg => {
    if (socket.partner) socket.partner.emit('message', msg);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    if (socket.partner) socket.partner.emit('partner-disconnected');
    if (waiting === socket) waiting = null;
  });
});

// Serve static UI
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
