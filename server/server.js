
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Map();

function roomUsers(room) {
  const r = rooms.get(room);
  if (!r) return [];
  return [...r.values()].map(({id, name, avatar}) => ({id, name, avatar}));
}

io.on("connection", socket => {
  socket.on("room:join", ({room, name, avatar}) => {
    if (!room || !name) return;
    if (!rooms.has(room)) rooms.set(room, new Map());
    const members = rooms.get(room);
    const existing = [...members.values()].map(x => x.id);
    members.set(socket.id, {id: socket.id, name: String(name).slice(0,40), avatar: avatar || ""});
    socket.join(room);
    socket.data.room = room;
    socket.emit("room:state", {users: roomUsers(room), peers: existing, host: existing.length === 0});
    socket.to(room).emit("room:user-joined", {user:{id:socket.id,name,avatar}, users:roomUsers(room), peerId:socket.id});
  });

  socket.on("chat:send", msg => {
    const room = socket.data.room;
    if (!room) return;
    io.to(room).emit("chat:message", {...msg, id: Date.now()+"-"+Math.random(), userId:socket.id});
  });

  // Generic WebRTC signaling. Payloads are forwarded only to the intended peer.
  socket.on("rtc:offer", ({to, offer}) => io.to(to).emit("rtc:offer", {from:socket.id, offer}));
  socket.on("rtc:answer", ({to, answer}) => io.to(to).emit("rtc:answer", {from:socket.id, answer}));
  socket.on("rtc:ice", ({to, candidate}) => io.to(to).emit("rtc:ice", {from:socket.id, candidate}));

  socket.on("room:leave", () => leave(socket));
  socket.on("disconnect", () => leave(socket));
});

function leave(socket) {
  const room = socket.data.room;
  if (!room || !rooms.has(room)) return;
  const members = rooms.get(room);
  members.delete(socket.id);
  socket.to(room).emit("room:user-left", {peerId:socket.id, users:roomUsers(room)});
  if (!members.size) rooms.delete(room);
  socket.data.room = null;
}

server.listen(process.env.PORT || 3001, () => {
  console.log("SeymaTV server listening on http://localhost:"+(process.env.PORT||3001));
});
