/* PLAY ONLINE — multiplayer lobby, work branch only.
   Font Fight Arena system, reused exactly: PeerJS, free public server,
   host-authoritative, room-code join. No backend, no Firebase, no paid server.
   Single-player vs bots is untouched: this file only manages the #playonline
   screen and PeerJS lobby/role messages. It never touches the game engine.
   Roles: host rolls at match start and broadcasts them.
   1v1: roles swap every round — never prop twice, never hunter twice.
   5v5: pure RNG, repeats allowed.
   5V5 START RULE (MW, Oct 31): a lobby does NOT need a full 10 players
   to start — 4 players total (MW + 3 friends) starts fine. START MATCH is
   NEVER gated on 10 players or on balanced 5v5 teams. Its only gate is:
   after the roll there must be at least 1 hunter AND at least 1 prop.
   5v5 rolls re-roll (pure RNG) until both roles are present.
   Live in-game (3D) player sync lives in playonline-sync.js: START MATCH
   distributes synced roles, and the sync layer converts the engine
   match into a multiplayer match (see that file's header).
   HOST-ONLY MANAGEMENT (MW, Oct 31): add bots, remove bots, and remove
   (kick) players are HOST-ONLY, enforced in logic, not just by hiding
   buttons. Guests see no management buttons, and every management
   function first checks isHost and returns without changing anything for
   a guest — even if called through the test hook or another path. The
   host also ignores roster messages from guests: only the host is the
   lobby authority.
   JOIN STUCK (MW, Nov 1, 01:48 CDT screenshots, room 4F24): host said
   "Player connected — 2 in lobby" while the iPhone guest stayed on
   "Connecting to host…" and BOTH lobbies still showed YOU + WAITING
   with count 1. Diagnosis from the code, not a guess: (a) Prop Hunt
   created its Peer with NO ICE config, so PeerJS used STUN only and
   no TURN relay — Font Fight, the system this was copied from, passes
   a Metered TURN relay. Signalling reached the host (hence the
   "connected" status) but the WebRTC data channel never opened
   between the iPad and iPhone, so hello/lobby never exchanged. Fix:
   pass Font Fight's ICE config (STUN + TURN) to both host and guest
   Peers. (b) Even if the channel had opened, the guest never showed
   the host: the "lobby" handler rendered without ever putting the host
   in the guest's player list, and the host's "Player connected"
   status counted 2 before hello arrived. Fix: host status at
   connection time is "Player connecting…", the true count is only
   set on hello, and the guest builds its list as HOST + other guests
   (filtering itself out by peer id) from lobby/roster messages that
   now carry peer ids, not just names. (c) Guest now gets a 10 s
   connect timeout with a plain message instead of "Connecting…"
   forever. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var screen = null, menu = null;
  var mode = "1v1", roomCode = "", isHost = true, lastRole = null, round = 0;
  var peer = null, conns = [], hostConn = null, peerReady = false, peerStatus = "";
  var players = []; // {id, name, host} — real players other than YOU
  var syncHandlers = [];
  var syncQueue = []; // sync messages arriving before any handler registered
  function sendSync(msg) {
    if (isHost) broadcast(msg);
    else if (hostConn && hostConn.open) { try { hostConn.send(msg); } catch (e) {} }
  }
  function buildOccupants(all) {
    var occ = [{ peerId: (peer && peer.id) ? peer.id : "host", name: "YOU", role: all[0], isBot: false }];
    var k;
    for (k = 0; k < players.length; k++) occ.push({ peerId: players[k].id, name: players[k].name, role: all[k + 1], isBot: false });
    for (k = 0; k < bots.length; k++) occ.push({ peerId: bots[k].id, name: bots[k].name, role: all[players.length + 1 + k], isBot: true });
    return occ;
  }
  var bots = []; // {id, name} — host-added bots, e.g. BOT 1, BOT 2

  function el(id) { return $(id); }
  function toast(msg, lobby) {
    var t = el(lobby ? "poToastLobby" : "poToast");
    if (!t) return;
    t.textContent = msg; t.classList.add("on");
  }
  function setStatus(msg) {
    var s = el("poStatus"); if (s) s.textContent = msg;
  }
  /* ROOM CODE FORMAT (MW, Oct 31): exactly 4 alphanumeric characters,
     e.g. QV56, 7KQ2. No PH- prefix and no special characters in the code
     the player sees, shares, or types. The PeerJS peer id is namespaced
     internally only (prophunt-<code>) and is never shown as the code. */
  function makeCode() {
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", out = "";
    for (var i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  function normalizeCode(v) {
    return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function isValidCode(v) { return /^[A-Z0-9]{4}$/.test(v); }
  function peerIdFor(code) {
    return "prophunt-" + normalizeCode(code).toLowerCase();
  }
  /* ICE config — same relay setup as Font Fight Arena (STUN + Metered
     TURN). Without a TURN relay, two iOS devices that cannot open a
     direct WebRTC channel signal fine but never open the data channel,
     which is exactly the Nov 1 "Connecting to host…" stall. */
  function iceCfg() {
    return { config: { iceCandidatePoolSize: 10, iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:us-central.relay.metered.ca:80", username: "6da69f246311efa4ffa37b8d", credential: "4l3OjkferhQxArjs" },
      { urls: "turn:us-central.relay.metered.ca:80?transport=tcp", username: "6da69f246311efa4ffa37b8d", credential: "4l3OjkferhQxArjs" },
      { urls: "turn:us-central.relay.metered.ca:443", username: "6da69f246311efa4ffa37b8d", credential: "4l3OjkferhQxArjs" },
      { urls: "turns:us-central.relay.metered.ca:443?transport=tcp", username: "6da69f246311efa4ffa37b8d", credential: "4l3OjkferhQxArjs" }
    ] } };
  }
  function cap() { return mode === "1v1" ? 2 : 10; }
  function mapName() { return mode === "1v1" ? "MAPLE HOUSE" : "MAPLE STREET"; }
  function modeName() { return mode === "1v1" ? "1V1 DUEL" : "5V5 SQUADS"; }

  function setMode(m) {
    mode = m;
    var a = el("poTab1v1"), b = el("poTab5v5");
    if (a) a.classList.toggle("on", m === "1v1");
    if (b) b.classList.toggle("on", m === "5v5");
    var l = el("poCreateModeLabel");
    if (l) l.textContent = m === "1v1" ? "1v1 Duel" : "5v5 Squads";
    /* ROOM CODE 0000 FIX (MW, Oct 31: code always said 0000): do NOT
       switch to the lobby view here. Previously setMode called
       renderLobby() whenever the Play Online screen was shown, so
       tapping the 5v5 tab alone opened a phantom lobby with
       roomCode still "" — and renderLobby renders "" as "0000".
       The CREATE ROOM button lives in the home view, so that phantom
       lobby hid it and the user could never actually create a room.
       Only re-render the lobby if a room already exists (roomCode
       set by Create/Join); otherwise stay on the home view so the
       user can press CREATE ROOM, which generates a real code. */
    if (roomCode && screen && screen.classList.contains("show")) renderLobby();
  }

  function occupantsCount() { return 1 + players.length + bots.length; }
  /* Host-only guard — the single choke point for every management action.
     Returns false (and changes nothing) for a guest, no matter how the
     action was triggered. Buttons are also hidden for guests in render. */
  function hostOnly() {
    if (isHost) return true;
    setStatus("Only the host can manage the lobby.");
    toast("Only the host can manage the lobby.", true);
    return false;
  }
  function broadcastRoster() {
    broadcast({ type: "roster", mode: mode,
      players: players.map(function (p) { return { id: p.id, name: p.name }; }),
      bots: bots.map(function (b) { return b.name; }) });
  }
  /* Guest lobby list: HOST first, then other real guests (never
     yourself — filtered by peer id, since every guest is named
     "PLAYER" and names alone cannot tell you apart). */
  function guestPlayersFrom(list) {
    var out = [], k, p, myId = peer ? peer.id : "";
    if (hostConn && hostConn.peer) out.push({ id: hostConn.peer, name: "HOST" });
    (list || []).forEach(function (item) {
      p = typeof item === "string" ? { id: "peer-" + out.length, name: item } : item;
      if (p.id && p.id !== myId && p.id !== (hostConn && hostConn.peer)) out.push({ id: p.id, name: p.name || "PLAYER" });
    });
    return out;
  }
  function addBot() {
    if (!hostOnly()) return false;
    if (occupantsCount() >= cap()) {
      toast("Lobby is full — remove a bot or player first.", true);
      return false;
    }
    var n = 1;
    while (bots.some(function (b) { return b.name === "BOT " + n; })) n += 1;
    bots.push({ id: "bot-" + Date.now() + "-" + n, name: "BOT " + n });
    renderPlayers(); broadcastRoster();
    setStatus("Bot added — " + occupantsCount() + " in lobby.");
    return true;
  }
  function removeBot(idx) {
    if (!hostOnly()) return false;
    if (!bots[idx]) return false;
    bots.splice(idx, 1);
    renderPlayers(); broadcastRoster();
    return true;
  }
  function removePlayer(idx) {
    if (!hostOnly()) return false;
    if (!players[idx]) return false;
    var p = players[idx];
    players.splice(idx, 1);
    var conn = null, ci;
    for (ci = 0; ci < conns.length; ci++) {
      if (conns[ci].peer === p.id) { conn = conns[ci]; break; }
    }
    if (conn) {
      try { conn.send({ type: "kicked" }); } catch (e) {}
      try { conn.close(); } catch (e) {}
      conns = conns.filter(function (c) { return c !== conn; });
    }
    renderPlayers(); broadcastRoster();
    setStatus("Player removed — " + occupantsCount() + " in lobby.");
    return true;
  }

  function renderPlayers() {
    var list = el("poPlayerList"); if (!list) return;
    list.innerHTML = "";
    var c = cap(), i, d, btn;
    /* Slot order: YOU, real players, bots, then WAITING slots.
       Management buttons exist ONLY in host view, inside the card on
       the right side. The host never gets a button on their own card. */
    var slots = [{ kind: "you" }];
    players.forEach(function (p) { slots.push({ kind: "player", player: p }); });
    bots.forEach(function (b) { slots.push({ kind: "bot", bot: b }); });
    while (slots.length < c) slots.push({ kind: "wait" });
    for (i = 0; i < c; i++) {
      var s = slots[i];
      d = document.createElement("div");
      btn = "";
      if (s.kind === "you") {
        d.className = "po-slot";
        d.innerHTML = '<span class="po-dot"></span><span class="po-name">YOU</span>' + (isHost ? '<span class="po-tag">HOST</span>' : '<span class="po-tag">GUEST</span>');
      } else if (s.kind === "player") {
        d.className = "po-slot";
        var pIdx = players.indexOf(s.player);
        if (isHost) btn = '<button class="po-slotbtn kick" type="button" data-po-action="remove-player" data-po-idx="' + pIdx + '" title="Remove player">REMOVE</button>';
        /* Host view: button present, so the duplicate PLAYER tag is omitted —
           the name already says PLAYER, and the tag + wide button were what
           squeezed the name to "PL..." and pushed the card past its edge. */
        d.innerHTML = isHost
          ? '<span class="po-dot"></span><span class="po-name">' + s.player.name + '</span>' + btn
          : '<span class="po-dot"></span><span class="po-name">' + s.player.name + '</span><span class="po-tag">PLAYER ' + (i + 1) + "</span>" + btn;
      } else if (s.kind === "bot") {
        d.className = "po-slot";
        var bIdx = bots.indexOf(s.bot);
        if (isHost) btn = '<button class="po-slotbtn bot" type="button" data-po-action="remove-bot" data-po-idx="' + bIdx + '" title="Remove bot">REMOVE BOT</button>';
        /* Same fix as players: host view omits the duplicate BOT tag so the
           button fits inside the card; the name already says BOT. */
        d.innerHTML = isHost
          ? '<span class="po-dot"></span><span class="po-name">' + s.bot.name + '</span>' + btn
          : '<span class="po-dot"></span><span class="po-name">' + s.bot.name + '</span><span class="po-tag">BOT</span>' + btn;
      } else {
        d.className = "po-slot wait";
        if (isHost) btn = '<button class="po-slotbtn add" type="button" data-po-action="add-bot">ADD BOT</button>';
        d.innerHTML = '<span class="po-dot"></span><span class="po-name">WAITING\u2026</span>' + btn;
      }
      list.appendChild(d);
    }
    var cnt = el("poLobbyCount");
    if (cnt) cnt.textContent = occupantsCount() + " PLAYERS · MAX " + c;
  }

  function renderLobby() {
    /* Never show a lobby with no code: an empty roomCode renders as
       the static "0000" placeholder, which MW saw as a real room code.
       Callers that create/join a room set roomCode first; if it is
       still empty, stay on the home view instead of showing 0000. */
    if (!roomCode) { showHome(); return; }
    var code = el("poRoomCode"); if (code) code.textContent = roomCode || "0000";
    var m = el("poLobbyMode"); if (m) m.textContent = modeName();
    var mp = el("poLobbyMap"); if (mp) mp.textContent = mapName();
    var r = el("poLobbyRole"); if (r) r.textContent = isHost ? "HOST" : "GUEST";
    var start = el("poBtnStart"); if (start) start.disabled = !isHost;
    renderPlayers();
    var home = el("poViewHome"), lobby = el("poViewLobby");
    if (home) home.classList.remove("on");
    if (lobby) lobby.classList.add("on");
  }
  function showHome() {
    var home = el("poViewHome"), lobby = el("poViewLobby");
    if (lobby) lobby.classList.remove("on");
    if (home) home.classList.add("on");
  }
  function openMenu() {
    screen = el("playonline"); menu = el("menu");
    if (menu) menu.classList.remove("show");
    if (screen) screen.classList.add("show");
    showHome();
    /* Preload PeerJS now, while the player is still choosing
       Create/Join, so the script is cached by the time they tap —
       joining feels instant instead of waiting on a script load. */
    try { loadPeerJS(function () {}); } catch (e) {}
  }
  function closeMenu() {
    if (screen) screen.classList.remove("show");
    if (menu) menu.classList.add("show");
  }
  function disconnect() {
    try { conns.forEach(function (c) { try { c.close(); } catch (e) {} }); } catch (e) {}
    try { if (hostConn) hostConn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conns = []; hostConn = null; peer = null; peerReady = false; players = []; bots = [];
  }

  /* ---- PeerJS ---- */
  var peerJsLoading = false, peerJsQueue = [];
  function loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    if (peerJsLoading) { peerJsQueue.push(cb); return; }
    peerJsLoading = true;
    var done = false;
    var finish = function () {
      if (done) return; done = true; peerJsLoading = false;
      var q = peerJsQueue; peerJsQueue = [];
      cb(); q.forEach(function (f) { try { f(); } catch (e) {} });
    };
    var s = document.createElement("script");
    s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    s.onload = finish;
    /* One retry on load failure (unpkg hiccup) instead of giving up
       straight to "lobby preview only" — connection felt dead on
       the first slow load. */
    s.onerror = function () {
      if (!s._retried) {
        s._retried = true;
        var s2 = document.createElement("script");
        s2.src = s.src; s2.onload = finish;
        s2.onerror = function () { setStatus("PeerJS could not load — lobby preview only (no connection)."); finish(); };
        document.head.appendChild(s2);
      } else { setStatus("PeerJS could not load — lobby preview only (no connection)."); finish(); }
    };
    document.head.appendChild(s);
  }
  function broadcast(msg) {
    conns.forEach(function (c) {
      try { if (c.open) c.send(msg); } catch (e) {}
    });
    try { if (hostConn && hostConn.open) hostConn.send(msg); } catch (e) {}
  }
  function onData(conn, data) {
    if (!data || !data.type) return;
    if (data.type.indexOf("sync-") === 0) {
      /* Queue, don't drop: a guest's first states can arrive before
         the host's match (and its sync handler) is ready. Queued
         messages flush when the first handler registers (see onSync
         below). Cap the queue so a dead peer can't grow it forever. */
      if (!syncHandlers.length) { syncQueue.push(data); while (syncQueue.length > 50) syncQueue.shift(); return; }
      syncHandlers.forEach(function (h) { try { h(data); } catch (e) {} }); return;
    }
    if (data.type === "roster") {
      /* Host is the only lobby authority: guests apply a host roster,
         the host ignores any roster a guest tries to send. */
      if (isHost) return;
      players = guestPlayersFrom(data.players);
      bots = (data.bots || []).map(function (nm, k) { return typeof nm === "string" ? { id: "bot-" + k, name: nm } : nm; });
      renderPlayers();
      return;
    }
    if (data.type === "kicked") {
      if (!isHost) {
        disconnect(); showHome();
        toast("Removed from the lobby by the host.");
        setStatus("Removed from the lobby by the host.");
      }
      return;
    }
    if (data.type === "hello") {
      if (!isHost) return; /* only the host accepts joins */
      var name = data.name || "PLAYER";
      if (!players.some(function (p) { return p.id === conn.peer; })) {
        players.push({ id: conn.peer, name: name });
      }
      renderPlayers();
      try { conn.send({ type: "lobby", mode: mode, players: players.map(function (p) { return { id: p.id, name: p.name }; }) }); } catch (e) {}
      setStatus("Player connected — " + occupantsCount() + " in lobby.");
    } else if (data.type === "lobby") {
      if (!isHost) players = guestPlayersFrom(data.players);
      setStatus("Connected — waiting for host to start.");
      renderPlayers();
    } else if (data.type === "roles" || data.type === "start") {
      if (data.type === "start") {
        try {
          if (window.__poSync && window.__poSync.setIdentity) window.__poSync.setIdentity(peer ? peer.id : "", false, "YOU");
          if (window.__poSync) window.__poSync.startFromNetwork({ mode: data.mode || mode, round: data.round || round, rolesList: data.rolesList, roles: data.roles, rolesByPeer: data.rolesByPeer, occupants: data.occupants || [] });
        } catch (e) {}
      }
      round = data.round || round;
      var myRole = null;
      if (data.rolesByPeer && peer && peer.id && data.rolesByPeer[peer.id]) {
        myRole = data.rolesByPeer[peer.id];
      } else if (data.roles) {
        myRole = data.roles.guest || data.roles.you || null;
      }
      if (data.type === "roles") {
        setStatus("Round " + round + " — you are " + (myRole ? myRole.toUpperCase() : "ASSIGNED") + ".");
        toast("Your role: " + (myRole || "?") + ". Multiplayer match sync is live in this branch.", true);
      } else {
        setStatus("Match started — you are " + (myRole ? myRole.toUpperCase() : "ASSIGNED") + ".");
      }
    }
  }
  function wireConn(conn) {
    conn.on("open", function () {
      try { conn.send({ type: "hello", name: "PLAYER" }); } catch (e) {}
    });
    conn.on("data", function (d) { onData(conn, d); });
    conn.on("close", function () {
      /* Prune the dead connection (old code kept it in conns, so
         every broadcast kept trying a closed channel) and drop the
         player from the roster. If the host left while a guest is
         still in the lobby (no match running), say so and return
         to the home view instead of leaving a stale lobby. A
         mid-match host loss is NOT auto-kicked here — the match
         simply stops receiving snapshots, and the player leaves
         through the game's own pause/back flow. */
      conns = conns.filter(function (c) { return c !== conn; });
      players = players.filter(function (p) { return p.id !== conn.peer; });
      var inMatch = false;
      try { var st0 = window.__poSync && window.__poSync.getState && window.__poSync.getState(); inMatch = !!(st0 && st0.active); } catch (e) {}
      if (isHost) {
        /* FINAL SCAN FIXES: (a) a guest leaving the lobby used to
           stay on every OTHER guest's roster until the next roster
           broadcast — re-broadcast now. (b) a guest disconnecting
           mid-match used to leave a frozen actor behind — tell the
           sync layer, which removes it and broadcasts the removal
           to the remaining guests. */
        broadcastRoster();
        if (inMatch) { try { if (window.__poSync && window.__poSync.onPlayerLeft) window.__poSync.onPlayerLeft(conn.peer); } catch (e) {} }
      }
      if (!isHost && hostConn === conn) {
        hostConn = null;
        if (!inMatch) { setStatus("Host left — lobby closed."); showHome(); }
      }
      renderPlayers();
    });
  }
  function initHost() {
    loadPeerJS(function () {
      if (!window.Peer) { setStatus("PeerJS unavailable — lobby preview only."); return; }
      try {
        peer = new Peer(peerIdFor(roomCode), iceCfg());
        peer.on("open", function () {
          peerReady = true;
          setStatus("Room live — share the code. Waiting for players.");
        });
        peer.on("connection", function (conn) {
          conns.push(conn); wireConn(conn);
          /* Do NOT claim "2 in lobby" here: this fires on signalling
             alone, before hello arrives. The true count is set on
             hello, after the data channel actually opens. */
          setStatus("Player connecting…");
        });
        peer.on("error", function (err) {
          if (err && err.type === "unavailable-id") {
            try { peer.destroy(); } catch (e) {}
            peer = null;
            roomCode = makeCode(); renderLobby(); initHost();
          } else {
            setStatus("PeerJS error — lobby preview only. Code still works locally.");
          }
        });
      } catch (e) { setStatus("PeerJS unavailable — lobby preview only."); }
    });
  }
  var guestAttempts = 0;
  function initGuest(code) {
    loadPeerJS(function () {
      if (!window.Peer) { setStatus("PeerJS unavailable — lobby preview only."); return; }
      try {
        peer = new Peer(iceCfg());
        peer.on("open", function () {
          peerReady = true;
          guestAttempts = 0;
          connectToHost(code);
        });
        peer.on("error", function (err) {
          /* "peer-unavailable" usually just means the host's Peer
             isn't open yet (room created a second ago) — retry the
             connection instead of dead-ending on the first try. */
          if (err && err.type === "peer-unavailable" && guestAttempts < 3) {
            guestAttempts += 1;
            setStatus("Host not ready yet — retrying (" + guestAttempts + "/3)…");
            setTimeout(function () { connectToHost(code); }, 1200);
          } else {
            setStatus("Could not connect — check the code and try again.");
          }
        });
      } catch (e) { setStatus("Could not connect — check the code and try again."); }
    });
  }
  function connectToHost(code) {
    if (!peer) return;
    setStatus(guestAttempts > 0 ? "Retrying connection (" + guestAttempts + "/3)…" : "Connecting to host…");
    try {
      /* Clear hostConn BEFORE closing the old one, or the close
         handler would read it as "host left" and bounce to home
         mid-retry. */
      var oldConn = hostConn; hostConn = null;
      if (oldConn) { try { oldConn.close(); } catch (e) {} }
      hostConn = peer.connect(peerIdFor(code), { reliable: true });
      wireConn(hostConn);
      hostConn.on("open", function () { guestAttempts = 0; setStatus("Connected — waiting for host to start."); });
      /* No more "Connecting…" forever: after 10 s without an open
         channel, retry (up to 3 times total), then say so plainly. */
      setTimeout(function () {
        if (hostConn && !hostConn.open) {
          if (guestAttempts < 3) {
            guestAttempts += 1;
            setStatus("Connection slow — retrying (" + guestAttempts + "/3)…");
            connectToHost(code);
          } else {
            setStatus("Could not connect — host may have left, or the network blocked the connection. Leave and try again.");
          }
        }
      }, 10000);
    } catch (e) { setStatus("Could not connect — check the code and try again."); }
  }

  /* ---- Roles ----
     Returns one role per player in lobby order: index 0 = host, then
     players[] in connection order. START is never gated on lobby size
     or team balance — only on both roles being present (see Start). */
  function rollRolesForAll() {
    round += 1;
    var total = occupantsCount(), roles = [], i, hasH, hasP, tries;
    if (mode === "1v1") {
      var hostRole;
      if (lastRole === null) {
        hostRole = Math.random() < 0.5 ? "hunter" : "prop";
      } else {
        hostRole = lastRole === "hunter" ? "prop" : "hunter";
      }
      lastRole = hostRole;
      roles.push(hostRole);
      if (total > 1) roles.push(hostRole === "hunter" ? "prop" : "hunter");
      for (i = 2; i < total; i++) roles.push(Math.random() < 0.5 ? "hunter" : "prop");
    } else {
      /* 5v5: pure RNG per player, re-rolled until at least 1 hunter AND
         at least 1 prop are present (only when 2+ players exist). */
      tries = 0;
      do {
        roles = [];
        for (i = 0; i < total; i++) roles.push(Math.random() < 0.5 ? "hunter" : "prop");
        hasH = roles.indexOf("hunter") !== -1;
        hasP = roles.indexOf("prop") !== -1;
        tries += 1;
        if (tries > 100 && total >= 2 && !(hasH && hasP)) {
          roles[roles.length - 1] = hasH ? "prop" : "hunter";
          break;
        }
      } while (total >= 2 && !(hasH && hasP));
    }
    return roles;
  }
  function rollRoles() {
    var r = rollRolesForAll();
    return { host: r[0], guest: r.length > 1 ? r[1] : r[0], all: r };
  }

  function bind() {
    screen = el("playonline"); menu = el("menu");
    var b;
    b = el("btnPlayOnline"); if (b) b.addEventListener("click", openMenu);
    b = el("poTab1v1"); if (b) b.addEventListener("click", function () { setMode("1v1"); });
    b = el("poTab5v5"); if (b) b.addEventListener("click", function () { setMode("5v5"); });
    b = el("poBtnCreate"); if (b) b.addEventListener("click", function () {
      isHost = true; roomCode = makeCode(); lastRole = null; round = 0;
      renderLobby(); setStatus("Creating room…"); initHost();
    });
    b = el("poBtnJoin"); if (b) b.addEventListener("click", function () {
      var inp = el("poJoinCode"); if (!inp) return;
      var v = normalizeCode(inp.value);
      if (inp) inp.value = v;
      if (!isValidCode(v)) { toast("Enter a 4-letter/number room code (e.g. QV56)."); return; }
      isHost = false; roomCode = v; lastRole = null; round = 0;
      renderLobby(); setStatus("Connecting to host…"); initGuest(v);
    });
    b = el("poBtnCopy"); if (b) b.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(roomCode).then(function () {
          toast("Room code copied: " + roomCode, true);
        }, function () { toast("Code: " + roomCode, true); });
      } else { toast("Code: " + roomCode, true); }
    });
    b = el("poBtnStart"); if (b) b.addEventListener("click", function () {
      if (!isHost) return;
      /* 5V5 START RULE: never gate on 10 players or on balanced teams.
         Only gate: at least 2 players total, so the roll can contain at
         least 1 hunter AND at least 1 prop. 4 players (MW + 3 friends)
         starts fine; a solo lobby cannot satisfy both roles. */
      var total = occupantsCount();
      if (total < 2) {
        setStatus("Need at least one other player to start — a match needs at least 1 hunter and 1 prop.");
        toast("Need at least one other player to start — a match needs at least 1 hunter and 1 prop.", true);
        return;
      }
      var all = rollRolesForAll();
      var hunters = 0, props = 0, k;
      for (k = 0; k < all.length; k++) { if (all[k] === "hunter") hunters += 1; else props += 1; }
      var byPeer = {};
      try { if (peer && peer.id) byPeer[peer.id] = all[0]; } catch (e) {}
      for (k = 0; k < players.length; k++) { if (players[k].id) byPeer[players[k].id] = all[k + 1]; }
      var roles = { host: all[0], guest: all.length > 1 ? all[1] : all[0] };
      var occList = buildOccupants(all);
      broadcast({ type: "start", mode: mode, round: round, roles: roles, rolesByPeer: byPeer, rolesList: all, occupants: occList });
      broadcast({ type: "roles", round: round, roles: roles, rolesByPeer: byPeer, rolesList: all, occupants: occList });
      try {
        if (window.__poSync && window.__poSync.setIdentity) window.__poSync.setIdentity(peer ? peer.id : "host", true, "YOU");
        if (window.__poSync) window.__poSync.startFromNetwork({ mode: mode, round: round, rolesList: all, roles: roles, rolesByPeer: byPeer, occupants: occList });
      } catch (e) {}
      setStatus("Round " + round + " started — " + hunters + " hunters, " + props + " props. You are " + all[0].toUpperCase() + ". Full lobby not required.");
      toast("Your role: " + all[0] + " — " + hunters + " hunters, " + props + " props. Starting multiplayer match — positions, transforms, shots and whistle are synced.", true);
    });
    /* Lobby slot buttons — delegated, with the host-only guard at the
       delegation point AND inside every action, so a guest click (or a
       synthetic click) can never add/remove anything. */
    var plist = el("poPlayerList");
    if (plist) plist.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-po-action]") : null;
      if (!t) return;
      if (!hostOnly()) return;
      var a = t.getAttribute("data-po-action");
      var idx = parseInt(t.getAttribute("data-po-idx"), 10) || 0;
      if (a === "add-bot") addBot();
      else if (a === "remove-bot") removeBot(idx);
      else if (a === "remove-player") removePlayer(idx);
    });
    b = el("poBtnLeave"); if (b) b.addEventListener("click", function () { disconnect(); showHome(); });
    /* 5v5 lobby scroll fix (MW, Oct 31: cannot scroll down to LEAVE on touch).
       The game bundle cancels document touchmove events unless they start inside
       ".panel"/"#hudEdit" — .po-panel is neither, so a finger drag on this lobby
       was cancelled before Safari could scroll it. This panel-level listener runs
       in bubble order BEFORE the document listener, and stopPropagation() keeps
       the bundle's preventDefault from ever firing for drags starting in this
       panel. It does not touch the bundle, the game canvas, or any other screen,
       and it never blocks clicks — it only lets the panel's own native scroll
       (touch-action:pan-y in CSS) happen. */
    var poPanel = document.querySelector(".po-panel");
    if (poPanel) poPanel.addEventListener("touchmove", function (ev) { ev.stopPropagation(); }, { passive: true });
    b = el("poBtnBack"); if (b) b.addEventListener("click", function () {
      var lobby = el("poViewLobby");
      if (lobby && lobby.classList.contains("on")) { disconnect(); showHome(); return; }
      closeMenu();
    });
    /* Test hook for headless verification only: ?po-test=1 opens the menu,
       ?po-view=lobby opens the lobby. Harmless in normal play. */
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.get("po-test") === "1") {
        if (q.get("po-host") === "0") isHost = false;
        if (q.get("po-bots")) {
          var nb2 = parseInt(q.get("po-bots"), 10) || 0, bi;
          bots = [];
          for (bi = 0; bi < nb2; bi++) bots.push({ id: "bot-" + bi, name: "BOT " + (bi + 1) });
        }
        if (q.get("po-view") === "lobby") { if (q.get("po-host") !== "0") isHost = true; roomCode = "DEMO"; renderLobby(); }
        openMenu();
        if (q.get("po-view") === "lobby") renderLobby();
        if (q.get("po-autocreate") === "1") {
          var cb = el("poBtnCreate"); if (cb) cb.click();
        }
        if (q.get("po-autojoin") === "1") {
          var inp = el("poJoinCode"); if (inp) inp.value = "TEST";
          var jb = el("poBtnJoin"); if (jb) jb.click();
        }
        if (q.get("po-players")) {
          var np = parseInt(q.get("po-players"), 10) || 0, pi;
          players = [];
          for (pi = 0; pi < np; pi++) players.push({ id: "fake-" + pi, name: "PLAYER " + (pi + 2) });
          if (q.get("po-mode") === "5v5") setMode("5v5");
          renderLobby();
        }
        if (q.get("po-autostart") === "1") {
          var sb = el("poBtnStart"); if (sb) sb.click();
        }
      }
    } catch (e) {}
    window.__po = {
      sendSync: sendSync, broadcast: broadcast, renderLobby: renderLobby,
      onSync: function (h) {
        if (syncHandlers.indexOf(h) === -1) syncHandlers.push(h);
        var q = syncQueue; syncQueue = [];
        q.forEach(function (m) { try { h(m); } catch (e) {} });
      },
      getLobby: function () { return { mode: mode, roomCode: roomCode, isHost: isHost, players: players.map(function (p) { return { id: p.id, name: p.name }; }), bots: bots.map(function (b) { return { id: b.id, name: b.name }; }), peerId: peer ? peer.id : "" }; },
      setMode: setMode, rollRoles: rollRoles, rollRolesForAll: rollRolesForAll, makeCode: makeCode,
      addBot: addBot, removeBot: removeBot, removePlayer: removePlayer,
      getState: function () { return { mode: mode, roomCode: roomCode, isHost: isHost, round: round, lastRole: lastRole, players: players.length + 1, bots: bots.length, occupants: occupantsCount() }; }
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else { bind(); }
})();
