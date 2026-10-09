import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 4010);
const server = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

server.on('error', (error) => {
  console.error('WebSocket server failed to start:');
  console.error(error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server or try PORT=${PORT + 1} npm run server.`);
  }
  process.exit(1);
});

const rooms = new Map();

function createBoard() {
  return Array(9).fill(null);
}

function getCurrentPlayer(board) {
  return board.filter(square => square !== null).length % 2 === 0 ? 'X' : 'O';
}

function getResult(board) {
  const winningLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  for (const [a, b, c] of winningLines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return board.every(square => square !== null) ? 'draw' : null;
}

function normalizeDisplayName(value, fallback) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 20);
}

function createRoomData(roomId) {
  return {
    roomId,
    board: createBoard(),
    currentTurn: 'X',
    result: null,
    players: { X: null, O: null },
    playerNames: { X: null, O: null },
  };
}

function sendJson(connection, message) {
  if (connection.readyState === 1) {
    connection.send(JSON.stringify(message));
  }
}

function broadcastRoom(room) {
  const payload = {
    type: 'state',
    roomId: room.roomId,
    state: {
      roomId: room.roomId,
      board: room.board,
      currentTurn: room.currentTurn,
      result: room.result,
      players: room.players,
      playerNames: room.playerNames,
    },
  };

  for (const symbol of ['X', 'O']) {
    const playerId = room.players[symbol];
    const socket = room.connections?.[symbol];
    if (playerId && socket && socket.readyState === 1) {
      sendJson(socket, payload);
    }
  }
}

function removePlayerFromRoom(clientId, socket) {
  for (const room of rooms.values()) {
    for (const symbol of ['X', 'O']) {
      if (room.players[symbol] === clientId) {
        room.players[symbol] = null;
        room.connections[symbol] = null;
        sendJson(socket, {
          type: 'room-left',
          roomId: room.roomId,
          symbol,
        });
        if (room.players.X === null && room.players.O === null) {
          rooms.delete(room.roomId);
        } else {
          broadcastRoom(room);
        }
        return;
      }
    }
  }
}

const clients = new Map();

server.on('connection', (socket) => {
  const clientId = randomUUID();
  clients.set(socket, clientId);

  socket.on('message', (rawMessage) => {
    let payload;
    try {
      payload = JSON.parse(rawMessage.toString());
    } catch (error) {
      sendJson(socket, { type: 'error', message: 'Invalid message.' });
      return;
    }

    const type = payload.type;
    const roomId = String(payload.roomId || '').trim().toUpperCase();
    const room = roomId ? rooms.get(roomId) : null;

    if (type === 'create-room') {
      const nextRoomId = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      const nextRoom = createRoomData(nextRoomId);
      const playerName = normalizeDisplayName(payload.displayName, 'Player X');
      nextRoom.players.X = clientId;
      nextRoom.playerNames.X = playerName;
      nextRoom.connections = { X: socket, O: null };
      rooms.set(nextRoomId, nextRoom);
      sendJson(socket, {
        type: 'joined',
        roomId: nextRoomId,
        symbol: 'X',
        displayName: playerName,
        state: nextRoom,
      });
      broadcastRoom(nextRoom);
      return;
    }

    if (type === 'join-room') {
      if (!room) {
        sendJson(socket, { type: 'error', message: 'Room does not exist.' });
        return;
      }
      if (room.players.X === clientId || room.players.O === clientId) {
        sendJson(socket, { type: 'error', message: 'You are already in this room.' });
        return;
      }
      if (room.players.O !== null) {
        sendJson(socket, { type: 'error', message: 'This room is already full.' });
        return;
      }
      const playerName = normalizeDisplayName(payload.displayName, 'Player O');
      room.players.O = clientId;
      room.playerNames.O = playerName;
      room.connections.O = socket;
      sendJson(socket, { type: 'joined', roomId: room.roomId, symbol: 'O', displayName: playerName, state: room });
      broadcastRoom(room);
      return;
    }

    if (!room) {
      sendJson(socket, { type: 'error', message: 'Please join or create a room first.' });
      return;
    }

    const playerSymbol = room.players.X === clientId ? 'X' : room.players.O === clientId ? 'O' : null;
    if (!playerSymbol) {
      sendJson(socket, { type: 'error', message: 'You are not a player in this room.' });
      return;
    }

    if (type === 'move') {
      const index = Number(payload.index);
      if (!Number.isInteger(index) || index < 0 || index > 8) {
        sendJson(socket, { type: 'error', message: 'Move must be a valid square index.' });
        return;
      }
      if (room.players[playerSymbol] !== clientId) {
        sendJson(socket, { type: 'error', message: 'It is not your turn.' });
        return;
      }
      if (room.result !== null || room.board[index] !== null || room.currentTurn !== playerSymbol) {
        sendJson(socket, { type: 'error', message: 'That move is not allowed.' });
        return;
      }

      room.board[index] = playerSymbol;
      room.result = getResult(room.board);
      if (room.result === null) {
        room.currentTurn = getCurrentPlayer(room.board);
      }

      broadcastRoom(room);
      return;
    }

    if (type === 'play-again') {
      room.board = createBoard();
      room.currentTurn = 'X';
      room.result = null;
      broadcastRoom(room);
      return;
    }
  });

  socket.on('close', () => {
    const clientId = clients.get(socket);
    if (clientId) {
      removePlayerFromRoom(clientId, socket);
      clients.delete(socket);
    }
  });
});

server.on('listening', () => {
  console.log(`Online Tic-Tac-Toe server listening on ws://0.0.0.0:${PORT}`);
});
