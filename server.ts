import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KURDISH_ALPHABET = ["ئ", "ا", "ب", "پ", "ت", "ج", "چ", "ح", "خ", "د", "ر", "ڕ", "ز", "ژ", "س", "ش", "ع", "غ", "ف", "ڤ", "ق", "ک", "گ", "ل", "ڵ", "م", "ن", "ھ", "ە", "و", "ۆ", "ی"];

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isAlive: boolean;
  score: number;
  coins: number;
  wins: number;
  lastWord?: string;
  status: "waiting" | "playing" | "out";
  isBot?: boolean;
  difficulty?: "easy" | "normal" | "hard";
}

interface Room {
  code: string;
  players: Player[];
  status: "lobby" | "playing" | "gameover";
  currentLetter: string;
  timer: number;
  round: number;
  maxRounds: number;
  roundDuration: number;
  isPublic?: boolean;
  excludedLetters?: string[];
  timerInterval?: NodeJS.Timeout;
}

const KURDISH_WORDS: Record<string, string[]> = {
  "ئ": ["ئاسمان", "ئاو", "ئاگر", "ئازادی", "ئەسپ", "ئەستێرە", "ئێوارە", "ئۆتۆمبێل"],
  "ا": ["اسمان", "او", "اگر", "ازادی", "اسپ", "استێرە", "ێوارە", "ۆتۆمبێل"], // Some variations for bots
  "ب": ["باخ", "باران", "بەرد", "بایەخ", "بێستان", "بۆن", "بەرخ", "بۆق"],
  "پ": ["پێنووس", "پەرتووک", "پشیلە", "پەنجەرە", "پیاو", "پیرۆز", "پرد", "پڵنگ"],
  "ت": ["تەختە", "تۆپ", "تەیر", "تاریکی", "تەنەکە", "تەور", "تەپڵ", "تەمەن"],
  "ج": ["جوان", "جەژن", "جەستە", "جانتای", "جەنگ", "جۆگە", "جۆلانە", "جێگە"],
  "چ": ["چاو", "چیا", "چوار", "چەقۆ", "چەپڵە", "چای", "چرا", "چەتر"],
  "ح": ["حەوت", "حەوز", "حوشتر", "حەیران", "حەقیقەت", "حەز", "حوکم", "حەشار"],
  "خ": ["خانوو", "خۆر", "خەون", "خاک", "خەبات", "خەنجەر", "خەزنە", "خۆش"],
  "د": ["دەرگا", "دەست", "دڵ", "دوور", "دەریا", "دۆست", "ددان", "دوژمن"],
  "ر": ["رێگا", "رەنگ", "رۆژ", "راست", "رەنج", "رەز", "رێز", "رۆح"],
  "ڕ": ["ڕێگا", "ڕەنگ", "ڕۆژ", "ڕاست", "ڕەنج", "ڕەز", "ڕێز", "ڕۆح"],
  "ز": ["زەوی", "زێڕ", "زستان", "زانا", "زمان", "زەنگ", "زۆر", "زەرد"],
  "ژ": ["ژمارە", "ژیان", "ژوور", "ژن", "ژەهر", "ژەنیار", "ژێر", "ژەقنەمووت"],
  "س": ["سێو", "سەگ", "سەر", "سارد", "سەوز", "سەما", "سەیران", "سەنگ"],
  "ش": ["شێر", "شار", "شەو", "شین", "شەکر", "شوشە", "شەپۆل", "شەڕ"],
  "ع": ["عەشق", "عەقڵ", "عەبا", "عەینەک", "عەرەب", "عەرز", "عەتر", "عەجەب"],
  "غ": ["غەریب", "غەزەل", "غەیرە", "غەبار", "غەرق", "غەمی", "غەدر", "غەیر"],
  "ف": ["فڕۆکە", "فێنک", "فەرهەنگ", "فێربوون", "فەقێ", "فەوت", "فەرموو", "فێڵ"],
  "ڤ": ["ڤیدیۆ", "ڤایرۆس", "ڤێلا", "ڤیتامین", "ڤیزا", "ڤۆڵت", "ڤیەننا", "ڤۆدکا"],
  "ق": ["قەڵەم", "قاپ", "قوتابی", "قوڕ", "قوڵینگ", "قوربان", "قەفەس", "قوڵ"],
  "ک": ["کچ", "کوڕ", "کتێب", "کۆمپیوتەر", "کورد", "کەژ", "کۆڵان", "کەو"],
  "گ": ["گۆڵ", "گۆشت", "گەرما", "گوند", "گۆزە", "گۆران", "گاز", "گۆڕ"],
  "ل": ["لادێ", "لێو", "لۆکە", "لادان", "لێخوڕین", "لێبوردن", "لێفە", "لۆژیک"],
  "ڵ": ["ڵاو", "ڵۆکە", "ڵادان", "ڵێخوڕین", "ڵێبوردن", "ڵێفە", "ڵۆژیک", "ڵاو"],
  "م": ["ماست", "مانگ", "ماسی", "منداڵ", "مۆز", "مریشک", "مەیموون", "مێش"],
  "n": ["نان", "نەخۆش", "نەورۆز", "نێرگز", "نیشتمان", "نەخشە", "نەوت", "نەرم"],
  "ن": ["نان", "نەخۆش", "نەورۆز", "نێرگز", "نیشتمان", "نەخشە", "نەوت", "نەرم"],
  "ھ": ["ھەور", "ھەنگوین", "ھەرزان", "ھێلکە", "ھاوڕێ", "ھەناسە", "ھێز", "ھەولێر"],
  "ە": ["ەور", "ەنگوین", "ەرزان", "ێلکە", "اوڕێ", "ەناسە", "ێز", "ەولێر"],
  "و": ["ورچ", "وڵات", "وێنە", "وشە", "وەرز", "وەستا", "وێستگە", "وەفا"],
  "ۆ": ["ۆتۆمبێل", "ۆردوو", "ۆکسجین", "ۆفیس", "ۆڵت", "ۆرد", "ۆردوو", "ۆرد"],
  "ی": ["یاری", "یەک", "یانە", "یاسا", "یارمەتی", "یاد", "یەزدان", "یۆنان"]
};

