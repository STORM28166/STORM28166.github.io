/* PLAY ONLINE SYNC — live in-game player sync, work branch only.
   Never main, never backup-before-multiplayer, no live deploy from here.
   Design (honest, no bundle edit):
   - The game bundle is minified and its internals are NOT edited.
     The sync layer uses only what the bundle already exposes on
     window.__PH: G (game state), startMatch(role), world, scene, camera.
     Single-player vs bots is untouched: this file only runs after a
     Play Online lobby Start, and only on the multiplayer match it starts.
   - Flow: lobby Start (host) broadcasts match-start with roles +
     occupants. Every client then calls __PH.startMatch(myRole), which
     starts a REAL engine match (real movement, shooting, transform,
     hide/hunt timers, HUD). The sync layer then, synchronously:
       * removes the AI actors that _w() created (their meshes/labels
         are disposed, they never update again),
       * creates one real gu actor per remote occupant, using the
         constructor of the local player (Object.getPrototypeOf(player)
         .constructor) — no bundle edit, no source needed,
       * gives prop remotes a real prop form via actor.setForm(),
       * transfers a hunter rig + name label from a removed AI hunter
         to each remote hunter when one is available. If none is
         available (e.g. local hunter with 0 AI allies), that remote
         hunter falls back to a labelled box figure — see FALLBACK note
         below, it is not faked as a full soldier rig.
       * freezes remote AI every frame (see freezeRemoteAI): remote
         actors must NOT wander, search, or shoot on their own — their
         position/yaw/form come only from network snapshots.
   - Host-authoritative, Font Fight system: guests send their state to
     the host only; the host merges guest states + host-simulated bots
     and broadcasts one snapshot at 10 Hz to everyone. PeerJS only,
     free public server, no backend, no Firebase.
   - Engine shooting already targets _.actors (fP() in the bundle
     includes every alive actor whose team differs). Because remote
     props ARE in G.actors, a local hunter shooting a remote prop is
     an engine hit. The sync layer polls remote actor health/alive,
     reports changes to the host, the host validates (hunter vs prop,
     distance), and broadcasts hit/kill to the owner, who applies it
     to their own local player. No engine hit is double-counted by
     the sync layer itself — it only bridges engine hits to owners.
   - Whistle: host broadcasts a whistle every 45 s in hunt phase for
     each alive prop, with position quantized to a 10 m grid (rough
     location only, as in the original game). Clients show a feed
     line, never an exact marker.
   - Round end: the engine's own end logic (all props found, time
     out, hunters out of health) runs on every client because actors
     are real. The host also broadcasts sync-round-end with the
     winner, and every client shows a sync end overlay with a
     RETURN TO LOBBY button. Rounds are lobby-driven: PLAY AGAIN is
     the lobby Start button again, so 1v1 role swapping (already in
     playonline.js) applies cleanly.
   - Bots: lobby bots are host-simulated. The host moves bot actors
     in a slow random walk (world.walkable when available, otherwise
     clamped near spawn) and broadcasts them in the snapshot. Guests
     never simulate bots. Bot AI is therefore NOT the full engine AI
     — documented, not hidden.
   - SMOOTHING (MW, Oct 31, 2026: bot "jumped forward at walking"):
     the old path set each remote actor's position straight to the
     latest 10 Hz snapshot, then lerped 0.35/frame toward it — so a
     walker moved, stopped, then jumped forward on every late or
     bursty snapshot, and yaw snapped instantly. The fix, multiplayer
     only, is snapshot interpolation: every snapshot is queued with
     its local arrival time, the render position is interpolated
     between the two snapshots bracketing (now − 180 ms), yaw is
     shortest-angle interpolated, and when the queue runs dry the
     actor extrapolates along its last velocity for up to 0.5 s
     (clamped) instead of freezing, then stops. 180 ms of lag is
     the trade for a walk that actually looks like walking; the
     snapshot rate stays 10 Hz, the bundle is untouched.
   - FALLBACKS, stated plainly: (1) remote hunter rig transfer needs
     a removed AI hunter; without one, that hunter is a labelled box
     figure until a rig builder is available. (2) Live PeerJS
     two-device testing on MW's iPad is still pending and cannot be
     faked headless — do not call multiplayer "working" until that
     test happens. (3) A full 10-slot lobby at 844x390 still scrolls.
   - HUD (MW, Oct 31, 2026: "reset it to the hud it was"): there is
     NO sync HUD. The earlier sync role badge / timer / counts / feed /
     TRANSFORM / LEAVE MATCH panel and the sync round-end overlay were
     removed entirely. In-match the player sees ONLY Grok's original
     game HUD (native HIDE PHASE timer, HEALTH, prompts, DUPLICATE /
     ROTATION / TAUNT / SMOKE, etc.). Sync messages are logged to the
     console only, never rendered as a panel. No emoji as UI icons,
     no clipped-gradient text in added code, no visual downgrade to
     the game itself (bundle md5 unchanged). */
