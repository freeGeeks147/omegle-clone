const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
let waiting = null;

io.on('connection', socket => {
  if (waiting) {
    socket.partner = waiting;
    waiting.partner = socket;
    waiting.emit('start', { initiator: false });
    socket.emit('start', { initiator: true });
    waiting = null;
  } else {
    waiting = socket;
    socket.emit('waiting');
  }

  socket.on('signal', data => socket.partner && socket.partner.emit('signal', data));
  socket.on('message', msg => socket.partner && socket.partner.emit('message', msg));
  socket.on('disconnect', () => {
    if (socket.partner) socket.partner.emit('partner-disconnected');
    if (waiting === socket) waiting = null;
  });
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
