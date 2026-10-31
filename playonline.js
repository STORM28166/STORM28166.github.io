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
   Live in-game (3D) player sync is NOT in this branch yet: START MATCH
   distributes synced roles and marks the lobby ready; the engine sync that
   replaces the AI match is the next step. This file never pretends otherwise. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var screen = null, menu = null;
  var mode = "1v1", roomCode = "", isHost = true, lastRole = null, round = 0;
  var peer = null, conns = [], hostConn = null, peerReady = false, peerStatus = "";
  var players = []; // {id, name, host}

  function el(id) { return $(id); }
  function toast(msg, lobby) {
    var t = el(lobby ? "poToastLobby" : "poToast");
    if (!t) return;
    t.textContent = msg; t.classList.add("on");
  }
  function setStatus(msg) {
    var s = el("poStatus"); if (s) s.textContent = msg;
  }
  function makeCode() {
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", out = "";
    for (var i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return "PH-" + out;
  }
  function peerIdFor(code) {
    return "prophunt-" + code.toLowerCase().replace(/[^a-z0-9-]/g, "");
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
    if (screen && screen.classList.contains("show")) renderLobby();
  }

  function renderPlayers() {
    var list = el("poPlayerList"); if (!list) return;
    list.innerHTML = "";
    var c = cap();
    for (var i = 0; i < c; i++) {
      var d = document.createElement("div");
      if (i === 0) {
        d.className = "po-slot";
        d.innerHTML = '<span class="po-dot"></span>YOU' + (isHost ? '<span class="po-tag">HOST</span>' : '<span class="po-tag">GUEST</span>');
      } else if (players[i - 1]) {
        d.className = "po-slot";
        d.innerHTML = '<span class="po-dot"></span>' + players[i - 1].name + '<span class="po-tag">PLAYER ' + (i + 1) + "</span>";
      } else {
        d.className = "po-slot wait";
        d.innerHTML = '<span class="po-dot"></span>WAITING\u2026';
      }
      list.appendChild(d);
    }
    var cnt = el("poLobbyCount");
    if (cnt) cnt.textContent = (1 + players.length) + " PLAYERS · MAX " + c;
  }

  function renderLobby() {
    var code = el("poRoomCode"); if (code) code.textContent = roomCode || "PH-0000";
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
  }
  function closeMenu() {
    if (screen) screen.classList.remove("show");
    if (menu) menu.classList.add("show");
  }
  function disconnect() {
    try { conns.forEach(function (c) { try { c.close(); } catch (e) {} }); } catch (e) {}
    try { if (hostConn) hostConn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conns = []; hostConn = null; peer = null; peerReady = false; players = [];
  }

  /* ---- PeerJS ---- */
  function loadPeerJS(cb) {
    if (window.Peer) { cb(); return; }
    var s = document.createElement("script");
    s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    s.onload = cb;
    s.onerror = function () { setStatus("PeerJS could not load — lobby preview only (no connection)."); cb(); };
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
    if (data.type === "hello") {
      var name = data.name || "PLAYER";
      if (!players.some(function (p) { return p.id === conn.peer; })) {
        players.push({ id: conn.peer, name: name });
      }
      renderPlayers();
      try { conn.send({ type: "lobby", mode: mode, players: players.map(function (p) { return p.name; }) }); } catch (e) {}
    } else if (data.type === "lobby") {
      setStatus("Connected — waiting for host to start.");
      renderPlayers();
    } else if (data.type === "roles" || data.type === "start") {
      round = data.round || round;
      var myRole = null;
      if (data.rolesByPeer && peer && peer.id && data.rolesByPeer[peer.id]) {
        myRole = data.rolesByPeer[peer.id];
      } else if (data.roles) {
        myRole = data.roles.guest || data.roles.you || null;
      }
      if (data.type === "roles") {
        setStatus("Round " + round + " — you are " + (myRole ? myRole.toUpperCase() : "ASSIGNED") + ".");
        toast("Your role: " + (myRole || "?") + ". Live in-game sync is the next engine step.", true);
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
      players = players.filter(function (p) { return p.id !== conn.peer; });
      renderPlayers();
    });
  }
  function initHost() {
    loadPeerJS(function () {
      if (!window.Peer) { setStatus("PeerJS unavailable — lobby preview only."); return; }
      try {
        peer = new Peer(peerIdFor(roomCode));
        peer.on("open", function () {
          peerReady = true;
          setStatus("Room live — share the code. Waiting for players.");
        });
        peer.on("connection", function (conn) {
          conns.push(conn); wireConn(conn);
          setStatus("Player connected — " + (1 + players.length + 1) + " in lobby.");
        });
        peer.on("error", function (err) {
          if (err && err.type === "unavailable-id") {
            roomCode = makeCode(); renderLobby(); initHost();
          } else {
            setStatus("PeerJS error — lobby preview only. Code still works locally.");
          }
        });
      } catch (e) { setStatus("PeerJS unavailable — lobby preview only."); }
    });
  }
  function initGuest(code) {
    loadPeerJS(function () {
      if (!window.Peer) { setStatus("PeerJS unavailable — lobby preview only."); return; }
      try {
        peer = new Peer();
        peer.on("open", function () {
          peerReady = true;
          setStatus("Connecting to host…");
          try {
            hostConn = peer.connect(peerIdFor(code), { reliable: true });
            wireConn(hostConn);
            hostConn.on("open", function () { setStatus("Connected — waiting for host to start."); });
          } catch (e) { setStatus("Could not connect — check the code and try again."); }
        });
        peer.on("error", function () {
          setStatus("Could not connect — check the code and try again.");
        });
      } catch (e) { setStatus("Could not connect — check the code and try again."); }
    });
  }

  /* ---- Roles ----
     Returns one role per player in lobby order: index 0 = host, then
     players[] in connection order. START is never gated on lobby size
     or team balance — only on both roles being present (see Start). */
  function rollRolesForAll() {
    round += 1;
    var total = 1 + players.length, roles = [], i, hasH, hasP, tries;
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
      var v = inp.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (v.length < 4) { toast("Enter a room code first."); return; }
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
      var total = 1 + players.length;
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
      broadcast({ type: "start", mode: mode, round: round, roles: roles, rolesByPeer: byPeer, rolesList: all });
      broadcast({ type: "roles", round: round, roles: roles, rolesByPeer: byPeer, rolesList: all });
      setStatus("Round " + round + " started — " + hunters + " hunters, " + props + " props. You are " + all[0].toUpperCase() + ". Full lobby not required.");
      toast("Your role: " + all[0] + " — " + hunters + " hunters, " + props + " props. Live in-game sync is the next engine step — this branch syncs lobby + roles, it does not yet replace the AI match.", true);
    });
    b = el("poBtnLeave"); if (b) b.addEventListener("click", function () { disconnect(); showHome(); });
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
        if (q.get("po-view") === "lobby") { isHost = true; roomCode = "PH-DEMO"; renderLobby(); }
        openMenu();
        if (q.get("po-view") === "lobby") renderLobby();
        if (q.get("po-autocreate") === "1") {
          var cb = el("poBtnCreate"); if (cb) cb.click();
        }
        if (q.get("po-autojoin") === "1") {
          var inp = el("poJoinCode"); if (inp) inp.value = "PH-TEST";
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
      setMode: setMode, rollRoles: rollRoles, rollRolesForAll: rollRolesForAll, makeCode: makeCode,
      getState: function () { return { mode: mode, roomCode: roomCode, isHost: isHost, round: round, lastRole: lastRole, players: players.length + 1 }; }
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else { bind(); }
})();
