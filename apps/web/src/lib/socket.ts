import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  socket ??= io({
    withCredentials: true,
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnectionDelayMax: 8000,
  });
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