const rooms: Map<string, Room> = new Map();
const players: Map<string, Player> = new Map();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Socket.IO Logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("createRoom", ({ name, isPublic }) => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const player: Player = {
        id: socket.id,
        name,
        isHost: true,
        isAlive: true,
        score: 0,
        coins: 0,
        wins: 0,
        status: "waiting",
      };
      
      const room: Room = {
        code,
        players: [player],
        status: "lobby",
        currentLetter: "",
        timer: 0,
        round: 0,
        maxRounds: 10,
        roundDuration: 5,
        isPublic: !!isPublic,
      };

      rooms.set(code, room);
      socket.join(code);
      socket.emit("roomCreated", { code, room });
      console.log(`Room created: ${code} by ${name} (Public: ${isPublic})`);
    });

    socket.on("updateSettings", ({ code, maxRounds, roundDuration, excludedLetters, isPublic }) => {
      const room = rooms.get(code);
      if (room && room.players.find(p => p.id === socket.id)?.isHost) {
        if (maxRounds !== undefined) room.maxRounds = Math.max(1, Math.min(50, maxRounds));
        if (roundDuration !== undefined) room.roundDuration = Math.max(3, Math.min(30, roundDuration));
        if (excludedLetters !== undefined) room.excludedLetters = excludedLetters;
        if (isPublic !== undefined) room.isPublic = isPublic;
        io.to(code).emit("roomUpdated", room);
      }
    });

    socket.on("findMatch", ({ name }) => {
      // Find a public room with space
      let room = Array.from(rooms.values()).find(r => r.isPublic && r.status === "lobby" && r.players.length < 8);
      
      if (room) {
        const player: Player = {
          id: socket.id,
          name,
          isHost: false,
          isAlive: true,
          score: 0,
          coins: 0,
          wins: 0,
          status: "waiting",
        };
        room.players.push(player);
        socket.join(room.code);
        io.to(room.code).emit("roomUpdated", room);
        socket.emit("joinedRoom", { code: room.code, room });
      } else {
        // Create a new public room
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const player: Player = {
          id: socket.id,
          name,
          isHost: true,
          isAlive: true,
          score: 0,
          coins: 0,
          wins: 0,
          status: "waiting",
        };
        const newRoom: Room = {
          code,
          players: [player],
          status: "lobby",
          currentLetter: "",
          timer: 0,
          round: 0,
          maxRounds: 10,
          roundDuration: 5,
          isPublic: true,
        };
        rooms.set(code, newRoom);
        socket.join(code);
        socket.emit("roomCreated", { code, room: newRoom });
      }
    });

    socket.on("addBot", ({ code, difficulty }) => {
      const room = rooms.get(code);
      if (room && room.players.find(p => p.id === socket.id)?.isHost) {
        if (room.players.length >= 8) return socket.emit("error", "ڕومەکە پڕە");
        
        const botId = `bot-${Math.random().toString(36).substr(2, 9)}`;
        const botNames = ["بۆتی ئاسان", "بۆتی نۆرمال", "بۆتی بەهێز"];
        const botName = `${botNames[difficulty === "easy" ? 0 : difficulty === "normal" ? 1 : 2]} ${room.players.filter(p => p.isBot).length + 1}`;
        
        const bot: Player = {
          id: botId,
          name: botName,
          isHost: false,
          isAlive: true,
          score: 0,
          coins: 0,
          wins: 0,
          status: "waiting",
          isBot: true,
          difficulty: difficulty as "easy" | "normal" | "hard",
        };

        room.players.push(bot);
        io.to(code).emit("roomUpdated", room);
      }
    });

    socket.on("joinRoom", ({ name, code }) => {
      const room = rooms.get(code);
      if (!room) {
        return socket.emit("error", "ڕومەکە نەدۆزرایەوە");
      }
      if (room.status !== "lobby") {
        return socket.emit("error", "یارییەکە دەستی پێکردووە");
      }

      const player: Player = {
        id: socket.id,
        name,
        isHost: false,
        isAlive: true,
        score: 0,
        coins: 0,
        wins: 0,
        status: "waiting",
      };

      room.players.push(player);
      socket.join(code);
      io.to(code).emit("roomUpdated", room);
      socket.emit("joinedRoom", { code, room });
    });

    socket.on("startGame", (code) => {
      const room = rooms.get(code);
      if (room && room.players.find(p => p.id === socket.id)?.isHost) {
        if (room.players.length < 2) {
          return socket.emit("error", "لانی کەم ٢ یاریکەر پێویستە");
        }
        room.status = "playing";
        room.players.forEach(p => {
          p.isAlive = true;
          p.status = "playing";
        });
        startNewRound(code, io);
      }
    });

    socket.on("sendWord", ({ code, word }) => {
      const room = rooms.get(code);
      if (room && room.status === "playing") {
        const player = room.players.find(p => p.id === socket.id);
        if (player && player.isAlive) {
          player.lastWord = word.trim();
        }
      }
    });

    socket.on("sendChat", ({ code, message, name }) => {
      io.to(code).emit("chatMessage", { name, message });
    });

    socket.on("kickPlayer", ({ code, playerId }) => {
      const room = rooms.get(code);
      if (room && room.players.find(p => p.id === socket.id)?.isHost) {
        room.players = room.players.filter(p => p.id !== playerId);
        io.to(playerId).emit("kicked");
        io.to(code).emit("roomUpdated", room);
      }
    });

    socket.on("promoteToHost", ({ code, playerId }) => {
      const room = rooms.get(code);
      if (room && room.players.find(p => p.id === socket.id)?.isHost) {
        room.players.forEach(p => p.isHost = (p.id === playerId));
        io.to(code).emit("roomUpdated", room);
      }
    });

    socket.on("disconnect", () => {
      rooms.forEach((room, code) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const wasHost = room.players[playerIndex].isHost;
          room.players.splice(playerIndex, 1);
          
          if (room.players.length === 0) {
            if (room.timerInterval) clearInterval(room.timerInterval);
            rooms.delete(code);
          } else {
            if (wasHost) {
              room.players[0].isHost = true;
            }
            io.to(code).emit("roomUpdated", room);
          }
        }
      });
    });
  });

  function startNewRound(code: string, io: Server) {
    const room = rooms.get(code);
    if (!room) return;

    room.round++;
    
    // Pick a letter that is not excluded
    const availableLetters = KURDISH_ALPHABET.filter(l => !room.excludedLetters?.includes(l));
    if (availableLetters.length === 0) {
      // Fallback if all letters are excluded (should not happen with UI limits)
      room.currentLetter = KURDISH_ALPHABET[Math.floor(Math.random() * KURDISH_ALPHABET.length)];
    } else {
      room.currentLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
    }
    
    room.players.forEach(p => p.lastWord = undefined);
    room.timer = room.roundDuration;

    io.to(code).emit("roundStarted", {
      letter: room.currentLetter,
      round: room.round,
      timer: room.timer,
      players: room.players
    });

    if (room.timerInterval) clearInterval(room.timerInterval);
    
    room.timerInterval = setInterval(() => {
      room.timer--;
      io.to(code).emit("timerUpdate", room.timer);

      // Bot logic: Bots send words at random times during the timer
      room.players.forEach(p => {
        if (p.isBot && p.isAlive && !p.lastWord && room.timer > 0) {
          const difficulty = p.difficulty || "normal";
          let chanceToAct = 0;
          if (difficulty === "easy") chanceToAct = 0.1;
          if (difficulty === "normal") chanceToAct = 0.2;
          if (difficulty === "hard") chanceToAct = 0.4;

          if (Math.random() < chanceToAct) {
            let word = "";
            const words = KURDISH_WORDS[room.currentLetter] || [];
            
            const failChance = difficulty === "easy" ? 0.5 : difficulty === "normal" ? 0.2 : 0.05;
            if (Math.random() < failChance) {
              // Fail: either no word or wrong word
              if (Math.random() < 0.5) {
                word = ""; // No word
              } else {
                // Wrong letter
                const otherLetters = KURDISH_ALPHABET.filter(l => l !== room.currentLetter);
                const wrongLetter = otherLetters[Math.floor(Math.random() * otherLetters.length)];
                const wrongWords = KURDISH_WORDS[wrongLetter] || ["هەڵە"];
                word = wrongWords[Math.floor(Math.random() * wrongWords.length)];
              }
            } else {
              // Success
              if (words.length > 0) {
                word = words[Math.floor(Math.random() * words.length)];
              } else {
                word = room.currentLetter + "یاری"; // Fallback
              }
            }
            p.lastWord = word;
          }
        }
      });

      if (room.timer <= 0) {
        clearInterval(room.timerInterval);
        processRoundResults(code, io);
      }
    }, 1000);
  }

  function processRoundResults(code: string, io: Server) {
    const room = rooms.get(code);
    if (!room) return;

    const alivePlayers = room.players.filter(p => p.isAlive);
    const words = alivePlayers.map(p => p.lastWord?.toLowerCase() || "");
    
    const wordCounts: Record<string, number> = {};
    words.forEach(w => {
      if (w) wordCounts[w] = (wordCounts[w] || 0) + 1;
    });

    const results = alivePlayers.map(p => {
      const word = p.lastWord || "";
      let reason = "";
      let isEliminated = false;

      if (!word) {
        isEliminated = true;
        reason = "هیچ وشەیەک نەنێردراوە";
      } else if (!word.startsWith(room.currentLetter)) {
        isEliminated = true;
        reason = `وشەکە بە پیتی "${room.currentLetter}" دەست پێناکات`;
      } else if (word.length < 2) {
        isEliminated = true;
        reason = "وشەکە زۆر کورتە";
      } else if (wordCounts[word.toLowerCase()] > 1) {
        isEliminated = true;
        reason = "وشەکە دووبارەیە";
      } else {
        // Basic Kurdish char check (simplified)
        const isKurdish = /^[\u0600-\u06FF\s]+$/.test(word);
        if (!isKurdish) {
          isEliminated = true;
          reason = "تەنیا پیتی کوردی ڕێگەپێدراوە";
        }
      }

      if (isEliminated) {
        p.isAlive = false;
        p.status = "out";
      } else {
        p.score += 10;
      }

      return {
        id: p.id,
        name: p.name,
        word,
        isAlive: p.isAlive,
        reason
      };
    });

    io.to(code).emit("roundResults", { results, players: room.players });

    const remainingAlive = room.players.filter(p => p.isAlive);
    
    setTimeout(() => {
      if (remainingAlive.length <= 1 || room.round >= room.maxRounds) {
        const winner = remainingAlive.length === 1 ? remainingAlive[0] : (remainingAlive.length > 1 ? remainingAlive.sort((a, b) => b.score - a.score)[0] : null);
        if (winner) {
          winner.wins++;
          winner.coins += 50;
        }
        room.status = "gameover";
        io.to(code).emit("gameOver", { winner, players: room.players });
      } else {
        startNewRound(code, io);
      }
    }, 3000);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
