let io = null;

export const setIO = (instance) => {
  io = instance;
};

export function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

export function emitToSession(sessionId, event, payload) {
  if (io) io.to(`session:${sessionId}`).emit(event, payload);
}

export function disconnectSession(sessionId) {
  if (io) io.in(`session:${sessionId}`).disconnectSockets(true);
}
