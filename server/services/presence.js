// In-memory presence (single server instance). For multiple instances, replace with Redis
// and use the Socket.IO Redis adapter.
const sockets = new Map(); // userId -> Set(socketId)

export function addSocket(userId, socketId) {
  const key = String(userId);
  let set = sockets.get(key);
  const first = !set || set.size === 0;
  if (!set) sockets.set(key, (set = new Set()));
  set.add(socketId);
  return first;
}

export function removeSocket(userId, socketId) {
  const key = String(userId);
  const set = sockets.get(key);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    sockets.delete(key);
    return true; // last socket gone
  }
  return false;
}

export const isOnline = (userId) => (sockets.get(String(userId))?.size || 0) > 0;