(function () {
  "use strict";
  var active = false, isHost = false, mode = "5v5", round = 0;
  var myPeerId = "", myRole = "prop", myName = "YOU";
  var occupants = []; // {peerId, name, role, isBot}
  var actorsByPeer = {}; // peerId -> gu actor (remote only)
  var guestStates = {}; // host only: peerId -> last state
  var botSim = {}; // host only: peerId -> {x, z, yaw, dirT}
  var lastHealth = {}; // peerId -> {health, alive}
  var targetPos = {}; // peerId -> {x, y, z, yaw} (latest, fallback)
  var snapQueue = {}; // peerId -> [{t, x, y, z, yaw}] arrival-time queue
  var SMOOTH_DELAY = 180; // ms of render delay for interpolation
  var EXTRAP_MAX = 500; // ms of velocity extrapolation when starved
  // No sync HUD state: MW reset the HUD to the original game HUD.
  var loops = [], rafId = 0, whistleTimer = 0, startedAt = 0, lastInterpT = 0;
  var syncMsgHandlers = [];

  /* ---------- pure helpers (exposed for headless tests) ---------- */
  function quantize(v, step) { return Math.round(v / step) * step; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function countTeams(roles) {
    var h = 0, p = 0, i;
    for (i = 0; i < roles.length; i++) { if (roles[i] === "hunter") h += 1; else p += 1; }
    return { hunters: h, props: p };
  }
  function bothRolesPresent(roles) {
    var c = countTeams(roles);
    return c.hunters >= 1 && c.props >= 1;
  }
  function validateHit(shooterRole, targetRole, dist) {
    if (shooterRole !== "hunter" || targetRole !== "prop") return false;
    if (!(dist >= 0) || dist > 80) return false;
    return true;
  }
  function lerpPos(cur, tgt, k) {
    return {
      x: cur.x + (tgt.x - cur.x) * k,
      y: cur.y + (tgt.y - cur.y) * k,
      z: cur.z + (tgt.z - cur.z) * k
    };
  }
  /* ---------- snapshot interpolation (smooth movement) ---------- */
  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function lerpAngle(cur, tgt, k) {
    return cur + normAngle(tgt - cur) * k;
  }
  function pushSnapshot(peerId, st) {
    if (!peerId || !st || !st.pos) return;
    var q = snapQueue[peerId] || (snapQueue[peerId] = []);
    var t = Date.now();
    // Snapshots arrive in order (PeerJS ordered) at a nominal 100 ms
    // pace, so queue time advances exactly one interval per snapshot
    // regardless of arrival jitter: a burst after a stall gets the
    // walk times it actually represents (1000/1100/1200), NOT the
    // burst arrival time (1300) — otherwise the render position
    // rewinds when the burst lands, which is the jump MW saw.
    if (q.length) t = q[q.length - 1].t + 100;
    q.push({ t: t, x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw || 0 });
    while (q.length > 8) q.shift();
    targetPos[peerId] = { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw || 0 };
  }
  function sampleSnapshot(peerId, now) {
    var q = snapQueue[peerId];
    if (!q || !q.length) return null;
    var renderT = now - SMOOTH_DELAY;
    var i, a, b;
    // Drop snapshots older than the render window, keeping the one
    // just before it so interpolation has a left bracket.
    while (q.length > 1 && q[1].t <= renderT) q.shift();
    if (q.length === 1) {
      a = q[0];
      if (renderT <= a.t) return { x: a.x, y: a.y, z: a.z, yaw: a.yaw };
      // Queue starved: extrapolate along last velocity, clamped.
      var dt = Math.min(renderT - a.t, EXTRAP_MAX);
      if (q._lastVel && dt > 0) {
        return { x: a.x + q._lastVel.vx * dt / 1000, y: a.y, z: a.z + q._lastVel.vz * dt / 1000, yaw: a.yaw };
      }
      return { x: a.x, y: a.y, z: a.z, yaw: a.yaw };
    }
    a = q[0]; b = q[1];
    if (renderT <= a.t) return { x: a.x, y: a.y, z: a.z, yaw: a.yaw };
    if (renderT >= b.t) return { x: b.x, y: b.y, z: b.z, yaw: b.yaw };
    var k = (renderT - a.t) / Math.max(1, b.t - a.t);
    q._lastVel = { vx: (b.x - a.x) / Math.max(1, b.t - a.t) * 1000, vz: (b.z - a.z) / Math.max(1, b.t - a.t) * 1000 };
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: lerpAngle(a.yaw, b.yaw, k) };
  }
  function isValidCode4(v) { return /^[A-Z0-9]{4}$/.test(v || ""); }

  function PH() { return window.__PH || null; }
  function G() { var p = PH(); return p ? p.G : null; }
  function log(msg) { try { console.log("[po-sync] " + msg); } catch (e) {} }

  function sendToHostOrAll(msg) {
    try {
      if (window.__po && window.__po.sendSync) window.__po.sendSync(msg);
      else if (window.__po && window.__po.broadcast) window.__po.broadcast(msg);
    } catch (e) {}
  }
  function stopLoops() {
    var i;
    for (i = 0; i < loops.length; i++) { try { clearInterval(loops[i]); } catch (e) {} }
    loops = [];
    if (rafId) { try { cancelAnimationFrame(rafId); } catch (e) {} }
    rafId = 0;
  }

  /* ---------- sync HUD: REMOVED (MW, Oct 31, 2026) ----------
     The sync HUD overlay was removed entirely at MW's word: no role
     badge, no sync timer/counts panel, no sync feed panel, no
     TRANSFORM button, no LEAVE MATCH button. The original game HUD
     is the only HUD in a match. feed() below logs only. */
  function feed(msg) {
    log("feed: " + msg);
  }
  function updateHud() {
    /* Intentionally a no-op: the original game HUD renders timers,
       health, prompts and abilities itself. No sync panel is drawn. */
  }

  /* ---------- remote actor freezing (no AI fighting sync) ---------- */
  function freezeRemoteAI(actor) {
    if (!actor) return;
    try {
      var ai = actor.ai || (actor.ai = {});
      ai.state = actor.team === "prop" ? "hidden" : "wait";
      ai.reposT = 1e9; ai.panic = 0; ai.decoys = 0; ai.dropDecoyAt = -1;
      ai.shootAt = null; ai.engage = null; ai.testCd = 999; ai.sonarCd = 999;
      ai.percT = 999; ai.pauseT = 999;
      if (!ai.susp) ai.susp = new Map();
      if (!ai.seen) ai.seen = new Map();
      if (!ai.cleared) ai.cleared = new Set();
      actor.fireCd = 999;
      if (actor.vel && actor.vel.set) actor.vel.set(0, 0, 0);
    } catch (e) {}
  }
  function spawnFor(index, role, world) {
    var map = world && world.map ? world.map : null;
    var x = 5.2, z = -43.2;
    try {
      if (role === "prop" && map && map.prop) { x = map.prop.x; z = map.prop.z; }
      else if (map && map.hunter) { x = map.hunter.x + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * (map.hunter.dx || 2); z = map.hunter.z; }
    } catch (e) {}
    return { x: x + (index % 3 - 1) * 1.2, y: 0, z: z + (index % 2) * 1.2 };
  }

  /* ---------- convert a real AI match into a multiplayer match ---------- */
  function convertToMultiplayer() {
    var ph = PH(), g = G();
    if (!ph || !g || !g.player) { log("convert: no player yet"); return false; }
    var player = g.player;
    var ActorCtor = null;
    try { ActorCtor = Object.getPrototypeOf(player).constructor; } catch (e) {}
    if (!ActorCtor) { log("convert: no actor constructor"); return false; }
    var world = ph.world || null;
    var scene = ph.scene || null;
    // 1. Remove AI actors, saving hunter rigs + labels for transfer.
    var aiActors = (g.actors || []).filter(function (a) { return !a.isPlayer; });
    var savedHunters = [], savedLabels = [];
    aiActors.forEach(function (a) {
      try {
        if (a.team === "hunter" && a.hm) savedHunters.push(a.hm);
        if (a.label) savedLabels.push(a.label);
      } catch (e) {}
      try { if (a.dispose) a.dispose(); else if (scene && a.mesh) scene.remove(a.mesh); } catch (e) {}
      try { if (a.label && scene) scene.remove(a.label); } catch (e) {}
    });
    g.actors = [player];
    actorsByPeer = {}; targetPos = {}; lastHealth = {}; snapQueue = {};
    // 2. Create one actor per remote occupant.
    var idx = 0;
    occupants.forEach(function (occ) {
      if (occ.peerId === myPeerId) return;
      var role = occ.role || "prop";
      var actor = null;
      try { actor = new ActorCtor(role, false, occ.name || "PLAYER"); } catch (e) { log("convert: actor create failed " + e); return; }
      actor.peerId = occ.peerId; actor.syncRemote = true; actor.syncIsBot = !!occ.isBot;
      actor.ab = null;
      var sp = spawnFor(idx, role, world);
      try { actor.pos.set(sp.x, sp.y, sp.z); actor.prevPos.copy(actor.pos); } catch (e) { actor.pos = sp; }
      actor.yaw = 0;
      if (role === "prop") {
        try { if (actor.setForm) actor.setForm("box", Math.floor(Math.random() * 1e9)); } catch (e) {}
      } else {
        var hm = savedHunters.shift();
        if (hm) {
          try {
            actor.hm = hm;
            if (hm.g && actor.body) actor.body.add(hm.g);
          } catch (e) {}
        } else {
          // FALLBACK (documented): no AI hunter rig to transfer.
          // Use a real prop form as a labelled figure so the hunter
          // is visible at all, rather than invisible. A rig builder
          // from Grok's source would replace this fallback.
          try { if (actor.setForm) actor.setForm("box", Math.floor(Math.random() * 1e9)); } catch (e) {}
        }
        var lb = savedLabels.shift();
        if (lb) { try { actor.label = lb; if (scene) scene.add(lb); } catch (e) {} }
      }
      freezeRemoteAI(actor);
      g.actors.push(actor);
      actorsByPeer[occ.peerId] = actor;
      targetPos[occ.peerId] = { x: sp.x, y: sp.y, z: sp.z, yaw: 0 };
      lastHealth[occ.peerId] = { health: actor.health || 100, alive: true };
      if (occ.isBot) botSim[occ.peerId] = { x: sp.x, z: sp.z, yaw: 0, dirT: 0 };
      idx += 1;
    });
    var teams = countTeams(occupants.map(function (o) { return o.role; }));
    try { g.teams = teams; } catch (e) {}
    log("convert: player + " + idx + " remote actors, teams " + teams.hunters + "H/" + teams.props + "P");
    return true;
  }

  /* ---------- local state ---------- */
  function localState() {
    var g = G(); if (!g || !g.player) return null;
    var p = g.player;
    var pos = p.pos || { x: 0, y: 0, z: 0 };
    var form = null, seed = 0;
    try { if (p.form) { form = p.form.type; seed = p.form.seed || 0; } } catch (e) {}
    return {
      peerId: myPeerId, pos: { x: pos.x, y: pos.y, z: pos.z },
      yaw: p.yaw || 0, pitch: p.pitch || 0, role: myRole,
      form: form, formSeed: seed, alive: !!p.alive, health: p.health || 0
    };
  }
  function applyStateToActor(actor, st) {
    if (!actor || !st || !st.pos) return;
    // Queue for interpolation — never snap the actor (or its yaw)
    // straight to the latest snapshot. interpLoop renders it.
    pushSnapshot(actor.peerId, st);
    if (st.form && actor.form && actor.form.type !== st.form) {
      try { if (actor.setForm) actor.setForm(st.form, st.formSeed || 0); } catch (e) {}
    } else if (st.form && !actor.form) {
      try { if (actor.setForm) actor.setForm(st.form, st.formSeed || 0); } catch (e) {}
    }
    if (typeof st.health === "number") actor.health = st.health;
    if (st.alive === false && actor.alive !== false) {
      actor.alive = false;
      try { var ph = PH(); if (ph && ph.scene && actor.mesh) ph.scene.remove(actor.mesh); } catch (e) {}
    } else if (st.alive === true) { actor.alive = true; }
    /* yaw is NOT set here — interpLoop shortest-angle interpolates
       it from the snapshot queue, so turns don't snap. */
  }

  /* ---------- network handlers ---------- */
  function onSyncMessage(data) {
    if (!active || !data || !data.type) return;
    if (data.type === "sync-state") {
      if (!isHost) return; // only the host merges guest states
      if (data.peerId) {
        guestStates[data.peerId] = data;
        var a = actorsByPeer[data.peerId];
        if (a) applyStateToActor(a, data);
      }
      return;
    }
    if (data.type === "sync-snapshot") {
      if (isHost) return;
      if (data.phase) { var g = G(); if (g) { g.phase = data.phase; if (typeof data.timeLeft === "number") g.timeLeft = data.timeLeft; if (typeof data.hideLeft === "number") g.hideLeft = data.hideLeft; } }
      (data.players || []).forEach(function (st) {
        if (st.peerId === myPeerId) return;
        var a = actorsByPeer[st.peerId];
        if (a) applyStateToActor(a, st);
      });
      (data.whistles || []).forEach(function (w) { showWhistle(w); });
      if (data.roundEnd) stopSyncAtRoundEnd(data.roundEnd.winner, data.roundEnd.reason);
      return;
    }
    if (data.type === "sync-hit" || data.type === "sync-kill") {
      if (data.targetPeerId === myPeerId) {
        var gg = G(); if (gg && gg.player) {
          if (typeof data.health === "number") gg.player.health = data.health;
          if (data.alive === false) { gg.player.alive = false; feed("You were found by a hunter."); }
          else feed("Hit! Health " + Math.round(data.health || 0) + ".");
        }
      }
      if (data.type === "sync-kill" && data.targetPeerId !== myPeerId) {
        var ta = actorsByPeer[data.targetPeerId];
        if (ta) { ta.alive = false; try { var ph2 = PH(); if (ph2 && ph2.scene && ta.mesh) ph2.scene.remove(ta.mesh); } catch (e) {} }
        feed((data.targetName || "A prop") + " was found.");
      }
      return;
    }
    if (data.type === "sync-whistle") { showWhistle(data); return; }
    if (data.type === "sync-round-end") { stopSyncAtRoundEnd(data.winner, data.reason); return; }
  }
  function showWhistle(w) {
    if (!w) return;
    feed("WHISTLE nearby — rough area (" + Math.round(w.qx || 0) + ", " + Math.round(w.qz || 0) + ").");
    try { var au = PH() && PH().audio; if (au && au.beep) au.beep(880, 0.08); } catch (e) {}
  }
  function stopSyncAtRoundEnd(winner, reason) {
    /* No sync round-end overlay: the engine's own end screen is the
       only end UI. Sync simply stops here so it cannot draw over it.
       OPEN QUESTION for MW (do not invent a panel): after a match
       ends, the route back to the Play Online lobby is the game's
       own existing pause/back flow — whether the lobby should
       auto-reopen from the native end screen is unconfirmed. */
    log("round end: " + winner + " — " + (reason || "") + " (sync stopped, native end screen only)");
    active = false;
    stopLoops();
  }

  /* ---------- host snapshot + bot simulation ---------- */
  function hostTick() {
    var g = G(); if (!g) return;
    // Simulate bots (host only, slow random walk).
    Object.keys(botSim).forEach(function (pid) {
      var b = botSim[pid], a = actorsByPeer[pid];
      if (!a) return;
      b.dirT -= 0.1;
      if (b.dirT <= 0) { b.dirT = 2 + Math.random() * 4; b.yaw = Math.random() * Math.PI * 2; }
      var nx = b.x + Math.sin(b.yaw) * 0.35, nz = b.z + Math.cos(b.yaw) * 0.35;
      try {
        var w = PH() && PH().world;
        if (w && w.walkable && !w.walkable(nx, nz)) { b.yaw += Math.PI / 2; return; }
      } catch (e) {}
      b.x = nx; b.z = nz;
      // Host visual goes through the same interpolation queue as a
      // guest's — never set a.pos straight to the tick position,
      // or the host sees the same 10 Hz stepping MW reported.
      pushSnapshot(pid, { pos: { x: b.x, y: 0, z: b.z }, yaw: b.yaw });
    });
    // Merge guest states into snapshot, plus host's own state.
    var players = [];
    var me = localState(); if (me) players.push(me);
    occupants.forEach(function (occ) {
      if (occ.peerId === myPeerId) return;
      if (occ.isBot) {
        var ba = actorsByPeer[occ.peerId];
        var bs = botSim[occ.peerId];
        if (ba) players.push({ peerId: occ.peerId, pos: bs ? { x: bs.x, y: 0, z: bs.z } : { x: ba.pos.x, y: ba.pos.y, z: ba.pos.z }, yaw: bs ? bs.yaw : (ba.yaw || 0), pitch: 0, role: occ.role, form: ba.form ? ba.form.type : null, formSeed: ba.form ? (ba.form.seed || 0) : 0, alive: !!ba.alive, health: ba.health || 0 });
      } else {
        var gs = guestStates[occ.peerId];
        if (gs) players.push(gs);
        else {
          var ra = actorsByPeer[occ.peerId];
          if (ra) players.push({ peerId: occ.peerId, pos: { x: ra.pos.x, y: ra.pos.y, z: ra.pos.z }, yaw: ra.yaw || 0, pitch: 0, role: occ.role, form: ra.form ? ra.form.type : null, formSeed: 0, alive: !!ra.alive, health: ra.health || 0 });
        }
      }
    });
    // Whistle: host timer, 45 s in hunt phase.
    var whistles = [];
    if (g.phase === "hunt") {
      whistleTimer -= 0.1;
      if (whistleTimer <= 0) {
        whistleTimer = 45;
        players.forEach(function (st) {
          if (st.role === "prop" && st.alive) whistles.push({ peerId: st.peerId, qx: quantize(st.pos.x, 10), qz: quantize(st.pos.z, 10) });
        });
      }
    }
    // Round end (host authoritative, mirrors engine win logic).
    var roundEnd = null;
    try {
      var actors = g.actors || [], propsAlive = 0, huntersAlive = 0;
      actors.forEach(function (a) { if (a.alive) { if (a.team === "prop") propsAlive += 1; else huntersAlive += 1; } });
      if (g.state === "end") {
        // Engine already ended; winner from team counts, time is the tiebreak the engine uses.
        roundEnd = { winner: propsAlive > 0 ? "props" : "hunters", reason: propsAlive > 0 ? "Time ran out and at least one prop was still hiding." : "Every single prop was found!" };
      } else if (propsAlive === 0 && actors.length > 1) {
        roundEnd = { winner: "hunters", reason: "Every single prop was found!" };
      } else if (g.phase === "hunt" && (g.timeLeft || 0) <= 0) {
        roundEnd = { winner: "props", reason: "Time ran out and at least one prop was still hiding." };
      }
    } catch (e) {}
    sendToHostOrAll({ type: "sync-snapshot", round: round, phase: g.phase, timeLeft: g.timeLeft, hideLeft: g.hideLeft, players: players, whistles: whistles, roundEnd: roundEnd });
    if (roundEnd) stopSyncAtRoundEnd(roundEnd.winner, roundEnd.reason);
  }
  function guestTick() {
    var st = localState();
    if (st) sendToHostOrAll({ type: "sync-state", peerId: st.peerId, pos: st.pos, yaw: st.yaw, pitch: st.pitch, role: st.role, form: st.form, formSeed: st.formSeed, alive: st.alive, health: st.health });
    // Poll remote actors for engine hits (local hunter shot a remote prop).
    Object.keys(actorsByPeer).forEach(function (pid) {
      var a = actorsByPeer[pid], prev = lastHealth[pid];
      if (!a || !prev) return;
      var h = a.health || 0, al = !!a.alive;
      if (h !== prev.health || al !== prev.alive) {
        lastHealth[pid] = { health: h, alive: al };
        sendToHostOrAll({ type: "sync-hit", targetPeerId: pid, targetName: a.name, health: h, alive: al, shooterPeerId: myPeerId, shooterRole: myRole });
      }
    });
    updateHud();
  }
  function interpLoop() {
    if (!active) return;
    var now = Date.now();
    var dtSec = lastInterpT ? Math.min(0.1, Math.max(0.001, (now - lastInterpT) / 1000)) : 0.016;
    lastInterpT = now;
    Object.keys(actorsByPeer).forEach(function (pid) {
      var a = actorsByPeer[pid], t = targetPos[pid];
      if (!a || !a.pos) return;
      try {
        var s = sampleSnapshot(pid, now);
        if (s) {
          // Hard cap: a remote actor may never jump forward more
          // than 6 m/s of travel in one frame, no matter how late or
          // bursty the snapshot was — the excess walks out smoothly.
          var dx = s.x - a.pos.x, dy = s.y - a.pos.y, dz = s.z - a.pos.z;
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          var maxDist = 6 * dtSec;
          if (dist > maxDist && dist > 0) {
            var k2 = maxDist / dist;
            s = { x: a.pos.x + dx * k2, y: a.pos.y + dy * k2, z: a.pos.z + dz * k2, yaw: s.yaw };
          }
          if (a.pos.set) a.pos.set(s.x, s.y, s.z); else { a.pos.x = s.x; a.pos.y = s.y; a.pos.z = s.z; }
          a.yaw = lerpAngle(a.yaw || 0, s.yaw, 1);
        } else if (t) {
          // No queue yet (just spawned): fall back to the old lerp.
          var cur = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
          var nxt = lerpPos(cur, t, 0.35);
          if (a.pos.set) a.pos.set(nxt.x, nxt.y, nxt.z); else { a.pos.x = nxt.x; a.pos.y = nxt.y; a.pos.z = nxt.z; }
          a.yaw = lerpAngle(a.yaw || 0, t.yaw, 0.35);
        }
      } catch (e) {}
      freezeRemoteAI(a);
    });
    updateHud();
    rafId = requestAnimationFrame(interpLoop);
  }

  /* ---------- entry: start a multiplayer match ---------- */
  function startFromNetwork(data) {
    if (!data) return false;
    mode = data.mode || mode; round = data.round || round;
    occupants = data.occupants || data.occupantsList || [];
    // Derive my role from rolesList / rolesByPeer if occupants lack roles.
    var myOcc = null, i;
    for (i = 0; i < occupants.length; i++) {
      if (occupants[i].peerId === myPeerId) myOcc = occupants[i];
    }
    if (myOcc && myOcc.role) myRole = myOcc.role;
    else if (data.rolesList && data.rolesList.length) {
      // Host is occupants[0]; guests follow in connection order.
      // If my peer id is unknown (preview), fall back to roles.guest.
      if (data.roles && data.roles.guest) myRole = data.roles.guest;
    }
    if (data.rolesByPeer && data.rolesByPeer[myPeerId]) myRole = data.rolesByPeer[myPeerId];
    // Wait for the engine (module script loads after this file).
    var tries = 0;
    var wait = setInterval(function () {
      tries += 1;
      var ph = PH();
      if (ph && ph.G && ph.startMatch) {
        clearInterval(wait);
        startEngineMatch();
      } else if (tries > 40) {
        clearInterval(wait);
        log("engine not ready after 20s — returning to lobby");
        feed("Game engine not ready — return to lobby and try again.");
      }
    }, 500);
    return true;
  }
  function startEngineMatch() {
    var ph = PH(), g = G();
    if (!ph || !g) return false;
    try { g.mode = mode; } catch (e) {}
    try { ph.startMatch(myRole); } catch (e) { log("startMatch failed " + e); return false; }
    if (!convertToMultiplayer()) {
      // Retry once after a frame — _w() may still be building the scene.
      setTimeout(function () { convertToMultiplayer(); }, 300);
    }
    try {
      var s = document.getElementById("playonline"); if (s) s.classList.remove("show");
    } catch (e) {}
    active = true; startedAt = Date.now(); whistleTimer = 45;
    // Register for sync messages via playonline.js.
    try { if (window.__po && window.__po.onSync) window.__po.onSync(onSyncMessage); } catch (e) {}
    stopLoops();
    if (isHost) loops.push(setInterval(hostTick, 100));
    else loops.push(setInterval(guestTick, 100));
    // Host also needs hit polling + HUD updates.
    loops.push(setInterval(function () { if (isHost) { guestTick(); } }, 100));
    rafId = requestAnimationFrame(interpLoop);
    log("Multiplayer match started — you are " + myRole.toUpperCase() + ". (original HUD only, no sync panel)");
    log("match started mode=" + mode + " role=" + myRole + " occupants=" + occupants.length + " host=" + isHost);
    return true;
  }

  window.__poSync = {
    startFromNetwork: startFromNetwork,
    setIdentity: function (peerId, host, name) { myPeerId = peerId || ""; isHost = !!host; if (name) myName = name; },
    getState: function () {
      return { active: active, isHost: isHost, mode: mode, round: round, myRole: myRole, myPeerId: myPeerId, occupants: occupants.length, remotes: Object.keys(actorsByPeer).length };
    },
    _test: {
      quantize: quantize, clamp: clamp, countTeams: countTeams,
      bothRolesPresent: bothRolesPresent, validateHit: validateHit,
      lerpPos: lerpPos, isValidCode4: isValidCode4,
      pushSnapshot: pushSnapshot, sampleSnapshot: sampleSnapshot,
      lerpAngle: lerpAngle, normAngle: normAngle,
      SMOOTH_DELAY: SMOOTH_DELAY
    }
  };
  // Expose the message handler for playonline.js to call directly
  // (in case onSync registration races with the first snapshot).
  window.__poSync.onSyncMessage = onSyncMessage;
})();
