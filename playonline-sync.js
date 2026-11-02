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
  var TICK_MS = 50; // network tick (was 100): 20 Hz snapshots, ~half the lag
  var SMOOTH_DELAY = 120; // ms of render delay for interpolation (was 180)
  var EXTRAP_MAX = 500; // ms of velocity extrapolation when starved
  var lastTaunts = -1; // G.stats.taunts, for local taunt detection (sync-taunt)
  var lastStepOver = 0, stallFrames = 0, stallLoggedAt = 0, lastLocalPos = null;
  var stepOverHold = null; // {collider, until} — keeps a slow walker lifted over a low object
  var leftPeers = {}; // peerIds removed mid-match (guest disconnect) — hostTick skips them
  // No sync HUD state: MW reset the HUD to the original game HUD.
  var loops = [], rafId = 0, whistleTimer = 0, startedAt = 0, lastInterpT = 0, lastAmmo = 24;
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
    // Snapshots arrive in order (PeerJS ordered) at a nominal 50 ms
    // pace, so queue time advances exactly one interval per snapshot
    // regardless of arrival jitter: a burst after a stall gets the
    // walk times it actually represents (1000/1100/1200), NOT the
    // burst arrival time (1300) — otherwise the render position
    // rewinds when the burst lands, which is the jump MW saw.
    if (q.length) t = q[q.length - 1].t + TICK_MS;
    q.push({ t: t, x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw || 0, pitch: st.pitch || 0 });
    while (q.length > 8) q.shift();
    targetPos[peerId] = { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw || 0, pitch: st.pitch || 0 };
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
      if (renderT <= a.t) return { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch || 0 };
      // Queue starved: extrapolate along last velocity, clamped.
      var dt = Math.min(renderT - a.t, EXTRAP_MAX);
      if (q._lastVel && dt > 0) {
        return { x: a.x + q._lastVel.vx * dt / 1000, y: a.y, z: a.z + q._lastVel.vz * dt / 1000, yaw: a.yaw, pitch: a.pitch || 0 };
      }
      return { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch || 0 };
    }
    a = q[0]; b = q[1];
    if (renderT <= a.t) return { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch || 0 };
    if (renderT >= b.t) return { x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch || 0 };
    var k = (renderT - a.t) / Math.max(1, b.t - a.t);
    q._lastVel = { vx: (b.x - a.x) / Math.max(1, b.t - a.t) * 1000, vz: (b.z - a.z) / Math.max(1, b.t - a.t) * 1000 };
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: lerpAngle(a.yaw, b.yaw, k), pitch: (a.pitch || 0) + ((b.pitch || 0) - (a.pitch || 0)) * k };
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

  /* ---------- remote actor freezing (no AI fighting sync) ----------
     Nov 1, 01:05 CDT two-device report: prop on the rug on the iPad
     showed up behind the bed on the iPhone, and the hunter was not
     visible on the prop's screen. The old freeze was not enough for
     hunters: it set ai.state="wait", but the engine's hunter update
     converts "wait" straight back to "wander" and then walks the
     actor toward its own AI goal at 3.8 m/s — fighting every synced
     position and making the remote hunter wander to places its
     owner never went (and out of the other player's view). Fix:
     give the AI a goal that IS the synced position, with a huge
     pause/search time, so even if the engine runs its AI update
     it walks toward where the player already is (i.e. nowhere),
     and keep velocity at zero. Props keep "hidden" (that one
     already stands still). This is sync-only, no bundle edit. */
  function freezeRemoteAI(actor) {
    if (!actor) return;
    try {
      var ai = actor.ai || (actor.ai = {});
      if (actor.team === "prop") {
        ai.state = "hidden";
      } else {
        /* Hunter: do NOT use "wait" — the engine converts it to
           "wander" on the next frame. "wander" with a goal at the
           actor's own position and a huge pause means no movement. */
        ai.state = "wander";
        ai.goal = { x: actor.pos ? actor.pos.x : 0, z: actor.pos ? actor.pos.z : 0 };
        ai.searchC = actor.pos ? { x: actor.pos.x, z: actor.pos.z } : null;
        ai.path = []; ai.pi = 0;
      }
      ai.reposT = 1e9; ai.panic = 0; ai.decoys = 0; ai.dropDecoyAt = -1;
      ai.shootAt = null; ai.engage = null; ai.testCd = 999; ai.sonarCd = 999;
      ai.percT = 999; ai.pauseT = 1e9; ai.searchT = 1e9;
      if (!ai.susp) ai.susp = new Map();
      if (!ai.seen) ai.seen = new Map();
      if (!ai.cleared) ai.cleared = new Set();
      actor.fireCd = 999;
      /* Do NOT zero vel here: interpLoop feeds vel from the actual
         interpolated movement so the engine's walk animation plays.
         Zeroing it every frame is exactly what made remote actors
         slide on their feet with frozen legs. Standing still gives
         vel 0 naturally from interpLoop (new pos = old pos). */
      if (actor.prevPos && actor.pos && actor.prevPos.copy) actor.prevPos.copy(actor.pos);
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
    actorsByPeer = {}; targetPos = {}; lastHealth = {}; snapQueue = {}; leftPeers = {}; stepOverHold = null;
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
        /* Hunter visual: keep the rig the constructor just built
           for this actor — it is already in its body/mesh and in
           the scene, and the engine's render pass updates it from
           actor.pos. The old code overwrote it with a saved rig
           from a disposed AI actor (its mesh was removed from the
           scene by dispose()), which is a likely cause of the
           Nov 1 "hunter just not there" report. Only fall back to
           a saved rig if this actor somehow has none, and only to
           a box if it has neither. */
        if (!actor.hm) {
          var hm = savedHunters.shift();
          if (hm) {
            try {
              actor.hm = hm;
              if (hm.g && actor.body) actor.body.add(hm.g);
            } catch (e) {}
          } else {
            try { if (actor.setForm) actor.setForm("box", Math.floor(Math.random() * 1e9)); } catch (e) {}
          }
        }
        var lb = savedLabels.shift();
        if (lb) { try { actor.label = lb; if (scene) scene.add(lb); } catch (e) {} }
      }
      /* INVISIBLE-WALL FIX (spawn-stuck remotes): until this actor's
         FIRST real snapshot arrives, it sits at its spawn point. The
         engine's actor-actor separation (Ba) pushes the local player
         away from any overlapping actor, so a never-yet-synced remote
         acts as an invisible wall at spawn. Shrink its collision
         radius to ~0 until the first snapshot, then restore it in
         applyStateToActor. It can still be seen (mesh untouched) and
         interpLoop still moves it; only its body-block is off. */
      actor._syncRadius = actor.radius || 0.38;
      actor.radius = 0.02;
      actor._syncNoSnapshot = true;
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
    /* VISIBILITY FIXES: (a) a form change is type OR seed — the old
       code only re-setForm on a type change, so a box→different-box
       transform never updated the remote model. (b) a mesh removed
       on a death snapshot was never re-added when the actor came
       back alive (host snapshot overriding a local kill), leaving
       an alive-but-invisible prop forever. Re-add + re-show it. */
    if (st.form && (!actor.form || actor.form.type !== st.form || (actor.form.seed || 0) !== (st.formSeed || 0))) {
      try { if (actor.setForm) actor.setForm(st.form, st.formSeed || 0); } catch (e) {}
    }
    if (actor._syncNoSnapshot) {
      actor._syncNoSnapshot = false;
      if (actor._syncRadius) actor.radius = actor._syncRadius;
    }
    if (typeof st.health === "number") actor.health = st.health;
    if (st.alive === false && actor.alive !== false) {
      actor.alive = false;
      try { var ph = PH(); if (ph && ph.scene && actor.mesh) ph.scene.remove(actor.mesh); } catch (e) {}
      try { if (actor.label) actor.label.visible = false; } catch (e) {}
    } else if (st.alive === true) {
      if (actor.alive === false) {
        actor.alive = true;
        try {
          var ph2 = PH();
          if (ph2 && ph2.scene && actor.mesh) {
            var inScene = false, p = actor.mesh.parent;
            while (p) { if (p === ph2.scene) { inScene = true; break; } p = p.parent; }
            if (!inScene) ph2.scene.add(actor.mesh);
            actor.mesh.visible = true;
          }
        } catch (e) {}
        try { if (actor.label) actor.label.visible = true; } catch (e) {}
      } else { actor.alive = true; }
    }
    /* yaw is NOT set here — interpLoop shortest-angle interpolates
       it from the snapshot queue, so turns don't snap. */
  }

  /* ---------- network handlers ---------- */
  function onSyncMessage(data) {
    if (!active || !data || !data.type) return;
    if (data.type === "sync-state") {
      if (!isHost) return; // only the host merges guest states
      if (data.peerId && leftPeers[data.peerId]) return; // disconnected player stays gone
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
      /* IMMORTAL-PROP FIX (Nov 1, 3-player match): a guest hunter's
         hit used to go guest -> host and DIE there. The host never
         forwarded it to the target guest, and the host's next
         snapshot (built from the target's own, still-healthy state)
         resurrected the prop on the shooter's screen every 100 ms —
         so a prop shot by a guest hunter could never die when a
         third player was host. Now the host (a) validates the hit,
         (b) applies it to its own copy of the target, (c) forwards
         it to every guest, and (d) hostTick overrides the snapshot
         with the authoritative health until the owner confirms.
         Shooter->host and shooter->target-host paths already worked;
         this closes the guest->guest hole, which is the 3-player case. */
      if (isHost && data.targetPeerId !== myPeerId) {
        var shooterA = actorsByPeer[data.shooterPeerId];
        var targetA = actorsByPeer[data.targetPeerId];
        var shooterRole = data.shooterRole || (shooterA ? shooterA.team : null);
        var targetRole = targetA ? targetA.team : "prop";
        var dist = -1;
        try {
          if (shooterA && shooterA.pos && targetA && targetA.pos) {
            var ddx = shooterA.pos.x - targetA.pos.x, ddz = shooterA.pos.z - targetA.pos.z;
            dist = Math.sqrt(ddx * ddx + ddz * ddz);
          }
        } catch (e) {}
        var ok = (dist >= 0) ? validateHit(shooterRole, targetRole, dist)
          : (shooterRole === "hunter" && targetRole === "prop");
        if (!ok) return;
        /* DAMAGE-DELTA FIX (final scan): two hunters on different
           clients both see the prop at 100 HP and both report 66
           after their own hit. Overwriting with the absolute value
           loses the second hit (66, not 32). Apply the reported
           damage as a delta to the host's current health instead,
           and forward that authoritative value — so concurrent
           hits add up instead of overwriting each other. A stale
           absolute value that is HIGHER than the host's copy never
           resurrects health. */
        if (targetA) {
          var curH = (typeof targetA.health === "number") ? targetA.health : 100;
          var newH = curH;
          if (typeof data.damage === "number" && data.damage > 0) newH = Math.max(0, curH - data.damage);
          else if (typeof data.health === "number" && data.health < curH) newH = data.health;
          if (data.alive === false) newH = 0;
          targetA.health = newH;
          data.health = newH;
          if (data.alive === false) {
            targetA.alive = false;
            try { var phH = PH(); if (phH && phH.scene && targetA.mesh) phH.scene.remove(targetA.mesh); } catch (e) {}
          }
        }
        if (guestStates[data.targetPeerId]) {
          if (typeof data.health === "number") guestStates[data.targetPeerId].health = data.health;
          if (data.alive === false) guestStates[data.targetPeerId].alive = false;
        }
        if (data.type === "sync-kill") feed((data.targetName || "A prop") + " was found.");
        sendToHostOrAll(data); // host broadcast -> target guest + shooter guest
        return;
      }
      if (data.targetPeerId === myPeerId) {
        var gg = G(); if (gg && gg.player) {
          if (typeof data.health === "number") gg.player.health = data.health;
          if (data.alive === false) {
            gg.player.alive = false; gg.player.health = 0;
            try { var phM = PH(); if (phM && phM.scene && gg.player.mesh) phM.scene.remove(gg.player.mesh); } catch (e) {}
            try { if (gg.player.label) gg.player.label.visible = false; } catch (e) {}
            feed("You were found by a hunter.");
          } else {
            gg.player.hurtT = 0.25;
            try { var auH = PH() && PH().audio; if (auH && auH.hurt) auH.hurt(); } catch (e) {}
            feed("Hit! Health " + Math.round(data.health || 0) + ".");
          }
        }
      } else if (data.type === "sync-kill") {
        var ta = actorsByPeer[data.targetPeerId];
        if (ta) {
          ta.alive = false; ta.health = 0;
          try { var ph2 = PH(); if (ph2 && ph2.scene && ta.mesh) ph2.scene.remove(ta.mesh); } catch (e) {}
          try { if (ta.label) ta.label.visible = false; } catch (e) {}
        }
        feed((data.targetName || "A prop") + " was found.");
      }
      return;
    }
    if (data.type === "sync-whistle") { showWhistle(data); return; }
    if (data.type === "sync-fire") {
      /* Same guest->guest hole as hits: a guest hunter's fire went
         to the host, the host flashed locally, and no other guest
         ever saw it. The host now forwards it to every guest. The
         shooter guest gets its own event back but has no actor for
         itself, so it is a no-op there — no double flash. */
      var fa = actorsByPeer[data.shooterPeerId];
      if (fa) {
        try {
          if (fa.hm && fa.hm.flash) { fa.hm.flash.visible = true; fa.flashT = 0.05; }
          if (fa.hm && fa.hm.rig) fa.hm.rig.kick = 1;
        } catch (e) {}
      }
      if (isHost && data.shooterPeerId !== myPeerId) sendToHostOrAll(data);
      return;
    }
    if (data.type === "sync-taunt") {
      /* TAUNT FIX: taunts were never a network event at all — the
         engine plays them locally only (Se.taunt on the taunter's
         client), so in multiplayer nobody else heard anything.
         Now the taunter broadcasts pos + variant; the host forwards
         to every guest; receivers play the engine's own taunt sound
         at the taunter's position. The shooter ignores its own
         echoed event (it already played locally). Far taunts are
         clamped to 40 m from the listener for audio only, so a
         taunt across the map is still heard (quiet, directional)
         instead of vanishing under inverse-distance falloff. */
      if (data.shooterPeerId === myPeerId) return;
      if (isHost) sendToHostOrAll(data);
      try {
        var au = PH() && PH().audio;
        var me2 = G() && G().player;
        if (au && au.taunt && data.pos) {
          var tp = { x: data.pos.x, y: data.pos.y || 0, z: data.pos.z };
          if (me2 && me2.pos) {
            var tdx = tp.x - me2.pos.x, tdz = tp.z - me2.pos.z;
            var tdist = Math.sqrt(tdx * tdx + tdz * tdz);
            if (tdist > 40) { tp.x = me2.pos.x + tdx / tdist * 40; tp.z = me2.pos.z + tdz / tdist * 40; }
          }
          au.taunt(tp, data.variant || 0);
        }
      } catch (e) {}
      return;
    }
    if (data.type === "sync-player-left") {
      /* Host is the only originator: guests just remove the actor.
         The host never acts on a guest-sent copy (it already
         removed the actor when the connection closed). */
      if (isHost) return;
      if (data.peerId && data.peerId !== myPeerId) removeRemoteActor(data.peerId);
      return;
    }
    if (data.type === "sync-round-end") { stopSyncAtRoundEnd(data.winner, data.reason); return; }
  }
  function removeRemoteActor(peerId) {
    /* FINAL SCAN FIX: a guest disconnecting mid-match used to leave
       a frozen actor behind forever — it kept blocking, kept
       showing, and the host kept snapshotting its stale position.
       Remove it everywhere: scene, actors list, and all sync maps. */
    try {
      var a = actorsByPeer[peerId];
      var ph = PH(), g = G();
      if (a) {
        try { if (ph && ph.scene && a.mesh) ph.scene.remove(a.mesh); } catch (e) {}
        try { if (a.label && ph && ph.scene) ph.scene.remove(a.label); } catch (e) {}
        try { if (a.label) a.label.visible = false; } catch (e) {}
        if (g && g.actors) g.actors = g.actors.filter(function (x) { return x !== a; });
      }
      delete actorsByPeer[peerId];
      delete guestStates[peerId];
      delete botSim[peerId];
      delete targetPos[peerId];
      delete lastHealth[peerId];
      delete snapQueue[peerId];
      leftPeers[peerId] = true;
      if (occupants) occupants = occupants.filter(function (o) { return o.peerId !== peerId; });
      log("player left mid-match, actor removed: " + peerId);
    } catch (e) {}
  }
  function onPlayerLeft(peerId) {
    /* Called by playonline.js when a connection closes during a
       match. Host only: remove locally, then broadcast so every
       remaining guest removes the same actor. Lobby closes do not
       reach here (active is false there). */
    if (!active || !peerId) return;
    removeRemoteActor(peerId);
    if (isHost) sendToHostOrAll({ type: "sync-player-left", peerId: peerId });
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
      /* FINAL SCAN REGRESSION: hostTick used to run every 100 ms,
         so "0.35 per tick" was 3.5 m/s and "dirT -= 0.1" was 0.1 s.
         At the new 50 ms tick those same constants doubled bot
         speed to 7 m/s and halved direction-change time. Scale by
         the tick so bots walk exactly as before. */
      b.dirT -= TICK_MS / 1000;
      if (b.dirT <= 0) { b.dirT = 2 + Math.random() * 4; b.yaw = Math.random() * Math.PI * 2; }
      var botStep = 0.35 * (TICK_MS / 100);
      var nx = b.x + Math.sin(b.yaw) * botStep, nz = b.z + Math.cos(b.yaw) * botStep;
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
      if (leftPeers[occ.peerId]) return;
      if (occ.isBot) {
        var ba = actorsByPeer[occ.peerId];
        var bs = botSim[occ.peerId];
        if (ba) players.push({ peerId: occ.peerId, pos: bs ? { x: bs.x, y: 0, z: bs.z } : { x: ba.pos.x, y: ba.pos.y, z: ba.pos.z }, yaw: bs ? bs.yaw : (ba.yaw || 0), pitch: 0, role: occ.role, form: ba.form ? ba.form.type : null, formSeed: ba.form ? (ba.form.seed || 0) : 0, alive: !!ba.alive, health: ba.health || 0 });
      } else {
        var gs = guestStates[occ.peerId];
        if (gs) {
          /* Authoritative health: until the target guest confirms a
             forwarded hit with its own state, the host's copy (which
             the forwarded hit already updated) wins — otherwise the
             next snapshot resurrects a just-shot prop for a frame
             (the old immortal-prop flicker). Never resurrect a
             host-confirmed kill via a stale guest state. */
          var ha = actorsByPeer[occ.peerId];
          if (ha) {
            gs = { peerId: gs.peerId, pos: gs.pos, yaw: gs.yaw, pitch: gs.pitch, role: gs.role, form: gs.form, formSeed: gs.formSeed, alive: gs.alive, health: gs.health };
            if (ha.alive === false) { gs.alive = false; gs.health = 0; }
            else if (typeof ha.health === "number" && ha.health < (gs.health || 0)) gs.health = ha.health;
          }
          players.push(gs);
        }
        else {
          var ra = actorsByPeer[occ.peerId];
          if (ra) players.push({ peerId: occ.peerId, pos: { x: ra.pos.x, y: ra.pos.y, z: ra.pos.z }, yaw: ra.yaw || 0, pitch: 0, role: occ.role, form: ra.form ? ra.form.type : null, formSeed: 0, alive: !!ra.alive, health: ra.health || 0 });
        }
      }
    });
    // Whistle: host timer, 45 s in hunt phase.
    var whistles = [];
    if (g.phase === "hunt") {
      /* Same 100 ms -> 50 ms regression as bots: decrement in
         seconds per tick, or whistles fire every ~22 s, not 45 s. */
      whistleTimer -= TICK_MS / 1000;
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
    /* Taunt detection: the engine counts local taunts in
       G.stats.taunts (Fx) and plays them locally only. The moment
       the count rises, broadcast pos + variant immediately — never
       wait for the next tick — so other players hear it in sync
       with the taunt, not a tick late. Host forwards (see handler);
       guests send to host only. */
    try {
      var gg2 = G();
      if (gg2 && gg2.stats && typeof gg2.stats.taunts === "number") {
        if (lastTaunts === -1) lastTaunts = gg2.stats.taunts;
        else if (gg2.stats.taunts > lastTaunts && myRole === "prop" && gg2.player && gg2.player.alive) {
          lastTaunts = gg2.stats.taunts;
          sendToHostOrAll({ type: "sync-taunt", shooterPeerId: myPeerId, pos: { x: gg2.player.pos.x, y: gg2.player.pos.y || 0, z: gg2.player.pos.z }, variant: Math.floor(Math.random() * 4) });
        }
      }
    } catch (e) {}
    /* Fire sync: local ammo is G.ammo (24 full). A drop means the
       local hunter just shot — tell the other side so the remote
       hunter's gun actually flashes/kicks instead of doing nothing. */
    try {
      var gg = G();
      if (gg && typeof gg.ammo === "number") {
        if (myRole === "hunter" && gg.ammo < lastAmmo) sendToHostOrAll({ type: "sync-fire", shooterPeerId: myPeerId });
        lastAmmo = gg.ammo;
      }
    } catch (e) {}
    // Poll remote actors for engine hits (local hunter shot a remote prop).
    Object.keys(actorsByPeer).forEach(function (pid) {
      var a = actorsByPeer[pid], prev = lastHealth[pid];
      if (!a || !prev) return;
      var h = a.health || 0, al = !!a.alive;
      if (h !== prev.health || al !== prev.alive) {
        var dmg = (h < prev.health) ? (prev.health - h) : 0;
        lastHealth[pid] = { health: h, alive: al };
        sendToHostOrAll({ type: "sync-hit", targetPeerId: pid, targetName: a.name, health: h, alive: al, damage: dmg, shooterPeerId: myPeerId, shooterRole: myRole });
      }
    });
    updateHud();
  }
  /* AUTO STEP-OVER (MW clarification, Nov 1: step, NOT jump — no
     jump input, no jump animation, no hop). Small objects like
     pumpkins should be walked over seamlessly. The engine has no
     step-up: its Ba() forces pos.y back to 0 every grounded frame
     and world.move stops dead at any collider, so a low obstacle
     blocks the local player outright in multiplayer exactly as in
     single-player — but this file may only change multiplayer
     behaviour, so the assist lives here and only runs during a
     multiplayer match. How it works: when the local player is
     stalled (moving fast but barely displacing) against a LOW
     collider only (top <= 0.55 m, e.g. a pumpkin, a curb, a crate
     lip), lift pos.y just above that top. The next engine frames
     let gravity settle the player back to 0 while world.move
     ignores that collider (its top is below pos.y + 0.3), so the
     player walks over it in a smooth arc — no vy jump, no jump
     sound, no hop animation. Tall colliders are never stepped
     over. A stall with no low collider is logged (console only)
     so a genuine invisible wall can be pinpointed instead of
     being papered over with a wall-phasing hack, which would just
     create the clipping bug again. */
  function stepOverAssist(now, dtSec) {
    try {
      var g = G(); if (!g || !g.player) return;
      var p = g.player;
      if (!p.alive || p.dashT > 0 || p.freezeT > 0) { stallFrames = 0; lastLocalPos = null; return; }
      var ph = PH(); if (!ph || !ph.world) return;
      var world = ph.world;
      var vx = (p.vel && p.vel.x) || 0, vz = (p.vel && p.vel.z) || 0;
      var speed = Math.sqrt(vx * vx + vz * vz);
      var disp = 0;
      if (lastLocalPos) { var ldx = p.pos.x - lastLocalPos.x, ldz = p.pos.z - lastLocalPos.z; disp = Math.sqrt(ldx * ldx + ldz * ldz); }
      lastLocalPos = { x: p.pos.x, z: p.pos.z };
      /* STEP-OVER HOLD (final scan): a slow walker lifts, then
         gravity drops them back below the object's top before
         they have crossed it, so they stutter-lift repeatedly.
         While the held collider is still under/just ahead of the
         player, keep them lifted — gravity settles them only once
         they are past it. Expires on its own so a stopped player
         is never left floating. */
      if (stepOverHold && now < stepOverHold.until) {
        var hc = stepOverHold.collider;
        var hcx = Math.max(hc.minX, Math.min(p.pos.x, hc.maxX));
        var hcz = Math.max(hc.minZ, Math.min(p.pos.z, hc.maxZ));
        var hdx = hcx - p.pos.x, hdz = hcz - p.pos.z;
        var hdist = Math.sqrt(hdx * hdx + hdz * hdz);
        if (hdist < (p.radius || 0.38) + 0.6 && speed > 0.3) {
          if (p.pos.y < hc.maxY + 0.12) p.pos.y = hc.maxY + 0.12;
          return;
        }
        stepOverHold = null;
      } else if (stepOverHold) { stepOverHold = null; }
      if (speed > 1.2 && disp < speed * Math.max(0.001, dtSec) * 0.35) stallFrames += 1; else stallFrames = 0;
      if (stallFrames < 3) return;
      if (now - lastStepOver < 250) return;
      var colliders = world.colliders || [];
      var r = p.radius || 0.38;
      var dirX = speed > 0 ? vx / speed : 0, dirZ = speed > 0 ? vz / speed : 0;
      var low = null, i, c, cx, cz, cdx, cdz, cdist, along;
      for (i = 0; i < colliders.length; i++) {
        c = colliders[i];
        if (!c || c.maxY > 0.55 || c.minY > 0.35) continue;
        cx = Math.max(c.minX, Math.min(p.pos.x, c.maxX));
        cz = Math.max(c.minZ, Math.min(p.pos.z, c.maxZ));
        cdx = cx - p.pos.x; cdz = cz - p.pos.z;
        cdist = Math.sqrt(cdx * cdx + cdz * cdz);
        along = (cdist > 0) ? (cdx * dirX + cdz * dirZ) / cdist : 1;
        if (cdist < r + 0.35 && along > -0.1) { low = c; break; }
      }
      if (low) {
        // Refuse only if a taller collider is IN FRONT (same test
        // as the low collider). The old code refused on any tall
        // collider within radius in ANY direction, so a wall
        // behind the player blocked stepping over a pumpkin ahead.
        for (i = 0; i < colliders.length; i++) {
          c = colliders[i];
          if (!c || c.maxY <= 0.55) continue;
          cx = Math.max(c.minX, Math.min(p.pos.x, c.maxX));
          cz = Math.max(c.minZ, Math.min(p.pos.z, c.maxZ));
          cdx = cx - p.pos.x; cdz = cz - p.pos.z;
          var tdist = Math.sqrt(cdx * cdx + cdz * cdz);
          var talong = (tdist > 0) ? (cdx * dirX + cdz * dirZ) / tdist : 1;
          if (tdist < r + 0.35 && talong > -0.1) return;
        }
        p.pos.y = low.maxY + 0.12;
        stepOverHold = { collider: low, until: now + 600 };
        lastStepOver = now; stallFrames = 0;
        log("step-over: lifted over low collider (top " + low.maxY.toFixed(2) + " m) at (" + p.pos.x.toFixed(1) + ", " + p.pos.z.toFixed(1) + ")");
        return;
      }
      // No low collider: log a long stall once, for diagnosis.
      if (stallFrames > 90 && now - stallLoggedAt > 5000) {
        stallLoggedAt = now;
        log("stall: player blocked >1.5s with no low collider at (" + p.pos.x.toFixed(1) + ", " + p.pos.z.toFixed(1) + ") — possible invisible collider here; report this spot");
      }
    } catch (e) {}
  }
  function interpLoop() {
    if (!active) return;
    var now = Date.now();
    stepOverAssist(now, lastInterpT ? Math.min(0.1, Math.max(0.001, (now - lastInterpT) / 1000)) : 0.016);
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
          // EXCEPTION (Nov 1: "way to the side"): if the actor is
          // more than 3 m from its synced spot (stale/spawn), snap
          // straight there — walking at 6 m/s from metres away is
          // exactly what looked like "in the wrong place".
          var dx = s.x - a.pos.x, dy = s.y - a.pos.y, dz = s.z - a.pos.z;
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          var maxDist = 6 * dtSec;
          if (dist > 3) {
            /* snap, keep pitch/yaw from the snapshot */
          } else if (dist > maxDist && dist > 0) {
            var k2 = maxDist / dist;
            s = { x: a.pos.x + dx * k2, y: a.pos.y + dy * k2, z: a.pos.z + dz * k2, yaw: s.yaw, pitch: s.pitch };
          }
          var oldX = a.pos.x, oldZ = a.pos.z;
          /* CLIPPING FIX: the old code teleported remote actors with
             pos.set, bypassing the world's collision entirely — the
             engine's Ba/world.move collision only runs for actors
             the engine itself moves. A synced path through a wall
             therefore rendered straight through it (and the next
             engine frame's resolve fought it back, so remotes
             visibly jittered through objects). Now remotes walk
             through the same world.move the engine uses: substeps,
             wall segments, and resolve. A >3 m snap (stale/spawn)
             still teleports, but through world.resolve so it never
             lands inside a collider. */
          var world = null;
          try { world = PH() && PH().world; } catch (e) {}
          if (world && world.move && a.pos) {
            if (dist > 3) {
              if (a.pos.set) a.pos.set(s.x, s.y, s.z); else { a.pos.x = s.x; a.pos.y = s.y; a.pos.z = s.z; }
              try { if (world.resolve) world.resolve(a.pos, Math.max(0.02, a.radius || 0.38), a.pos.y, a.pos.y + (a.height || 1.8)); } catch (e) {}
            } else {
              a.pos.y = s.y;
              try { world.move(a.pos, s.x - oldX, s.z - oldZ, Math.max(0.02, a.radius || 0.38), a.pos.y, a.pos.y + (a.height || 1.8)); } catch (e) {
                if (a.pos.set) a.pos.set(s.x, s.y, s.z); else { a.pos.x = s.x; a.pos.y = s.y; a.pos.z = s.z; }
              }
            }
          } else if (a.pos.set) a.pos.set(s.x, s.y, s.z); else { a.pos.x = s.x; a.pos.y = s.y; a.pos.z = s.z; }
          a.yaw = lerpAngle(a.yaw || 0, s.yaw, 1);
          if (typeof s.pitch === "number") a.pitch = s.pitch;
          /* ANIMATION (Nov 1: "slides on feet like ice, stays in
             that pose"): the engine animates legs/body from vel,
             and we were leaving vel at 0 while moving pos directly
             — so it looked frozen while sliding. Feed vel from the
             actual interpolated movement, and turn the mesh itself
             to the synced yaw right now, so looking around shows. */
          try {
            if (a.vel && a.vel.set) a.vel.set((a.pos.x - oldX) / Math.max(0.001, dtSec), 0, (a.pos.z - oldZ) / Math.max(0.001, dtSec));
            if (dist > 0.01) a.moveYaw = Math.atan2(a.pos.x - oldX, a.pos.z - oldZ);
          } catch (e2) {}
          /* Make the visible mesh follow the synced position right
             now, not only on the engine's next render pass — so a
             remote hunter cannot be drawn at a stale/AI position
             for a frame, and a remote prop cannot sit at spawn. */
          try { if (a.mesh && a.mesh.position && a.mesh.position.copy) a.mesh.position.copy(a.pos); } catch (e2) {}
          try { if (a.mesh) { a.mesh.visible = !!a.alive; a.mesh.rotation.y = a.yaw; } } catch (e2) {}
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
    /* Register for sync messages NOW, not after the engine starts:
       guests can send states the moment their match starts, and if
       the host's engine takes longer to be ready those early
       messages were dropped (host saw guests stuck at spawn, then
       snapping). playonline.js also queues pre-handler messages. */
    try { if (window.__po && window.__po.onSync) window.__po.onSync(onSyncMessage); } catch (e) {}
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
    if (isHost) loops.push(setInterval(hostTick, TICK_MS));
    else loops.push(setInterval(guestTick, TICK_MS));
    // Host also needs hit polling + HUD updates.
    loops.push(setInterval(function () { if (isHost) { guestTick(); } }, TICK_MS));
    rafId = requestAnimationFrame(interpLoop);
    log("Multiplayer match started — you are " + myRole.toUpperCase() + ". (original HUD only, no sync panel)");
    log("match started mode=" + mode + " role=" + myRole + " occupants=" + occupants.length + " host=" + isHost);
    return true;
  }

  window.__poSync = {
    startFromNetwork: startFromNetwork,
    onPlayerLeft: onPlayerLeft,
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
