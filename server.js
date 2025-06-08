// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const fetch = require('node-fetch');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// parse JSON bodies (for captcha verification)
app.use(express.json());

// captcha verification endpoint
app.post('/verify-captcha', async (req, res) => {
  const token = req.body.token;
  const secret = process.env.RECAPTCHA_SECRET;
  if (!token || !secret) {
    return res.status(400).json({ ok: false });
  }
  try {
    const resp = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`,
      { method: 'POST' }
    );
    const data = await resp.json();
    if (data.success) {
      return res.json({ ok: true });
    } else {
      return res.status(400).json({ ok: false });
    }
  } catch (err) {
    console.error('Captcha verify error:', err);
    return res.status(500).json({ ok: false });
  }
});

// socket.io signaling & chat
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

  socket.on('signal', data => {
    if (socket.partner) socket.partner.emit('signal', data);
  });
  socket.on('message', msg => {
    if (socket.partner) socket.partner.emit('message', msg);
  });
  socket.on('mute', () => {
    if (socket.partner) socket.partner.emit('mute');
  });
  socket.on('unmute', () => {
    if (socket.partner) socket.partner.emit('unmute');
  });
  socket.on('disconnect', () => {
    if (socket.partner) socket.partner.emit('partner-disconnected');
    if (waiting === socket) waiting = null;
  });
});

// serve static client
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
