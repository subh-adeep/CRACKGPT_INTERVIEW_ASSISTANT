// static/js/ws_client.js
(function () {
  const socket = io(); // uses socket.io client loaded from CDN or local

  socket.on("connect", () => {
    console.log("WS connected id=", socket.id);
    // test join
    socket.emit("join", { room: "test" });
  });

  socket.on("server_message", (m) => {
    console.log("server_message:", m);
  });

  socket.on("ack", (m) => {
    console.log("ack:", m);
  });

  // Quick test: send 1KB of random bytes every 2s
  window.startWsTest = function () {
    setInterval(() => {
      // create an ArrayBuffer of 1024 bytes
      const size = 1024;
      const ab = new ArrayBuffer(size);
      const dv = new Uint8Array(ab);
      for (let i = 0; i < size; i++) dv[i] = Math.floor(Math.random() * 256);
      // send binary chunk
      socket.emit("client_audio_chunk", dv);
      console.log("sent chunk");
    }, 2000);
  };
})();
