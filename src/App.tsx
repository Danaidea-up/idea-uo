import { useState, useEffect, useRef, FormEvent } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import { auth, db, googleProvider, signInAnonymously } from "./firebase";
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  User,
  signInAnonymously as firebaseSignInAnonymously
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  increment
} from "firebase/firestore";
import { 
  Users, 
  Plus, 
  LogIn, 
  Copy, 
  Send, 
  Crown, 
  UserMinus, 
  ArrowLeft, 
  Trophy,
  Timer,
  MessageSquare,
  Coins,
  Settings,
  LogOut,
  User as UserIcon,
  Camera,
  Home,
  ShoppingBag,
  BarChart3,
  Gift,
  Swords,
  Lock
} from "lucide-react";

// Kurdish Alphabet
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
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  coins: number;
  wins: number;
  dailyBonusLastClaimed?: string;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [view, setView] = useState<"login" | "home" | "lobby" | "game" | "gameover" | "profile" | "shop" | "rank" | "bonus" | "battle" | "private">("login");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<{name: string, message: string}[]>([]);
  const [message, setMessage] = useState("");
  const [word, setWord] = useState("");
  const [roundResults, setRoundResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [timer, setTimer] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setName(u.displayName || "یاریکەر");
        const userDoc = await getDoc(doc(db, "users", u.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: u.displayName || "یاریکەر",
            photoURL: u.photoURL || "",
            coins: 100,
            wins: 0
          };
          await setDoc(doc(db, "users", u.uid), newProfile);
          setProfile(newProfile);
        }
        setView("home");
      } else {
        setProfile(null);
        setView("login");
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
        if (doc.exists()) {
          setProfile(doc.data() as UserProfile);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (view === "rank") {
      const fetchLeaderboard = async () => {
        const q = query(collection(db, "users"), orderBy("wins", "desc"), limit(100));
        const querySnapshot = await getDocs(q);
        const users: UserProfile[] = [];
        querySnapshot.forEach((doc) => {
          users.push(doc.data() as UserProfile);
        });
        setLeaderboard(users);
      };
      fetchLeaderboard();
    }
  }, [view]);

  useEffect(() => {
    // Connect to the backend. In production, you can set VITE_BACKEND_URL in your environment variables.
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const newSocket = io(backendUrl);
    setSocket(newSocket);

    newSocket.on("roomCreated", ({ code, room }) => {
      setRoom(room);
      setView("lobby");
    });

    newSocket.on("joinedRoom", ({ code, room }) => {
      setRoom(room);
      setView("lobby");
    });

    newSocket.on("roomUpdated", (updatedRoom) => {
      setRoom(updatedRoom);
    });

    newSocket.on("roundStarted", ({ letter, round, timer, players }) => {
      setRoom(prev => prev ? { ...prev, currentLetter: letter, round, status: "playing", players } : null);
      setTimer(timer);
      setView("game");
      setShowResults(false);
      setWord("");
    });

    newSocket.on("timerUpdate", (t) => {
      setTimer(t);
    });

    newSocket.on("roundResults", ({ results, players }) => {
      setRoundResults(results);
      setShowResults(true);
      setRoom(prev => prev ? { ...prev, players } : null);
    });

    newSocket.on("gameOver", async ({ winner, players }) => {
      setWinner(winner);
      setRoom(prev => prev ? { ...prev, status: "gameover", players } : null);
      setView("gameover");
      
      // Reward the winner if it's the current user
      if (winner && winner.id === newSocket.id && auth.currentUser) {
        try {
          await updateDoc(doc(db, "users", auth.currentUser.uid), {
            wins: increment(1),
            coins: increment(50)
          });
        } catch (err) {
          console.error("Error updating winner stats:", err);
        }
      }
    });

    newSocket.on("chatMessage", (msg) => {
      setChat(prev => [...prev, msg]);
    });

    newSocket.on("error", (err) => {
      setError(err);
      setTimeout(() => setError(""), 3000);
    });

    newSocket.on("kicked", () => {
      setView("home");
      setRoom(null);
      setError("تۆ لە ڕومەکە دەرکرایت");
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const handleLogin = async (provider: "google" | "anon") => {
    try {
      if (provider === "google") {
        await signInWithPopup(auth, googleProvider);
      } else {
        await firebaseSignInAnonymously(auth);
      }
    } catch (err) {
      setError("هەڵەیەک ڕوویدا لە کاتی چوونە ژوورەوە");
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setView("login");
  };

  const handleClaimBonus = async () => {
    if (!user || !profile) return;
    const now = new Date();
    const lastClaimed = profile.dailyBonusLastClaimed ? new Date(profile.dailyBonusLastClaimed) : null;
    
    if (lastClaimed && now.getTime() - lastClaimed.getTime() < 24 * 60 * 60 * 1000) {
      setError("تۆ پێشتر خەڵاتی ئەمڕۆت وەرگرتووە");
      setTimeout(() => setError(""), 3000);
      return;
    }

    await updateDoc(doc(db, "users", user.uid), {
      coins: increment(50),
      dailyBonusLastClaimed: now.toISOString()
    });
    setError("پیرۆزە! ٥٠ کۆینت وەرگرت");
    setTimeout(() => setError(""), 3000);
  };

  const handleBuyItem = async (cost: number) => {
    if (!profile || profile.coins < cost) return setError("کۆینی پێویستت نییە");
    await updateDoc(doc(db, "users", user!.uid), {
      coins: increment(-cost)
    });
    setError("کڕینەکە سەرکەوتوو بوو!");
    setTimeout(() => setError(""), 3000);
  };

  const handleUpdateProfile = async (newName: string) => {
    if (user && newName) {
      await updateDoc(doc(db, "users", user.uid), { displayName: newName });
      setName(newName);
      setView("home");
    }
  };

  const handleUpdateSettings = (maxRounds?: number, roundDuration?: number, excludedLetters?: string[], isPublic?: boolean) => {
    if (room) {
      socket?.emit("updateSettings", { code: room.code, maxRounds, roundDuration, excludedLetters, isPublic });
    }
  };

  const handleCreateRoom = (isPublic: boolean = false) => {
    if (!name) return setError("تکایە ناوەکەت بنووسە یان بچۆرە ژوورەوە");
    socket?.emit("createRoom", { name, isPublic });
  };

  const handleFindMatch = () => {
    if (!name) return setError("تکایە ناوەکەت بنووسە");
    socket?.emit("findMatch", { name });
  };

  const handleAddBot = (difficulty: "easy" | "normal" | "hard") => {
    if (room) socket?.emit("addBot", { code: room.code, difficulty });
  };

  const handleJoinRoom = () => {
    if (!name || !roomCode) return setError("تکایە ناو و کۆدی ڕوم بنووسە");
    socket?.emit("joinRoom", { name, code: roomCode });
  };

  const handleStartGame = () => {
    if (room) socket?.emit("startGame", room.code);
  };

  const handleSendWord = (e: FormEvent) => {
    e.preventDefault();
    if (room && word) {
      socket?.emit("sendWord", { code: room.code, word });
      setWord("");
    }
  };

  const handleSendChat = (e: FormEvent) => {
    e.preventDefault();
    if (room && message) {
      socket?.emit("sendChat", { code: room.code, message, name });
      setMessage("");
    }
  };

  const copyCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.code);
      setError("کۆدەکە کۆپی کرا!");
      setTimeout(() => setError(""), 2000);
    }
  };

  const BottomNav = () => (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/5 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around px-4 z-50">
      <button onClick={() => setView("home")} className={`flex flex-col items-center gap-1 ${view === "home" ? "text-yellow-400" : "text-gray-500"}`}>
        <Home size={24} />
        <span className="text-[10px]">سەرەکی</span>
      </button>
      <button onClick={() => setView("shop")} className={`flex flex-col items-center gap-1 ${view === "shop" ? "text-yellow-400" : "text-gray-500"}`}>
        <ShoppingBag size={24} />
        <span className="text-[10px]">دوکان</span>
      </button>
      <button onClick={() => setView("battle")} className={`flex flex-col items-center gap-1 ${view === "battle" ? "text-yellow-400" : "text-gray-500"}`}>
        <div className="p-3 bg-yellow-500 rounded-full -mt-10 shadow-lg shadow-yellow-500/20 text-black">
          <Swords size={28} />
        </div>
        <span className="text-[10px] mt-1">جەنگ</span>
      </button>
      <button onClick={() => setView("rank")} className={`flex flex-col items-center gap-1 ${view === "rank" ? "text-yellow-400" : "text-gray-500"}`}>
        <BarChart3 size={24} />
        <span className="text-[10px]">ڕیزبەندی</span>
      </button>
      <button onClick={() => setView("bonus")} className={`flex flex-col items-center gap-1 ${view === "bonus" ? "text-yellow-400" : "text-gray-500"}`}>
        <Gift size={24} />
        <span className="text-[10px]">خەڵات</span>
      </button>
    </div>
  );

  const renderLogin = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#0a0a0a] text-white font-sans" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
      >
        <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 bg-clip-text text-transparent">
          پیت و ڕومی کوردی
        </h1>
        
        <div className="space-y-6">
          <button 
            onClick={() => handleLogin("google")}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition-all"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
            چوونە ژوورەوە بە Google
          </button>
          
          <button 
            onClick={() => handleLogin("anon")}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
          >
            <UserIcon size={24} />
            ئەکاونتی خێرا (میوان)
          </button>
        </div>

        {error && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center text-red-400 text-sm"
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  );

  const renderHome = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div className="flex justify-between items-center p-6 rounded-3xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-4">
            <button onClick={() => setView("profile")} className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-red-500 p-1">
              <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={24} className="text-yellow-400" />
                )}
              </div>
            </button>
            <div>
              <h2 className="text-xl font-bold">{profile?.displayName}</h2>
              <div className="flex gap-3 text-sm">
                <span className="text-green-400 flex items-center gap-1">{profile?.coins} <Coins size={14} /></span>
                <span className="text-blue-400 flex items-center gap-1">{profile?.wins} <Trophy size={14} /></span>
              </div>
            </div>
          </div>
          <button onClick={() => setView("profile")} className="p-2 rounded-xl bg-white/5 border border-white/10">
            <Settings size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={() => setView("battle")}
            className="p-8 rounded-3xl bg-gradient-to-br from-green-600 to-green-800 border border-green-500/30 flex flex-col items-center gap-4 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-all" />
            <Swords size={48} className="text-white" />
            <div className="text-center">
              <h3 className="text-2xl font-bold">جەنگی پیتەکان</h3>
              <p className="text-green-200 text-sm">یاری دۆزینەوە و دەستپێکردنی جەنگ</p>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setView("private")}
              className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center gap-3"
            >
              <Lock size={24} className="text-yellow-400" />
              <span className="font-bold">ژووری تایبەت</span>
            </button>
            <button 
              onClick={() => setView("rank")}
              className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center gap-3"
            >
              <BarChart3 size={24} className="text-blue-400" />
              <span className="font-bold">ڕیزبەندی</span>
            </button>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );

  const renderBattle = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-md mx-auto w-full space-y-6">
        <button onClick={() => setView("home")} className="p-2 rounded-full bg-white/5 border border-white/10 w-fit">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-3xl font-bold text-center">جەنگان</h1>
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center gap-8">
          <div className="w-32 h-32 rounded-full bg-yellow-500/20 flex items-center justify-center border-2 border-yellow-500/30 animate-pulse">
            <Swords size={64} className="text-yellow-400" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">ئامادەی بۆ جەنگ؟</h2>
            <p className="text-gray-400">سیستەمەکە باشترین ڕوم بۆ تۆ دەدۆزێتەوە</p>
          </div>
          <button 
            onClick={handleFindMatch}
            className="w-full py-4 rounded-2xl bg-yellow-500 text-black font-bold text-xl hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20"
          >
            دەستپێکردنی یاری دۆزینەوە
          </button>
          <button 
            onClick={() => handleCreateRoom(true)}
            className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 font-bold text-lg hover:bg-white/10 transition-all"
          >
            دروستکردنی ڕومی گشتی
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );

  const renderPrivate = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-md mx-auto w-full space-y-6">
        <button onClick={() => setView("home")} className="p-2 rounded-full bg-white/5 border border-white/10 w-fit">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-3xl font-bold text-center">ژووری تایبەت</h1>
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
          <div className="space-y-4">
            <label className="text-sm text-gray-400">کۆدی ڕوم بنووسە</label>
            <input 
              type="text" 
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="123456"
              className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-yellow-400 outline-none text-center text-3xl font-mono tracking-[0.5em]"
            />
          </div>
          <button 
            onClick={handleJoinRoom}
            className="w-full py-4 rounded-2xl bg-yellow-500 text-black font-bold text-xl hover:bg-yellow-400 transition-all"
          >
            بچۆرە ناو ڕوم
          </button>
          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0a0a0a] px-2 text-gray-500">یان</span></div>
          </div>
          <button 
            onClick={() => handleCreateRoom(false)}
            className="w-full py-4 rounded-2xl bg-green-600 font-bold text-lg hover:bg-green-500 transition-all"
          >
            دروستکردنی ڕومی تایبەت
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );

  const renderShop = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">دوکان</h1>
          <div className="px-4 py-2 rounded-xl bg-green-600/20 text-green-400 border border-green-500/30 flex items-center gap-2">
            {profile?.coins} <Coins size={16} />
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {[
            { name: "وێنەی تایبەت", price: 500, icon: Camera, color: "text-blue-400" },
            { name: "کۆدی ڕەنگاوڕەنگ", price: 1000, icon: Settings, color: "text-purple-400" },
            { name: "نازناوی شاهانە", price: 2000, icon: Crown, color: "text-yellow-400" },
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-all">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl bg-white/5 ${item.color}`}>
                  <item.icon size={24} />
                </div>
                <div>
                  <h3 className="font-bold">{item.name}</h3>
                  <p className="text-xs text-gray-500">تایبەتمەندی نوێ</p>
                </div>
              </div>
              <button 
                onClick={() => handleBuyItem(item.price)}
                className="px-6 py-2 rounded-xl bg-yellow-500 text-black font-bold text-sm hover:bg-yellow-400 transition-all"
              >
                {item.price} <Coins size={14} className="inline mb-1" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );

  const renderRank = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-md mx-auto w-full space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="text-blue-400" />
          ڕیزبەندی جیهانی
        </h1>
        
        <div className="space-y-2">
          {leaderboard.map((u, i) => (
            <div key={u.uid} className={`p-4 rounded-2xl flex items-center justify-between ${u.uid === user?.uid ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-white/5 border border-white/10"}`}>
              <div className="flex items-center gap-4">
                <span className={`w-8 text-center font-bold ${i < 3 ? "text-yellow-400 text-xl" : "text-gray-500"}`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden">
                  {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-2.5 text-gray-400" />}
                </div>
                <span className="font-bold">{u.displayName}</span>
              </div>
              <div className="flex items-center gap-2 text-blue-400 font-bold">
                {u.wins} <Trophy size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );

  const renderBonus = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-md mx-auto w-full space-y-6">
        <h1 className="text-3xl font-bold">خەڵاتی ڕۆژانە</h1>
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-center space-y-6">
          <div className="w-32 h-32 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center border-2 border-yellow-500/30">
            <Gift size={64} className="text-yellow-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">خەڵاتی ئەمڕۆت ئامادەیە!</h2>
            <p className="text-gray-400">هەموو ٢٤ کاتژمێرێک دەتوانیت ٥٠ کۆین وەک دیاری وەرگریت</p>
          </div>
          <button 
            onClick={handleClaimBonus}
            className="w-full py-4 rounded-2xl bg-green-600 font-bold text-xl hover:bg-green-500 transition-all shadow-lg shadow-green-900/20"
          >
            وەرگرتنی ٥٠ کۆین
          </button>
        </div>

        <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
          <h3 className="font-bold mb-4">کوێستەکانی ئەمڕۆ</h3>
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/5 flex items-center justify-between opacity-50">
              <div className="flex flex-col">
                <span className="font-bold">بردنەوەی ٣ یاری</span>
                <span className="text-xs text-gray-500">0 / 3 تەواو بووە</span>
              </div>
              <span className="text-yellow-400 font-bold">+100 <Coins size={14} className="inline" /></span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 flex items-center justify-between opacity-50">
              <div className="flex flex-col">
                <span className="font-bold">ناردنی ١٠ وشە</span>
                <span className="text-xs text-gray-500">0 / 10 تەواو بووە</span>
              </div>
              <span className="text-yellow-400 font-bold">+50 <Coins size={14} className="inline" /></span>
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );

  const renderProfile = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#0a0a0a] text-white font-sans" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
      >
        <button onClick={() => setView("login")} className="mb-6 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all">
          <ArrowLeft size={20} />
        </button>
        
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-red-500 p-1">
              <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={40} className="text-yellow-400" />
                )}
              </div>
            </div>
            <button className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-600 border-2 border-[#0a0a0a]">
              <Camera size={14} />
            </button>
          </div>
          
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-2xl font-bold text-center bg-transparent border-b border-white/10 focus:border-yellow-400 outline-none px-2 py-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div className="text-gray-400 text-xs mb-1">کۆینەکان</div>
            <div className="text-2xl font-bold text-green-400 flex items-center justify-center gap-1">
              {profile?.coins} <Coins size={20} />
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
            <div className="text-gray-400 text-xs mb-1">بردنەوەکان</div>
            <div className="text-2xl font-bold text-blue-400 flex items-center justify-center gap-1">
              {profile?.wins} <Trophy size={20} />
            </div>
          </div>
        </div>

        <button 
          onClick={() => handleUpdateProfile(name)}
          className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 font-bold transition-all"
        >
          پاشەکەوتکردنی گۆڕانکارییەکان
        </button>
      </motion.div>
    </div>
  );

  const renderLobby = () => (
    <div className="flex flex-col min-h-screen p-4 bg-[#0a0a0a] text-white font-sans pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button onClick={() => { socket?.disconnect(); setRoom(null); setView("home"); }} className="p-2 rounded-xl bg-white/5 border border-white/10">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Users className="text-yellow-400" />
                  یاریکەران ({room?.players.length})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {room?.players.find(p => p.id === socket?.id)?.isHost && (
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-gray-400"
                  >
                    <Settings size={20} />
                  </button>
                )}
                <div 
                  onClick={copyCode}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all"
                >
                  <span className="text-yellow-400 font-mono">{room?.code}</span>
                  <Copy size={16} />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showSettings && room?.players.find(p => p.id === socket?.id)?.isHost && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
                >
                  <h3 className="text-sm font-bold text-gray-400 mb-4">ڕێکخستنەکانی ڕوم</h3>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ژمارەی قۆناغەکان</label>
                      <input 
                         type="number" 
                         value={room.maxRounds}
                         onChange={(e) => handleUpdateSettings(parseInt(e.target.value), room.roundDuration, room.excludedLetters, room.isPublic)}
                         className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">کاتی هەر قۆناغێک (چرکە)</label>
                      <input 
                         type="number" 
                         value={room.roundDuration}
                         onChange={(e) => handleUpdateSettings(room.maxRounds, parseInt(e.target.value), room.excludedLetters, room.isPublic)}
                         className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div 
                        onClick={() => handleUpdateSettings(room.maxRounds, room.roundDuration, room.excludedLetters, !room.isPublic)}
                        className={`w-12 h-6 rounded-full relative transition-all ${room.isPublic ? "bg-green-600" : "bg-gray-600"}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${room.isPublic ? "left-7" : "left-1"}`} />
                      </div>
                      <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-all">
                        {room.isPublic ? "ڕومی گشتی (هەمووان دەتوانن بێن)" : "ڕومی تایبەت (تەنیا بە کۆد)"}
                      </span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs text-gray-500">لادانی پیتەکان (ئەو پیتانەی ناتەوێت لە یارییەکەدا بن)</label>
                    <div className="grid grid-cols-8 gap-1">
                      {KURDISH_ALPHABET.map(letter => {
                        const isExcluded = room.excludedLetters?.includes(letter);
                        return (
                          <button
                            key={letter}
                            onClick={() => {
                              const currentExcluded = room.excludedLetters || [];
                              const newExcluded = isExcluded 
                                ? currentExcluded.filter(l => l !== letter)
                                : [...currentExcluded, letter];
                              
                              // Don't allow excluding all letters
                              if (newExcluded.length < KURDISH_ALPHABET.length) {
                                handleUpdateSettings(room.maxRounds, room.roundDuration, newExcluded, room.isPublic);
                              }
                            }}
                            className={`p-1 text-xs rounded border transition-all ${isExcluded ? "bg-red-500/20 border-red-500 text-red-500" : "bg-white/5 border-white/10 text-gray-400"}`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {room?.players.map((p) => (
                <motion.div 
                  layout
                  key={p.id}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-black ${p.isBot ? "bg-purple-500" : "bg-gradient-to-br from-yellow-400 to-red-500"}`}>
                      {p.isBot ? "🤖" : p.name[0]}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        {p.name}
                        {p.isHost && <Crown size={14} className="text-yellow-400" />}
                      </div>
                      <div className="text-xs text-gray-400">
                        {p.isBot ? `بۆت (${p.difficulty === "easy" ? "ئاسان" : p.difficulty === "normal" ? "نۆرمال" : "بەهێز"})` : "ئامادەیە"}
                      </div>
                    </div>
                  </div>
                  
                  {room.players.find(pl => pl.id === socket?.id)?.isHost && p.id !== socket?.id && (
                    <div className="flex gap-2">
                      {!p.isBot && (
                        <button 
                          onClick={() => socket?.emit("promoteToHost", { code: room.code, playerId: p.id })}
                          className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                        >
                          <Crown size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => socket?.emit("kickPlayer", { code: room.code, playerId: p.id })}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {room?.players.find(p => p.id === socket?.id)?.isHost && (
              <div className="mt-8 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => handleAddBot("easy")}
                    className="py-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 text-sm"
                  >
                    + بۆتی ئاسان
                  </button>
                  <button 
                    onClick={() => handleAddBot("normal")}
                    className="py-2 rounded-xl bg-purple-600/40 text-purple-300 border border-purple-500/50 hover:bg-purple-600/50 text-sm"
                  >
                    + بۆتی نۆرمال
                  </button>
                  <button 
                    onClick={() => handleAddBot("hard")}
                    className="py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 text-sm"
                  >
                    + بۆتی بەهێز
                  </button>
                </div>
                <button 
                  onClick={handleStartGame}
                  disabled={room.players.length < 2}
                  className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-xl shadow-lg shadow-green-900/20"
                >
                  دەستپێکردنی یاری
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="flex flex-col h-[600px] p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="text-blue-400" />
            چاتی ڕاستەوخۆ
          </h2>
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 scrollbar-hide">
            {chat.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.name === name ? "items-start" : "items-end"}`}>
                <span className="text-[10px] text-gray-500 mb-1">{msg.name}</span>
                <div className={`px-4 py-2 rounded-2xl max-w-[80%] ${msg.name === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white/10 text-gray-200 rounded-tl-none"}`}>
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input 
              type="text" 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="نامەیەک بنووسە..."
              className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 outline-none"
            />
            <button className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition-all">
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const renderGame = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#0a0a0a] text-white font-sans overflow-hidden" dir="rtl">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-xs text-gray-400">قۆناغ</div>
              <div className="text-2xl font-bold text-yellow-400">{room?.round}</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-xs text-gray-400">کۆین</div>
              <div className="text-2xl font-bold text-green-400 flex items-center gap-1">
                {room?.players.find(p => p.id === socket?.id)?.coins}
                <Coins size={16} />
              </div>
            </div>
          </div>

          {/* Circular Timer */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="48" cy="48" r="40"
                fill="transparent"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              <motion.circle
                cx="48" cy="48" r="40"
                fill="transparent"
                stroke={timer > 2 ? "#22c55e" : "#ef4444"}
                strokeWidth="8"
                strokeDasharray="251.2"
                animate={{ strokeDashoffset: 251.2 - (251.2 * timer) / 5 }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </svg>
            <div className="absolute text-3xl font-bold">{timer}</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs text-gray-400">یاریکەرانی ماوە</div>
              <div className="text-xl font-bold text-blue-400">{room?.players.filter(p => p.isAlive).length}</div>
            </div>
            <Users className="text-blue-400" />
          </div>
        </div>

        {/* Main Game Area */}
        <div className="relative flex flex-col items-center">
          <AnimatePresence mode="wait">
            {!showResults ? (
              <motion.div 
                key="input"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="w-full flex flex-col items-center"
              >
                <div className="text-8xl font-bold mb-8 text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                  {room?.currentLetter}
                </div>
                
                <form onSubmit={handleSendWord} className="w-full max-w-md">
                  <input 
                    autoFocus
                    type="text"
                    value={word}
                    onChange={(e) => setWord(e.target.value)}
                    placeholder="وشەیەک بنووسە..."
                    disabled={!room?.players.find(p => p.id === socket?.id)?.isAlive}
                    className="w-full px-8 py-6 rounded-3xl bg-white/5 border-2 border-white/10 focus:border-yellow-400 outline-none text-center text-4xl font-bold transition-all placeholder:text-white/20"
                  />
                  <p className="mt-4 text-center text-gray-400">
                    {room?.players.find(p => p.id === socket?.id)?.isAlive 
                      ? "وشەیەک بنووسە کە بەم پیتە دەست پێبکات" 
                      : "تۆ دەرکراویت، دەتوانیت سەیری یارییەکە بکەیت یان بچیتە دەرەوە"}
                  </p>
                </form>

                {!room?.players.find(p => p.id === socket?.id)?.isAlive && (
                  <motion.button 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => { socket?.disconnect(); setRoom(null); setView("home"); }}
                    className="mt-8 px-10 py-4 rounded-2xl bg-red-500 text-white font-bold shadow-lg shadow-red-900/20 hover:bg-red-400 transition-all flex items-center gap-2"
                  >
                    <LogOut size={20} />
                    چوونە دەرەوە لە یاری
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {roundResults.map((res, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={res.id}
                    className={`p-4 rounded-2xl border backdrop-blur-xl ${res.isAlive ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold">{res.name}</span>
                      {res.isAlive ? (
                        <span className="text-xs px-2 py-1 bg-green-500 text-white rounded-full">ماوە</span>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-red-500 text-white rounded-full">دەرکرا</span>
                      )}
                    </div>
                    <div className="text-2xl font-bold mb-1">{res.word || "---"}</div>
                    {!res.isAlive && <div className="text-xs text-red-400">{res.reason}</div>}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  const renderGameOver = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#0a0a0a] text-white font-sans" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 text-center"
      >
        <Trophy size={80} className="mx-auto text-yellow-400 mb-6" />
        <h1 className="text-4xl font-bold mb-2">کۆتایی یاری</h1>
        
        {winner ? (
          <div className="mb-8">
            <p className="text-gray-400 mb-4">براوەی ئەم یارییە</p>
            <div className="text-3xl font-bold text-yellow-400">{winner.name}</div>
            <div className="mt-2 text-green-400 flex items-center justify-center gap-1">
              +50 کۆین <Coins size={16} />
            </div>
          </div>
        ) : (
          <p className="text-xl text-red-400 mb-8">هیچ کەسێک نەیبردەوە!</p>
        )}

        <div className="space-y-4">
          <button 
            onClick={() => setView("lobby")}
            className="w-full py-4 rounded-xl bg-yellow-500 text-black font-bold text-lg hover:bg-yellow-400 transition-all"
          >
            گەڕانەوە بۆ لۆبی
          </button>
          <button 
            onClick={() => { setRoom(null); setView("login"); }}
            className="w-full py-4 rounded-xl bg-white/5 border border-white/10 font-bold text-lg hover:bg-white/10 transition-all"
          >
            چوونە دەرەوە
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-white/10">
          <h3 className="text-sm font-bold text-gray-400 mb-4">پلەبەندی یاریکەران</h3>
          <div className="space-y-2">
            {room?.players.sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">#{i+1}</span>
                  <span>{p.name}</span>
                </div>
                <span className="font-bold text-yellow-400">{p.score} خاڵ</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <>
      {view === "login" && renderLogin()}
      {view === "home" && renderHome()}
      {view === "profile" && renderProfile()}
      {view === "shop" && renderShop()}
      {view === "rank" && renderRank()}
      {view === "bonus" && renderBonus()}
      {view === "battle" && renderBattle()}
      {view === "private" && renderPrivate()}
      {view === "lobby" && renderLobby()}
      {view === "game" && renderGame()}
      {view === "gameover" && renderGameOver()}
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl bg-red-500 text-white font-bold shadow-xl z-[100]"
        >
          {error}
        </motion.div>
      )}
    </>
  );
}
