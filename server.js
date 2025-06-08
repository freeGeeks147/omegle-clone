const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
let waiting = null;

io.on('connection', socket => {
  // pair logic
  if (waiting) {
    socket.partner = waiting;
    waiting.partner = socket;
    // start chat & video
    waiting.emit('start', { initiator: false });
    socket.emit('start', { initiator: true });
    waiting = null;
  } else {
    waiting = socket;
    socket.emit('waiting');
  }
  // signaling
  socket.on('signal', data => {
    if (socket.partner) socket.partner.emit('signal', data);
  });
  // text messages
  socket.on('message', msg => {
    if (socket.partner) socket.partner.emit('message', msg);
  });
  // disconnect
  socket.on('disconnect', () => {
    if (socket.partner) socket.partner.emit('partner-disconnected');
    if (waiting === socket) waiting = null;
  });
});

app.use(express.static(path.join(__dirname, 'public')));
server.listen(process.env.PORT || 3000, () => console.log('Server up'));
