const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let waiting = null;

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  if (waiting) {
    // Pair users for chat and video
    socket.partner = waiting;
    waiting.partner = socket;
    // Notify both clients
    waiting.emit('start');
    socket.emit('start');
    waiting = null;
  } else {
    waiting = socket;
    socket.emit('waiting');
  }

  // Socket.io signaling for WebRTC
  socket.on('signal', data => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  // Text messages
  socket.on('message', msg => {
    if (socket.partner) socket.partner.emit('message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.partner) {
      socket.partner.emit('partner-disconnected');
      socket.partner.partner = null;
    } else if (waiting === socket) {
      waiting = null;
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
