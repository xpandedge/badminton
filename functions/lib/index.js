"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../packages/domain/dist/roles.js
var require_roles = __commonJS({
  "../packages/domain/dist/roles.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.canRebalance = exports2.canEnterScore = exports2.canAdvanceRound = exports2.canManageSessionPlayers = exports2.canRebalanceSession = exports2.canGenerateSchedule = exports2.canCreateSession = exports2.canManageTeamOwners = exports2.canDeleteSession = exports2.canManageOrganisers = exports2.canManageGroup = exports2.canManageSquad = exports2.SUPER_ADMIN_EMAILS = void 0;
    exports2.resolveGroupRole = resolveGroupRole;
    exports2.isSuperAdminEmail = isSuperAdminEmail;
    exports2.SUPER_ADMIN_EMAILS = [
      "pankaj4bharat@gmail.com",
      "sanju36@gmail.com"
    ];
    function resolveGroupRole(members, userId) {
      const match = members.find((m) => m.userId === userId);
      return match ? match.role : null;
    }
    function isSuperAdminEmail(email) {
      if (!email)
        return false;
      return exports2.SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
    }
    function isOwner(role) {
      return role === "owner";
    }
    function isMember(role) {
      return role === "owner" || role === "member" || role === "organiser";
    }
    exports2.canManageSquad = isOwner;
    exports2.canManageGroup = isOwner;
    exports2.canManageOrganisers = isOwner;
    exports2.canDeleteSession = isOwner;
    exports2.canManageTeamOwners = isSuperAdminEmail;
    exports2.canCreateSession = isMember;
    exports2.canGenerateSchedule = isMember;
    exports2.canRebalanceSession = isMember;
    exports2.canManageSessionPlayers = isMember;
    exports2.canAdvanceRound = isMember;
    exports2.canEnterScore = isMember;
    exports2.canRebalance = isMember;
  }
});

// ../packages/domain/dist/skill.js
var require_skill = __commonJS({
  "../packages/domain/dist/skill.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SKILL_LEVELS = void 0;
    exports2.isSkillLevel = isSkillLevel3;
    exports2.SKILL_LEVELS = [
      "unknown",
      "beginner",
      "intermediate",
      "advanced"
    ];
    function isSkillLevel3(value) {
      return exports2.SKILL_LEVELS.includes(value);
    }
  }
});

// ../packages/domain/dist/scoring.js
var require_scoring = __commonJS({
  "../packages/domain/dist/scoring.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SCORING_MODES = void 0;
    exports2.deriveWinner = deriveWinner4;
    exports2.leaderboardCompare = leaderboardCompare;
    exports2.SCORING_MODES = ["winner_only", "points"];
    function deriveWinner4(payload, mode) {
      if (mode === "points") {
        if (!("teamAScore" in payload))
          throw new Error("points mode requires scores");
        if (payload.teamAScore === payload.teamBScore)
          throw new Error("ties are not allowed");
        return payload.teamAScore > payload.teamBScore ? "A" : "B";
      }
      if (!("winnerTeam" in payload))
        throw new Error("winner_only mode requires winnerTeam");
      return payload.winnerTeam;
    }
    function leaderboardCompare(a, b, mode) {
      if (b.wins !== a.wins)
        return b.wins - a.wins;
      if (mode === "points") {
        if (b.pointDifference !== a.pointDifference)
          return b.pointDifference - a.pointDifference;
        if (b.gamesPlayed !== a.gamesPlayed)
          return b.gamesPlayed - a.gamesPlayed;
      } else {
        if (b.gamesPlayed !== a.gamesPlayed)
          return b.gamesPlayed - a.gamesPlayed;
        if (a.sitOutCount !== b.sitOutCount)
          return a.sitOutCount - b.sitOutCount;
      }
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    }
  }
});

// ../packages/domain/dist/session-status.js
var require_session_status = __commonJS({
  "../packages/domain/dist/session-status.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SCHEDULABLE_STATUSES = void 0;
    exports2.isSchedulable = isSchedulable3;
    exports2.SCHEDULABLE_STATUSES = /* @__PURE__ */ new Set(["checked_in", "active"]);
    function isSchedulable3(status) {
      return exports2.SCHEDULABLE_STATUSES.has(status);
    }
  }
});

// ../packages/domain/dist/join-code.js
var require_join_code = __commonJS({
  "../packages/domain/dist/join-code.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.generateJoinCode = generateJoinCode;
    exports2.normalizeJoinCode = normalizeJoinCode4;
    var ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    function generateJoinCode(rng = Math.random, length = 6) {
      let out = "";
      for (let i = 0; i < length; i++)
        out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
      return out;
    }
    function normalizeJoinCode4(input) {
      return input.toUpperCase().replace(/\s+/g, "");
    }
  }
});

// ../packages/domain/dist/rebalance-summary.js
var require_rebalance_summary = __commonJS({
  "../packages/domain/dist/rebalance-summary.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildRebalanceSummary = buildRebalanceSummary2;
    var matchWord = (n) => n === 1 ? "match" : "matches";
    function buildRebalanceSummary2(i) {
      const parts = [
        "Future rounds regenerated.",
        `${i.completedPreserved} completed ${matchWord(i.completedPreserved)} preserved.`,
        `${i.inProgressPreserved} current ${matchWord(i.inProgressPreserved)} preserved.`
      ];
      for (const r of i.removed)
        parts.push(`${r} removed from future rounds.`);
      for (const a of i.addedFromRound)
        parts.push(`${a.name} added from Round ${a.round}.`);
      parts.push(`Expected games per active player: ${i.minGames}\u2013${i.maxGames}.`);
      return parts.join(" ");
    }
  }
});

// ../packages/domain/dist/sport.js
var require_sport = __commonJS({
  "../packages/domain/dist/sport.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SPORTS = void 0;
    exports2.getSportConfig = getSportConfig;
    exports2.SPORTS = {
      badminton: {
        label: "Badminton",
        defaultScoringMode: "points",
        defaultTargetScore: 21,
        terms: { game: "game", court: "court" }
      },
      pickleball: {
        label: "Pickleball",
        defaultScoringMode: "points",
        defaultTargetScore: 11,
        terms: { game: "game", court: "court" }
      }
    };
    function getSportConfig(sport) {
      return exports2.SPORTS[sport];
    }
  }
});

// ../packages/domain/dist/index.js
var require_dist = __commonJS({
  "../packages/domain/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_roles(), exports2);
    __exportStar(require_skill(), exports2);
    __exportStar(require_scoring(), exports2);
    __exportStar(require_session_status(), exports2);
    __exportStar(require_join_code(), exports2);
    __exportStar(require_rebalance_summary(), exports2);
    __exportStar(require_sport(), exports2);
  }
});

// ../packages/match-engine/dist/types.js
var require_types = __commonJS({
  "../packages/match-engine/dist/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_SEED = exports2.ALGORITHM_VERSION = exports2.PLAYERS_PER_MATCH = exports2.SKILL_VALUE = void 0;
    exports2.SKILL_VALUE = {
      unknown: 2,
      beginner: 1,
      intermediate: 2,
      advanced: 3
    };
    exports2.PLAYERS_PER_MATCH = 4;
    exports2.ALGORITHM_VERSION = "v1";
    exports2.DEFAULT_SEED = 24301;
  }
});

// ../packages/match-engine/dist/rounds.js
var require_rounds = __commonJS({
  "../packages/match-engine/dist/rounds.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.computeFutureRoundCount = computeFutureRoundCount;
    exports2.maxPlayersPerRound = maxPlayersPerRound;
    var types_js_1 = require_types();
    function computeFutureRoundCount(input) {
      const { sessionDurationMinutes, estimatedGameMinutes, elapsedRounds, mode } = input;
      if (estimatedGameMinutes <= 0)
        return 0;
      if (mode === "initial") {
        return Math.max(0, Math.floor(sessionDurationMinutes / estimatedGameMinutes));
      }
      const remaining = sessionDurationMinutes - elapsedRounds * estimatedGameMinutes;
      return Math.max(0, Math.floor(remaining / estimatedGameMinutes));
    }
    function maxPlayersPerRound(courtCount) {
      return courtCount * types_js_1.PLAYERS_PER_MATCH;
    }
  }
});

// ../packages/match-engine/dist/rng.js
var require_rng = __commonJS({
  "../packages/match-engine/dist/rng.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.mulberry32 = mulberry32;
    exports2.seededOrder = seededOrder;
    function mulberry32(seed) {
      let a = seed >>> 0;
      return function() {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function seededOrder(ids, seed) {
      const rng = mulberry32(seed);
      const shuffled = [...ids].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      return new Map(shuffled.map((id, idx) => [id, idx]));
    }
  }
});

// ../packages/match-engine/dist/state.js
var require_state = __commonJS({
  "../packages/match-engine/dist/state.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.pairKey = pairKey;
    exports2.createInitialState = createInitialState;
    exports2.recordMatch = recordMatch;
    exports2.seedStateFromLocked = seedStateFromLocked;
    function pairKey(a, b) {
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    }
    function createInitialState(players) {
      const s = {
        gamesPlayed: /* @__PURE__ */ new Map(),
        sitOuts: /* @__PURE__ */ new Map(),
        partnerCount: /* @__PURE__ */ new Map(),
        opponentCount: /* @__PURE__ */ new Map(),
        lastPartner: /* @__PURE__ */ new Map(),
        lastOpponents: /* @__PURE__ */ new Map(),
        lastPlayedRound: /* @__PURE__ */ new Map()
      };
      for (const p of players) {
        s.gamesPlayed.set(p.playerId, 0);
        s.sitOuts.set(p.playerId, 0);
      }
      return s;
    }
    var inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
    function recordMatch(s, roundNumber, teamA, teamB) {
      for (const id of [...teamA, ...teamB]) {
        inc(s.gamesPlayed, id);
        s.lastPlayedRound.set(id, roundNumber);
      }
      inc(s.partnerCount, pairKey(teamA[0], teamA[1]));
      inc(s.partnerCount, pairKey(teamB[0], teamB[1]));
      for (const a of teamA)
        for (const b of teamB)
          inc(s.opponentCount, pairKey(a, b));
      s.lastPartner.set(teamA[0], teamA[1]);
      s.lastPartner.set(teamA[1], teamA[0]);
      s.lastPartner.set(teamB[0], teamB[1]);
      s.lastPartner.set(teamB[1], teamB[0]);
      s.lastOpponents.set(teamA[0], new Set(teamB));
      s.lastOpponents.set(teamA[1], new Set(teamB));
      s.lastOpponents.set(teamB[0], new Set(teamA));
      s.lastOpponents.set(teamB[1], new Set(teamA));
    }
    function seedStateFromLocked(players, locked) {
      const s = createInitialState(players);
      for (const m of [...locked].sort((a, b) => a.roundNumber - b.roundNumber)) {
        recordMatch(s, m.roundNumber, m.teamA, m.teamB);
      }
      return s;
    }
  }
});

// ../packages/match-engine/dist/priors.js
var require_priors = __commonJS({
  "../packages/match-engine/dist/priors.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.normalizePriorGames = normalizePriorGames;
    exports2.seedStateFromPriors = seedStateFromPriors;
    var state_js_1 = require_state();
    function normalizePriorGames(priors, playerIds, futureRounds) {
      const raw = playerIds.map((id) => priors[id]?.gamesPlayed ?? 0);
      const min = Math.min(...raw);
      return new Map(playerIds.map((id, i) => [id, Math.min(raw[i] - min, futureRounds)]));
    }
    function seedStateFromPriors(players, priors, futureRounds) {
      const state = (0, state_js_1.createInitialState)(players);
      const playerIds = players.map((p) => p.playerId);
      const playerSet = new Set(playerIds);
      const normalizedGames = normalizePriorGames(priors, playerIds, futureRounds);
      for (const p of players) {
        state.gamesPlayed.set(p.playerId, normalizedGames.get(p.playerId) ?? 0);
        const prior = priors[p.playerId];
        if (!prior)
          continue;
        for (const [key, count] of Object.entries(prior.partnerCounts)) {
          const [a, b] = key.split("|");
          if (a && b && playerSet.has(a) && playerSet.has(b)) {
            state.partnerCount.set((0, state_js_1.pairKey)(a, b), count);
          }
        }
        for (const [key, count] of Object.entries(prior.opponentCounts)) {
          const [a, b] = key.split("|");
          if (a && b && playerSet.has(a) && playerSet.has(b)) {
            state.opponentCount.set((0, state_js_1.pairKey)(a, b), count);
          }
        }
      }
      return state;
    }
  }
});

// ../packages/match-engine/dist/penalty.js
var require_penalty = __commonJS({
  "../packages/match-engine/dist/penalty.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_WEIGHTS = void 0;
    exports2.bestTeamSplit = bestTeamSplit;
    exports2.foursomePenalty = foursomePenalty;
    var types_js_1 = require_types();
    var state_js_1 = require_state();
    exports2.DEFAULT_WEIGHTS = {
      repeatPartner: 10,
      repeatOpponent: 4,
      recentPartner: 6,
      recentOpponent: 3,
      skillGap: 1
    };
    var splits = [
      [0, 1, 2, 3],
      [0, 2, 1, 3],
      [0, 3, 1, 2]
      // 3 distinct doubles pairings of 4 players
    ];
    function splitPenalty(s, p, idx, w) {
      const [a1, a2, b1, b2] = idx.map((i) => p[i]);
      let pen = 0;
      pen += w.repeatPartner * ((s.partnerCount.get((0, state_js_1.pairKey)(a1.playerId, a2.playerId)) ?? 0) + (s.partnerCount.get((0, state_js_1.pairKey)(b1.playerId, b2.playerId)) ?? 0));
      if (s.lastPartner.get(a1.playerId) === a2.playerId)
        pen += w.recentPartner;
      if (s.lastPartner.get(b1.playerId) === b2.playerId)
        pen += w.recentPartner;
      for (const a of [a1, a2])
        for (const b of [b1, b2]) {
          pen += w.repeatOpponent * (s.opponentCount.get((0, state_js_1.pairKey)(a.playerId, b.playerId)) ?? 0);
          if (s.lastOpponents.get(a.playerId)?.has(b.playerId))
            pen += w.recentOpponent;
        }
      const teamA = types_js_1.SKILL_VALUE[a1.skillLevel] + types_js_1.SKILL_VALUE[a2.skillLevel];
      const teamB = types_js_1.SKILL_VALUE[b1.skillLevel] + types_js_1.SKILL_VALUE[b2.skillLevel];
      pen += w.skillGap * Math.abs(teamA - teamB);
      return pen;
    }
    function bestTeamSplit(s, four, w = exports2.DEFAULT_WEIGHTS) {
      let best = null;
      for (const idx of splits) {
        const penalty = splitPenalty(s, four, idx, w);
        if (!best || penalty < best.penalty) {
          const [a1, a2, b1, b2] = idx;
          best = { teamA: [four[a1].playerId, four[a2].playerId], teamB: [four[b1].playerId, four[b2].playerId], penalty };
        }
      }
      return best;
    }
    function foursomePenalty(s, four, w = exports2.DEFAULT_WEIGHTS) {
      return bestTeamSplit(s, four, w).penalty;
    }
  }
});

// ../packages/match-engine/dist/sitouts.js
var require_sitouts = __commonJS({
  "../packages/match-engine/dist/sitouts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.selectSitOuts = selectSitOuts;
    var types_js_1 = require_types();
    function selectSitOuts(s, available, courtCount, order = /* @__PURE__ */ new Map()) {
      const capacity = courtCount * types_js_1.PLAYERS_PER_MATCH;
      const playableCount = Math.min(Math.floor(available.length / types_js_1.PLAYERS_PER_MATCH) * types_js_1.PLAYERS_PER_MATCH, capacity);
      const sitCount = available.length - playableCount;
      if (sitCount <= 0)
        return { playing: [...available], sitting: [] };
      const ranked = [...available].sort((x, y) => {
        const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);
        if (so !== 0)
          return so;
        const gp = (s.gamesPlayed.get(y) ?? 0) - (s.gamesPlayed.get(x) ?? 0);
        if (gp !== 0)
          return gp;
        return (order.get(x) ?? 0) - (order.get(y) ?? 0) || (x < y ? -1 : x > y ? 1 : 0);
      });
      const sitting = ranked.slice(0, sitCount);
      const sittingSet = new Set(sitting);
      return { playing: available.filter((p) => !sittingSet.has(p)), sitting };
    }
  }
});

// ../packages/match-engine/dist/round.js
var require_round = __commonJS({
  "../packages/match-engine/dist/round.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildRound = buildRound;
    var types_js_1 = require_types();
    var state_js_1 = require_state();
    var penalty_js_1 = require_penalty();
    var sitouts_js_1 = require_sitouts();
    function buildRound(state, players, courts, roundNumber, order = /* @__PURE__ */ new Map()) {
      const byId = new Map(players.map((p) => [p.playerId, p]));
      const { playing, sitting } = (0, sitouts_js_1.selectSitOuts)(state, players.map((p) => p.playerId), courts.length, order);
      const pool = new Set(playing);
      const matches = [];
      const requiredCount = Math.floor(playing.length / types_js_1.PLAYERS_PER_MATCH);
      const startIdx = (roundNumber - 1) % courts.length;
      const rotated = [...courts.slice(startIdx), ...courts.slice(0, startIdx)];
      const courtsToUse = rotated.slice(0, requiredCount);
      for (let m = 0; m < courtsToUse.length; m++) {
        const four = pickLowestPenaltyFoursome(state, pool, byId, order);
        for (const id of four)
          pool.delete(id);
        const split = (0, penalty_js_1.bestTeamSplit)(state, four.map((id) => ({ playerId: id, skillLevel: byId.get(id).skillLevel })));
        (0, state_js_1.recordMatch)(state, roundNumber, split.teamA, split.teamB);
        const court = courtsToUse[m];
        matches.push({ roundNumber, courtId: court.courtId, matchNumber: m + 1, teamA: split.teamA, teamB: split.teamB });
      }
      for (const id of sitting)
        state.sitOuts.set(id, (state.sitOuts.get(id) ?? 0) + 1);
      const capacity = courts.length * types_js_1.PLAYERS_PER_MATCH;
      const reason = players.length > capacity ? "overflow" : "rotation";
      return {
        matches,
        sitOuts: sitting.map((playerId) => ({ roundNumber, playerId, reason }))
      };
    }
    function pickLowestPenaltyFoursome(state, pool, byId, order) {
      const ids = [...pool];
      const anchor = ids.sort((a, b) => (state.gamesPlayed.get(a) ?? 0) - (state.gamesPlayed.get(b) ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0))[0];
      const rest = ids.filter((id) => id !== anchor);
      const fp = (id) => ({ playerId: id, skillLevel: byId.get(id).skillLevel });
      let best = null;
      for (let i = 0; i < rest.length; i++)
        for (let j = i + 1; j < rest.length; j++)
          for (let k = j + 1; k < rest.length; k++) {
            const four = [anchor, rest[i], rest[j], rest[k]];
            const pen = (0, penalty_js_1.foursomePenalty)(state, four.map(fp));
            if (!best || pen < best.pen)
              best = { four, pen };
          }
      return best.four;
    }
  }
});

// ../packages/match-engine/dist/fairness.js
var require_fairness = __commonJS({
  "../packages/match-engine/dist/fairness.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.computeFairness = computeFairness;
    var types_js_1 = require_types();
    function computeFairness(state, output, input) {
      const games = Array.from(state.gamesPlayed.values());
      const sitOuts = Array.from(state.sitOuts.values());
      if (games.length === 0) {
        return {
          algorithmVersion: types_js_1.ALGORITHM_VERSION,
          playersCount: input.players.length,
          courtsCount: input.courts.length,
          roundsGenerated: new Set(output.matches.map((m) => m.roundNumber)).size,
          fairnessScore: 1,
          minGamesPerPlayer: 0,
          maxGamesPerPlayer: 0,
          notes: []
        };
      }
      const minGames = Math.min(...games);
      const maxGames = Math.max(...games);
      let penalty = 0;
      const notes = [];
      const maxSpread = maxGames - minGames;
      if (maxSpread > 1) {
        penalty += 0.2 * (maxSpread - 1);
        notes.push(`Games played spread is ${maxSpread} (ideal is \u2264 1)`);
      }
      const sitOutSpread = Math.max(...sitOuts) - Math.min(...sitOuts);
      if (sitOutSpread > 1) {
        penalty += 0.3 * (sitOutSpread - 1);
        notes.push(`Sit-out spread is ${sitOutSpread} (ideal is \u2264 1)`);
      }
      const maxPartners = Math.max(...Array.from(state.partnerCount.values()), 0);
      if (maxPartners > 1) {
        penalty += 0.1 * (maxPartners - 1);
        notes.push(`Repeated partners detected (max times: ${maxPartners})`);
      }
      const fairnessScore = Math.max(0, Math.min(1, 1 - penalty));
      const roundsSet = new Set(output.matches.map((m) => m.roundNumber));
      const roundsGenerated = roundsSet.size;
      return {
        algorithmVersion: types_js_1.ALGORITHM_VERSION,
        playersCount: input.players.length,
        courtsCount: input.courts.length,
        roundsGenerated,
        fairnessScore,
        minGamesPerPlayer: minGames,
        maxGamesPerPlayer: maxGames,
        notes
      };
    }
  }
});

// ../packages/match-engine/dist/generate.js
var require_generate = __commonJS({
  "../packages/match-engine/dist/generate.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ALGORITHM_VERSION = void 0;
    exports2.generateSchedule = generateSchedule2;
    var types_js_1 = require_types();
    var rounds_js_1 = require_rounds();
    var state_js_1 = require_state();
    var priors_js_1 = require_priors();
    var round_js_1 = require_round();
    var fairness_js_1 = require_fairness();
    var rng_js_1 = require_rng();
    var types_js_2 = require_types();
    Object.defineProperty(exports2, "ALGORITHM_VERSION", { enumerable: true, get: function() {
      return types_js_2.ALGORITHM_VERSION;
    } });
    function generateSchedule2(input) {
      const futureRounds = (0, rounds_js_1.computeFutureRoundCount)(input);
      const state = input.mode === "rebalance" ? (0, state_js_1.seedStateFromLocked)(input.players, input.lockedMatches) : input.priors ? (0, priors_js_1.seedStateFromPriors)(input.players, input.priors, futureRounds) : (0, state_js_1.createInitialState)(input.players);
      const order = (0, rng_js_1.seededOrder)(input.players.map((p) => p.playerId), input.seed ?? types_js_1.DEFAULT_SEED);
      const lockedRounds = new Set(input.lockedMatches.map((m) => m.roundNumber));
      const maxLockedRound = input.lockedMatches.reduce((mx, m) => Math.max(mx, m.roundNumber), 0);
      const firstFutureRound = Math.max(input.elapsedRounds + 1, maxLockedRound + 1);
      const matches = [];
      const sitOuts = [];
      for (let r = 0; r < futureRounds; r++) {
        const roundNumber = firstFutureRound + r;
        if (lockedRounds.has(roundNumber))
          continue;
        const available = input.players.filter((p) => p.availableFromRound <= roundNumber);
        if (available.length < types_js_1.PLAYERS_PER_MATCH)
          continue;
        const res = (0, round_js_1.buildRound)(state, available, input.courts, roundNumber, order);
        matches.push(...res.matches);
        sitOuts.push(...res.sitOuts);
      }
      return { matches, sitOuts, metadata: (0, fairness_js_1.computeFairness)(state, { matches, sitOuts }, input) };
    }
  }
});

// ../packages/match-engine/dist/index.js
var require_dist2 = __commonJS({
  "../packages/match-engine/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.normalizePriorGames = exports2.seedStateFromPriors = exports2.pairKey = exports2.ALGORITHM_VERSION = exports2.generateSchedule = exports2.seededOrder = exports2.mulberry32 = exports2.maxPlayersPerRound = exports2.computeFutureRoundCount = void 0;
    __exportStar(require_types(), exports2);
    var rounds_js_1 = require_rounds();
    Object.defineProperty(exports2, "computeFutureRoundCount", { enumerable: true, get: function() {
      return rounds_js_1.computeFutureRoundCount;
    } });
    Object.defineProperty(exports2, "maxPlayersPerRound", { enumerable: true, get: function() {
      return rounds_js_1.maxPlayersPerRound;
    } });
    var rng_js_1 = require_rng();
    Object.defineProperty(exports2, "mulberry32", { enumerable: true, get: function() {
      return rng_js_1.mulberry32;
    } });
    Object.defineProperty(exports2, "seededOrder", { enumerable: true, get: function() {
      return rng_js_1.seededOrder;
    } });
    var generate_js_1 = require_generate();
    Object.defineProperty(exports2, "generateSchedule", { enumerable: true, get: function() {
      return generate_js_1.generateSchedule;
    } });
    Object.defineProperty(exports2, "ALGORITHM_VERSION", { enumerable: true, get: function() {
      return generate_js_1.ALGORITHM_VERSION;
    } });
    var state_js_1 = require_state();
    Object.defineProperty(exports2, "pairKey", { enumerable: true, get: function() {
      return state_js_1.pairKey;
    } });
    var priors_js_1 = require_priors();
    Object.defineProperty(exports2, "seedStateFromPriors", { enumerable: true, get: function() {
      return priors_js_1.seedStateFromPriors;
    } });
    Object.defineProperty(exports2, "normalizePriorGames", { enumerable: true, get: function() {
      return priors_js_1.normalizePriorGames;
    } });
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  addGroupMemberByEmail: () => addGroupMemberByEmail,
  addLatePlayer: () => addLatePlayer,
  advanceRound: () => advanceRound,
  approveJoinRequest: () => approveJoinRequest,
  completeSession: () => completeSession,
  disableCourt: () => disableCourt,
  generateSchedule: () => generateSchedule,
  getScoreLinkData: () => getScoreLinkData,
  joinGroupByInvite: () => joinGroupByInvite,
  moveMatch: () => moveMatch,
  pauseSession: () => pauseSession,
  rebalanceSession: () => rebalanceSession,
  rejectJoinRequest: () => rejectJoinRequest,
  requestJoin: () => requestJoin,
  resumeSession: () => resumeSession,
  startSession: () => startSession,
  submitScore: () => submitScore,
  submitScoreByLink: () => submitScoreByLink,
  swapPlayers: () => swapPlayers,
  updatePlayerStatus: () => updatePlayerStatus
});
module.exports = __toCommonJS(index_exports);
var import_v2 = require("firebase-functions/v2");
var import_app = require("firebase-admin/app");

// src/join.ts
var import_https4 = require("firebase-functions/v2/https");
var import_firestore5 = require("firebase-admin/firestore");
var import_domain = __toESM(require_dist());

// src/lib/auth.ts
var import_firestore = require("firebase-admin/firestore");
var import_https = require("firebase-functions/v2/https");
async function requireGroupRole(uid, groupId, predicate, tx) {
  const db = (0, import_firestore.getFirestore)();
  const ref = db.doc(`groups/${groupId}/members/${uid}`);
  const doc = tx ? await tx.get(ref) : await ref.get();
  const role = doc.exists ? doc.data().role : null;
  if (!predicate(role)) {
    throw new import_https.HttpsError("permission-denied", "Insufficient role");
  }
  return role;
}

// src/lib/audit.ts
var import_firestore2 = require("firebase-admin/firestore");
var import_firestore3 = require("firebase-admin/firestore");
function writeAudit(batchOrTx, sessionId, entry) {
  const db = (0, import_firestore2.getFirestore)();
  const ref = db.collection(`sessions/${sessionId}/auditLogs`).doc();
  const data = {
    ...entry,
    timestamp: entry.timestamp || import_firestore3.FieldValue.serverTimestamp()
  };
  if ("commit" in batchOrTx) {
    batchOrTx.set(ref, data);
  } else {
    batchOrTx.set(ref, data);
  }
}

// src/lib/rateLimit.ts
var import_https2 = require("firebase-functions/v2/https");
var import_firestore4 = require("firebase-admin/firestore");
async function checkRateLimit(joinCode, ip) {
  const db = (0, import_firestore4.getFirestore)();
  const limitRef = db.collection("_rateLimits").doc(`${joinCode}_${ip}`);
  await db.runTransaction(async (t) => {
    const doc = await t.get(limitRef);
    const now = Date.now();
    const windowMs = 6e4;
    if (!doc.exists) {
      t.set(limitRef, { count: 1, resetAt: now + windowMs });
      return;
    }
    const data = doc.data();
    if (now > data.resetAt) {
      t.set(limitRef, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (data.count >= 10) {
      throw new import_https2.HttpsError("resource-exhausted", "Too many requests. Please try again later.");
    }
    t.update(limitRef, { count: data.count + 1 });
  });
}

// src/lib/validation.ts
var import_https3 = require("firebase-functions/v2/https");
function assertString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new import_https3.HttpsError("invalid-argument", `${field} must be a non-empty string.`);
  }
  return value;
}
function assertInt(value, field) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new import_https3.HttpsError("invalid-argument", `${field} must be an integer.`);
  }
  return value;
}
function assertEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new import_https3.HttpsError("invalid-argument", `${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}
function assertScorePayload(value, mode) {
  if (!value || typeof value !== "object") {
    throw new import_https3.HttpsError("invalid-argument", "scorePayload must be an object.");
  }
  const p = value;
  if (mode === "points") {
    if (typeof p.teamAScore !== "number" || typeof p.teamBScore !== "number") {
      throw new import_https3.HttpsError("invalid-argument", "points mode requires numeric teamAScore and teamBScore.");
    }
    if (p.teamAScore === p.teamBScore) {
      throw new import_https3.HttpsError("invalid-argument", "Tied scores are not allowed.");
    }
    return { teamAScore: p.teamAScore, teamBScore: p.teamBScore };
  }
  if (p.winnerTeam !== "A" && p.winnerTeam !== "B") {
    throw new import_https3.HttpsError("invalid-argument", "winner_only mode requires winnerTeam of 'A' or 'B'.");
  }
  return { winnerTeam: p.winnerTeam };
}

// src/join.ts
var MAX_DISPLAY_NAME = 60;
var requestJoin = (0, import_https4.onCall)({ cors: true }, async (req) => {
  const joinCode = assertString(req.data?.joinCode, "joinCode");
  const displayName = assertString(req.data?.displayName, "displayName").trim();
  const isGuest = !!req.data?.isGuest;
  if (displayName.length > MAX_DISPLAY_NAME) {
    throw new import_https4.HttpsError("invalid-argument", `displayName must be \u2264 ${MAX_DISPLAY_NAME} characters.`);
  }
  const ip = req.rawRequest?.ip || "unknown-ip";
  await checkRateLimit(joinCode, ip);
  const db = (0, import_firestore5.getFirestore)();
  const code = (0, import_domain.normalizeJoinCode)(joinCode);
  const q = await db.collection("sessions").where("joinCode", "==", code).where("joinEnabled", "==", true).limit(1).get();
  if (q.empty) {
    throw new import_https4.HttpsError("not-found", "Invalid or closed join code");
  }
  const session = q.docs[0];
  const ref = await session.ref.collection("joinRequests").add({
    displayName,
    isGuest: !!isGuest,
    userId: req.auth?.uid ?? null,
    status: "pending",
    createdAt: import_firestore5.FieldValue.serverTimestamp()
  });
  return { sessionId: session.id, requestId: ref.id };
});
var approveJoinRequest = (0, import_https4.onCall)({ cors: true }, async (req) => {
  if (!req.auth) throw new import_https4.HttpsError("unauthenticated", "Must be signed in");
  const sessionId = assertString(req.data?.sessionId, "sessionId");
  const requestId = assertString(req.data?.requestId, "requestId");
  const skillLevel = req.data?.skillLevel;
  if (!(0, import_domain.isSkillLevel)(skillLevel)) throw new import_https4.HttpsError("invalid-argument", "Valid skillLevel is required");
  const db = (0, import_firestore5.getFirestore)();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new import_https4.HttpsError("not-found", "Session not found");
  const sessionData = sessionSnap.data();
  const requestRef = sessionRef.collection("joinRequests").doc(requestId);
  await db.runTransaction(async (t) => {
    const reqSnap = await t.get(requestRef);
    if (!reqSnap.exists) throw new import_https4.HttpsError("not-found", "Join request not found");
    await requireGroupRole(req.auth.uid, sessionData.groupId, import_domain.canManageSessionPlayers, t);
    const reqData = reqSnap.data();
    if (reqData.status !== "pending") {
      throw new import_https4.HttpsError("failed-precondition", "Request is not pending");
    }
    const newPlayerId = reqData.userId || requestId;
    const playerRef = sessionRef.collection("players").doc(newPlayerId);
    const playerSnap = await t.get(playerRef);
    if (playerSnap.exists) {
      throw new import_https4.HttpsError("already-exists", "Player is already in the session");
    }
    t.set(playerRef, {
      playerId: newPlayerId,
      displayName: reqData.displayName,
      skillLevel,
      status: "registered",
      participantType: reqData.isGuest ? "guest" : "registered_user",
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      sitOutCount: 0,
      addedAt: import_firestore5.FieldValue.serverTimestamp()
    });
    t.update(requestRef, { status: "approved" });
    writeAudit(t, sessionId, {
      actorUid: req.auth.uid,
      action: "player/join_approved",
      details: { requestId, playerId: newPlayerId }
    });
  });
  return { success: true };
});
var rejectJoinRequest = (0, import_https4.onCall)({ cors: true }, async (req) => {
  if (!req.auth) throw new import_https4.HttpsError("unauthenticated", "Must be signed in");
  const sessionId = assertString(req.data?.sessionId, "sessionId");
  const requestId = assertString(req.data?.requestId, "requestId");
  const db = (0, import_firestore5.getFirestore)();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new import_https4.HttpsError("not-found", "Session not found");
  const groupId = sessionSnap.data().groupId;
  const requestRef = sessionRef.collection("joinRequests").doc(requestId);
  await db.runTransaction(async (t) => {
    const reqSnap = await t.get(requestRef);
    if (!reqSnap.exists) throw new import_https4.HttpsError("not-found", "Join request not found");
    await requireGroupRole(req.auth.uid, groupId, import_domain.canManageSessionPlayers, t);
    if (reqSnap.data().status !== "pending") {
      throw new import_https4.HttpsError("failed-precondition", "Request is not pending");
    }
    t.update(requestRef, { status: "rejected" });
    writeAudit(t, sessionId, {
      actorUid: req.auth.uid,
      action: "player/join_rejected",
      details: { requestId }
    });
  });
  return { success: true };
});

// src/generateSchedule.ts
var import_https5 = require("firebase-functions/v2/https");
var import_firestore6 = require("firebase-admin/firestore");
var import_domain3 = __toESM(require_dist());
var import_match_engine = __toESM(require_dist2());

// src/lib/mapping.ts
var import_domain2 = __toESM(require_dist());
function mapSessionToEngineInput(session, players, rounds, matches, mode) {
  const enginePlayers = players.filter((p) => (0, import_domain2.isSchedulable)(p.status)).map((p) => ({
    playerId: p.id || p.playerId,
    displayName: p.displayName,
    skillLevel: p.skillLevel || "unknown",
    // Late joiners have availableFromRound > 1 (DELTA_SPEC D7 / PRD §23)
    availableFromRound: mode === "rebalance" ? p.availableFromRound || 1 : 1
  }));
  const engineCourts = (session.courts || []).filter((c) => c.isActive).map((c) => ({
    courtId: c.courtId || c.id,
    name: c.name,
    courtNumber: c.courtNumber
  }));
  const elapsedRounds = rounds.filter((r) => r.status === "completed" || r.status === "in_progress").length;
  const lockedMatches = matches.filter((m) => m.isLocked).map((m) => ({
    roundNumber: m.roundNumber,
    courtId: m.courtId,
    teamA: m.teamAIds || [m.teamA[0]?.playerId, m.teamA[1]?.playerId],
    teamB: m.teamBIds || [m.teamB[0]?.playerId, m.teamB[1]?.playerId]
  }));
  return {
    mode,
    players: enginePlayers,
    courts: engineCourts,
    sessionDurationMinutes: session.durationMinutes || 60,
    estimatedGameMinutes: session.estimatedGameMinutes || 15,
    elapsedRounds,
    lockedMatches
  };
}

// src/generateSchedule.ts
var generateSchedule = (0, import_https5.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https5.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = request.data.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    throw new import_https5.HttpsError("invalid-argument", "sessionId must be provided.");
  }
  const db = (0, import_firestore6.getFirestore)();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const session = await db.runTransaction(async (t) => {
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https5.HttpsError("not-found", "Session not found.");
    const s = sessionDoc.data();
    await requireGroupRole(request.auth.uid, s.groupId, import_domain3.canGenerateSchedule, t);
    if (s.status !== "draft" && s.status !== "scheduled") {
      throw new import_https5.HttpsError("failed-precondition", "Session must be draft or scheduled to generate an initial schedule.");
    }
    if (s.scheduleGeneratedAt) {
      throw new import_https5.HttpsError("already-exists", "A schedule has already been generated. Use rebalance to change it.");
    }
    t.update(sessionRef, { scheduleGeneratedAt: import_firestore6.FieldValue.serverTimestamp() });
    return s;
  });
  const playersSnap = await db.collection(`sessions/${sessionId}/players`).get();
  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const roundsSnap = await db.collection(`sessions/${sessionId}/rounds`).get();
  const rounds = roundsSnap.docs.map((d) => d.data());
  const matchesSnap = await db.collectionGroup("matches").where("sessionId", "==", sessionId).get();
  const matches = matchesSnap.docs.map((d) => d.data());
  const engineInput = mapSessionToEngineInput(session, players, rounds, matches, "initial");
  const engineOutput = (0, import_match_engine.generateSchedule)(engineInput);
  const batch = db.batch();
  for (const player of players) {
    const lbRef = db.doc(`sessions/${sessionId}/leaderboard/${player.id}`);
    batch.set(lbRef, {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      sitOutCount: 0
    });
  }
  const roundRefs = /* @__PURE__ */ new Map();
  for (const match of engineOutput.matches) {
    let rRef = roundRefs.get(match.roundNumber);
    if (!rRef) {
      rRef = db.collection(`sessions/${sessionId}/rounds`).doc(`round_${match.roundNumber}`);
      roundRefs.set(match.roundNumber, rRef);
      batch.set(rRef, {
        roundNumber: match.roundNumber,
        status: "scheduled"
      });
    }
    const teamAIds = match.teamA;
    const teamBIds = match.teamB;
    const getDisplayName = (pid) => players.find((p) => p.id === pid)?.displayName || "Unknown";
    const mRef = rRef.collection("matches").doc();
    batch.set(mRef, {
      roundNumber: match.roundNumber,
      courtId: match.courtId,
      matchNumber: match.matchNumber,
      teamA: teamAIds.map((pid) => ({ playerId: pid, displayName: getDisplayName(pid) })),
      teamB: teamBIds.map((pid) => ({ playerId: pid, displayName: getDisplayName(pid) })),
      teamAIds,
      teamBIds,
      status: "scheduled",
      isLocked: false
    });
  }
  for (const sitOut of engineOutput.sitOuts) {
    const sRef = db.collection(`sessions/${sessionId}/sitOuts`).doc();
    batch.set(sRef, {
      ...sitOut
    });
  }
  const genRef = db.collection(`sessions/${sessionId}/generationRuns`).doc();
  batch.set(genRef, {
    mode: "initial",
    metadata: engineOutput.metadata,
    createdAt: import_firestore6.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  });
  writeAudit(batch, sessionId, {
    actorUid: request.auth.uid,
    action: "generation/created",
    details: { metadata: engineOutput.metadata }
  });
  await batch.commit();
  return { success: true, metadata: engineOutput.metadata };
});

// src/submitScore.ts
var import_https6 = require("firebase-functions/v2/https");
var import_firestore7 = require("firebase-admin/firestore");
var import_domain4 = __toESM(require_dist());
var import_domain5 = __toESM(require_dist());
var submitScore = (0, import_https6.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https6.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data.sessionId, "sessionId");
  const roundNumber = assertInt(request.data.roundNumber, "roundNumber");
  const matchId = assertString(request.data.matchId, "matchId");
  const rawPayload = request.data.payload;
  const db = (0, import_firestore7.getFirestore)();
  return db.runTransaction(async (transaction) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https6.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain4.canEnterScore, transaction);
    if (session.status !== "active" && session.status !== "paused") {
      throw new import_https6.HttpsError("failed-precondition", "Scores can only be entered while the session is active.");
    }
    if (roundNumber > (session.currentRoundNumber || 0)) {
      throw new import_https6.HttpsError("failed-precondition", "Cannot score a future round.");
    }
    const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
    const matchDoc = await transaction.get(matchRef);
    if (!matchDoc.exists) throw new import_https6.HttpsError("not-found", "Match not found.");
    const match = matchDoc.data();
    if (match.status === "cancelled") {
      throw new import_https6.HttpsError("failed-precondition", "Cannot submit score for a cancelled match.");
    }
    const payload = assertScorePayload(rawPayload, session.scoringMode);
    const winnerTeam = (0, import_domain5.deriveWinner)(payload, session.scoringMode);
    const teamAIds = match.teamAIds || match.teamA.map((p) => p.playerId);
    const teamBIds = match.teamBIds || match.teamB.map((p) => p.playerId);
    const allPlayerIds = [...teamAIds, ...teamBIds];
    const playerStatsRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/players/${id}`));
    const playerStatsDocs = await Promise.all(playerStatsRefs.map((ref) => transaction.get(ref)));
    const leaderboardRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/leaderboard/${id}`));
    const leaderboardDocs = await Promise.all(leaderboardRefs.map((ref) => transaction.get(ref)));
    const isEdit = match.status === "completed";
    const priorWinnerTeam = match.winnerTeam;
    const priorPayload = match.scorePayload;
    const updateStats = (docData, playerId, reverse = false) => {
      const stats = docData || { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
      const isTeamA = teamAIds.includes(playerId);
      const isWinner = reverse ? priorWinnerTeam === (isTeamA ? "A" : "B") : winnerTeam === (isTeamA ? "A" : "B");
      const src = reverse ? priorPayload : payload;
      const rawFor = isTeamA ? src?.teamAScore : src?.teamBScore;
      const rawAgainst = isTeamA ? src?.teamBScore : src?.teamAScore;
      const pFor = typeof rawFor === "number" ? rawFor : void 0;
      const pAgainst = typeof rawAgainst === "number" ? rawAgainst : void 0;
      const sign = reverse ? -1 : 1;
      const hasPoints = pFor !== void 0 && pAgainst !== void 0;
      return {
        ...stats,
        gamesPlayed: (stats.gamesPlayed || 0) + sign * 1,
        wins: (stats.wins || 0) + (isWinner ? sign * 1 : 0),
        losses: (stats.losses || 0) + (!isWinner ? sign * 1 : 0),
        pointsFor: (stats.pointsFor || 0) + (pFor !== void 0 ? sign * pFor : 0),
        pointsAgainst: (stats.pointsAgainst || 0) + (pAgainst !== void 0 ? sign * pAgainst : 0),
        pointDifference: (stats.pointDifference || 0) + (hasPoints ? sign * (pFor - pAgainst) : 0)
      };
    };
    const newStatsMap = /* @__PURE__ */ new Map();
    const newLbMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i];
      let pStats = playerStatsDocs[i]?.data() || {};
      let lbStats = leaderboardDocs[i]?.data() || {};
      if (isEdit) {
        pStats = updateStats(pStats, pid, true);
        lbStats = updateStats(lbStats, pid, true);
      }
      pStats = updateStats(pStats, pid, false);
      lbStats = updateStats(lbStats, pid, false);
      newStatsMap.set(pid, pStats);
      newLbMap.set(pid, lbStats);
    }
    transaction.update(matchRef, {
      scorePayload: payload,
      winnerTeam,
      status: "completed",
      isLocked: true,
      completedAt: import_firestore7.FieldValue.serverTimestamp()
    });
    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i];
      transaction.set(playerStatsRefs[i], newStatsMap.get(pid), { merge: true });
      transaction.set(leaderboardRefs[i], newLbMap.get(pid), { merge: true });
    }
    writeAudit(transaction, sessionId, {
      actorUid: request.auth.uid,
      action: isEdit ? "score_changed" : "score",
      details: { matchId, roundNumber, payload, winnerTeam }
    });
    return { success: true };
  });
});

// src/sessionLifecycle.ts
var import_https7 = require("firebase-functions/v2/https");
var import_firestore8 = require("firebase-admin/firestore");
var import_domain6 = __toESM(require_dist());
var updateSessionStatus = async (request, statusFrom, statusTo, actionLabel, additionalUpdates) => {
  if (!request.auth) throw new import_https7.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data?.sessionId, "sessionId");
  const db = (0, import_firestore8.getFirestore)();
  const isStart = statusTo === "active" && actionLabel === "session_started";
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const round1Ref = db.doc(`sessions/${sessionId}/rounds/round_1`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https7.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain6.canCreateSession, t);
    const round1Doc = isStart ? await t.get(round1Ref) : null;
    if (!statusFrom.includes(session.status)) {
      throw new import_https7.HttpsError("failed-precondition", `Cannot transition to ${statusTo} from ${session.status}.`);
    }
    if (isStart && !round1Doc.exists) {
      throw new import_https7.HttpsError("failed-precondition", "Generate a schedule before starting the session.");
    }
    const updates = { status: statusTo, ...additionalUpdates };
    t.update(sessionRef, updates);
    if (isStart) {
      t.update(round1Ref, { status: "in_progress" });
    }
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: actionLabel
    });
    return { success: true };
  });
};
var startSession = (0, import_https7.onCall)(
  { cors: true },
  (request) => updateSessionStatus(request, ["draft", "scheduled"], "active", "session_started", { currentRoundNumber: 1 })
);
var pauseSession = (0, import_https7.onCall)(
  { cors: true },
  (request) => updateSessionStatus(request, ["active"], "paused", "session_paused")
);
var resumeSession = (0, import_https7.onCall)(
  { cors: true },
  (request) => updateSessionStatus(request, ["paused"], "active", "session_resumed")
);
var completeSession = (0, import_https7.onCall)(
  { cors: true },
  (request) => updateSessionStatus(request, ["active", "paused"], "completed", "session_completed")
);

// src/advanceRound.ts
var import_https8 = require("firebase-functions/v2/https");
var import_firestore9 = require("firebase-admin/firestore");
var import_domain7 = __toESM(require_dist());
var advanceRound = (0, import_https8.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https8.HttpsError("unauthenticated", "Must be logged in.");
  const { sessionId, force } = request.data;
  if (!sessionId) throw new import_https8.HttpsError("invalid-argument", "sessionId is required.");
  const db = (0, import_firestore9.getFirestore)();
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https8.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain7.canAdvanceRound, t);
    if (session.status !== "active") {
      throw new import_https8.HttpsError("failed-precondition", "Session must be active to advance round.");
    }
    const currentRound = session.currentRoundNumber || 1;
    const currentRoundRef = db.doc(`sessions/${sessionId}/rounds/round_${currentRound}`);
    const nextRound = currentRound + 1;
    const nextRoundRef = db.doc(`sessions/${sessionId}/rounds/round_${nextRound}`);
    const matchesQuery = db.collection(`sessions/${sessionId}/rounds/round_${currentRound}/matches`);
    const matchesSnap = await t.get(matchesQuery);
    const nextRoundDoc = await t.get(nextRoundRef);
    const pendingMatches = matchesSnap.docs.filter((d) => {
      const data = d.data();
      return data.status === "scheduled" || data.status === "in_progress";
    });
    if (pendingMatches.length > 0 && !force) {
      return { needsConfirmation: true, pendingCount: pendingMatches.length };
    }
    for (const matchDoc of pendingMatches) {
      t.update(matchDoc.ref, { status: "cancelled", isLocked: true });
    }
    t.update(currentRoundRef, { status: "completed" });
    if (nextRoundDoc.exists) {
      t.update(nextRoundRef, { status: "in_progress" });
    }
    t.update(sessionRef, { currentRoundNumber: nextRound });
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: "round_advanced",
      details: { fromRound: currentRound, toRound: nextRound, forced: !!force }
    });
    return { success: true, nextRound };
  });
});

// src/updatePlayerStatus.ts
var import_https9 = require("firebase-functions/v2/https");
var import_firestore10 = require("firebase-admin/firestore");
var import_domain8 = __toESM(require_dist());
var VALID_STATUSES = /* @__PURE__ */ new Set([
  "active",
  "waiting",
  "left",
  "removed",
  "no_show"
]);
var updatePlayerStatus = (0, import_https9.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https9.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data.sessionId, "sessionId");
  const sessionPlayerId = assertString(request.data.sessionPlayerId, "sessionPlayerId");
  const status = assertEnum(request.data.status, "status", [...VALID_STATUSES]);
  const db = (0, import_firestore10.getFirestore)();
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https9.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain8.canManageSessionPlayers, t);
    const playerRef = db.doc(`sessions/${sessionId}/players/${sessionPlayerId}`);
    const playerDoc = await t.get(playerRef);
    if (!playerDoc.exists) throw new import_https9.HttpsError("not-found", "Session player not found.");
    const update = { status };
    if (status === "left" || status === "removed") {
      update.leftAt = import_firestore10.FieldValue.serverTimestamp();
    }
    t.update(playerRef, update);
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: "player/updated",
      details: { sessionPlayerId, status }
    });
    const rebalanceRecommended = session.status === "active" || session.status === "paused";
    return { success: true, rebalanceRecommended };
  });
});
var addLatePlayer = (0, import_https9.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https9.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data.sessionId, "sessionId");
  const playerId = assertString(request.data.playerId, "playerId");
  const displayName = assertString(request.data.displayName, "displayName");
  const skillLevel = request.data.skillLevel === void 0 ? "unknown" : (0, import_domain8.isSkillLevel)(request.data.skillLevel) ? request.data.skillLevel : assertEnum(request.data.skillLevel, "skillLevel", import_domain8.SKILL_LEVELS);
  const db = (0, import_firestore10.getFirestore)();
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https9.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain8.canManageSessionPlayers, t);
    if (session.status !== "active" && session.status !== "paused") {
      throw new import_https9.HttpsError("failed-precondition", "Session must be active or paused to add a late player.");
    }
    const playerRef = db.doc(`sessions/${sessionId}/players/${playerId}`);
    const existing = await t.get(playerRef);
    if (existing.exists) {
      throw new import_https9.HttpsError("already-exists", "Player is already in this session.");
    }
    const currentRound = session.currentRoundNumber || 1;
    const availableFromRound = currentRound + 1;
    t.set(playerRef, {
      playerId,
      displayName,
      skillLevel,
      status: "active",
      participantType: "registered_user",
      joinedAt: import_firestore10.FieldValue.serverTimestamp(),
      availableFromRound,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      sitOutCount: 0
    }, { merge: true });
    const lbRef = db.doc(`sessions/${sessionId}/leaderboard/${playerId}`);
    t.set(lbRef, {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      sitOutCount: 0
    }, { merge: true });
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: "player/added_late",
      details: { playerId, displayName, availableFromRound }
    });
    return { success: true, availableFromRound, rebalanceRecommended: true };
  });
});

// src/rebalanceSession.ts
var import_https10 = require("firebase-functions/v2/https");
var import_firestore12 = require("firebase-admin/firestore");
var import_domain10 = __toESM(require_dist());
var import_match_engine2 = __toESM(require_dist2());

// src/lib/locked.ts
var import_firestore11 = require("firebase-admin/firestore");
var import_domain9 = __toESM(require_dist());
function recomputeStatsFromLocked(lockedFull, scoringMode) {
  const stats = /* @__PURE__ */ new Map();
  const get = (pid) => stats.get(pid) ?? { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0, sitOutCount: 0 };
  for (const m of lockedFull) {
    if (m.status !== "completed") continue;
    let winnerTeam = null;
    if (m.scorePayload) {
      try {
        winnerTeam = (0, import_domain9.deriveWinner)(m.scorePayload, scoringMode);
      } catch {
        winnerTeam = null;
      }
    }
    if (winnerTeam === null) {
      console.warn(`recomputeStatsFromLocked: completed match ${m.matchId} has no valid score; crediting games only.`);
      for (const pid of [...m.teamAIds, ...m.teamBIds]) {
        const s = get(pid);
        stats.set(pid, { ...s, gamesPlayed: s.gamesPlayed + 1 });
      }
      continue;
    }
    const pFor = (isTeamA) => scoringMode === "points" ? (isTeamA ? m.scorePayload.teamAScore : m.scorePayload.teamBScore) ?? 0 : 0;
    const pAgainst = (isTeamA) => scoringMode === "points" ? (isTeamA ? m.scorePayload.teamBScore : m.scorePayload.teamAScore) ?? 0 : 0;
    for (const pid of m.teamAIds) {
      const s = get(pid);
      const isWin = winnerTeam === "A";
      const pf = pFor(true);
      const pa = pAgainst(true);
      stats.set(pid, {
        ...s,
        gamesPlayed: s.gamesPlayed + 1,
        wins: s.wins + (isWin ? 1 : 0),
        losses: s.losses + (isWin ? 0 : 1),
        pointsFor: s.pointsFor + pf,
        pointsAgainst: s.pointsAgainst + pa,
        pointDifference: s.pointDifference + (pf - pa),
        sitOutCount: s.sitOutCount
      });
    }
    for (const pid of m.teamBIds) {
      const s = get(pid);
      const isWin = winnerTeam === "B";
      const pf = pFor(false);
      const pa = pAgainst(false);
      stats.set(pid, {
        ...s,
        gamesPlayed: s.gamesPlayed + 1,
        wins: s.wins + (isWin ? 1 : 0),
        losses: s.losses + (isWin ? 0 : 1),
        pointsFor: s.pointsFor + pf,
        pointsAgainst: s.pointsAgainst + pa,
        pointDifference: s.pointDifference + (pf - pa),
        sitOutCount: s.sitOutCount
      });
    }
  }
  return stats;
}

// src/rebalanceSession.ts
var rebalanceSession = (0, import_https10.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https10.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data?.sessionId, "sessionId");
  const trigger = request.data?.trigger ?? "manual_rebalance";
  const uid = request.auth.uid;
  const db = (0, import_firestore12.getFirestore)();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const result = await db.runTransaction(async (t) => {
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https10.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(uid, session.groupId, import_domain10.canGenerateSchedule, t);
    if (session.status !== "active" && session.status !== "paused") {
      throw new import_https10.HttpsError("failed-precondition", "Session must be active or paused to rebalance.");
    }
    const playersSnap = await t.get(db.collection(`sessions/${sessionId}/players`));
    const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const roundsSnap = await t.get(db.collection(`sessions/${sessionId}/rounds`));
    const rounds = roundsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const matchesByRound = await Promise.all(
      roundsSnap.docs.map((rDoc) => t.get(db.collection(`sessions/${sessionId}/rounds/${rDoc.id}/matches`)))
    );
    const allMatches = matchesByRound.flatMap(
      (snap) => snap.docs.map((m) => ({ id: m.id, ref: m.ref, ...m.data() }))
    );
    const sitOutsSnap = await t.get(db.collection(`sessions/${sessionId}/sitOuts`));
    const elapsedRounds = rounds.filter(
      (r) => r.status === "completed" || r.status === "in_progress"
    ).length;
    const completedMatches = allMatches.filter((m) => m.status === "completed");
    const inProgressCount = allMatches.filter((m) => m.status === "in_progress").length;
    const lockedFull = completedMatches.map((m) => {
      const teamAIds = m.teamAIds || m.teamA.map((p) => p.playerId);
      const teamBIds = m.teamBIds || m.teamB.map((p) => p.playerId);
      return {
        matchId: m.id,
        status: "completed",
        roundNumber: m.roundNumber,
        courtId: m.courtId,
        teamA: teamAIds,
        teamB: teamBIds,
        teamAIds,
        teamBIds,
        scorePayload: m.scorePayload,
        winnerTeam: m.winnerTeam
      };
    });
    const lockedMatches = lockedFull.map((m) => ({
      roundNumber: m.roundNumber,
      courtId: m.courtId,
      teamA: m.teamA,
      teamB: m.teamB
    }));
    const recomputedStats = recomputeStatsFromLocked(lockedFull, session.scoringMode);
    const sitOutCounts = /* @__PURE__ */ new Map();
    for (const sDoc of sitOutsSnap.docs) {
      const d = sDoc.data();
      if (d.roundNumber <= elapsedRounds) {
        sitOutCounts.set(d.playerId, (sitOutCounts.get(d.playerId) ?? 0) + 1);
      }
    }
    const engineInput = mapSessionToEngineInput(session, players, rounds, [], "rebalance");
    engineInput.lockedMatches = lockedMatches;
    engineInput.elapsedRounds = elapsedRounds;
    const engineOutput = (0, import_match_engine2.generateSchedule)(engineInput);
    const removedPlayers = players.filter(
      (p) => p.status === "left" || p.status === "removed" || p.status === "no_show"
    );
    const lateJoiners = players.filter((p) => p.availableFromRound && p.availableFromRound > 1);
    const zero = { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
    for (const p of players) {
      const base = recomputedStats.get(p.id) ?? { ...zero, sitOutCount: 0 };
      const sitOutCount = sitOutCounts.get(p.id) ?? 0;
      const playerStats = { ...base, sitOutCount };
      t.set(db.doc(`sessions/${sessionId}/players/${p.id}`), playerStats, { merge: true });
      t.set(
        db.doc(`sessions/${sessionId}/leaderboard/${p.id}`),
        { ...playerStats, displayName: p.displayName },
        { merge: true }
      );
    }
    for (let i = 0; i < roundsSnap.docs.length; i++) {
      const rDoc = roundsSnap.docs[i];
      const roundData = rounds[i];
      if (roundData.roundNumber <= elapsedRounds || roundData.status !== "scheduled") continue;
      for (const mDoc of matchesByRound[i].docs) {
        if (mDoc.data().status === "scheduled") t.delete(mDoc.ref);
      }
      t.delete(rDoc.ref);
    }
    for (const sDoc of sitOutsSnap.docs) {
      if (sDoc.data().roundNumber > elapsedRounds) t.delete(sDoc.ref);
    }
    const displayName = (pid) => players.find((p) => p.id === pid)?.displayName || "Unknown";
    const roundRefs = /* @__PURE__ */ new Map();
    for (const match of engineOutput.matches) {
      if (match.roundNumber <= elapsedRounds) continue;
      let rRef = roundRefs.get(match.roundNumber);
      if (!rRef) {
        rRef = db.doc(`sessions/${sessionId}/rounds/round_${match.roundNumber}`);
        roundRefs.set(match.roundNumber, rRef);
        t.set(rRef, { roundNumber: match.roundNumber, status: "scheduled" });
      }
      const mRef = rRef.collection("matches").doc();
      t.set(mRef, {
        roundNumber: match.roundNumber,
        courtId: match.courtId,
        matchNumber: match.matchNumber,
        teamA: match.teamA.map((pid) => ({ playerId: pid, displayName: displayName(pid) })),
        teamB: match.teamB.map((pid) => ({ playerId: pid, displayName: displayName(pid) })),
        teamAIds: match.teamA,
        teamBIds: match.teamB,
        status: "scheduled",
        isLocked: false,
        sessionId
      });
    }
    for (const sitOut of engineOutput.sitOuts) {
      if (sitOut.roundNumber <= elapsedRounds) continue;
      t.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
    }
    t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
      mode: "rebalance",
      trigger,
      metadata: engineOutput.metadata,
      createdAt: import_firestore12.FieldValue.serverTimestamp(),
      createdBy: uid
    });
    writeAudit(t, sessionId, {
      actorUid: uid,
      action: "generation/rebalanced",
      details: { trigger, metadata: engineOutput.metadata }
    });
    const summary = (0, import_domain10.buildRebalanceSummary)({
      completedPreserved: completedMatches.length,
      inProgressPreserved: inProgressCount,
      removed: removedPlayers.map((p) => p.displayName),
      addedFromRound: lateJoiners.map((p) => ({ name: p.displayName, round: p.availableFromRound })),
      minGames: engineOutput.metadata.minGamesPerPlayer,
      maxGames: engineOutput.metadata.maxGamesPerPlayer
    });
    return { summary, metadata: engineOutput.metadata };
  });
  return { success: true, ...result };
});

// src/manualOverride.ts
var import_https11 = require("firebase-functions/v2/https");
var import_firestore13 = require("firebase-admin/firestore");
var import_domain11 = __toESM(require_dist());
var swapPlayers = (0, import_https11.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https11.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data.sessionId, "sessionId");
  const matchId = assertString(request.data.matchId, "matchId");
  const roundNumber = assertInt(request.data.roundNumber, "roundNumber");
  const outPlayerId = assertString(request.data.outPlayerId, "outPlayerId");
  const inPlayerId = assertString(request.data.inPlayerId, "inPlayerId");
  if (outPlayerId === inPlayerId) {
    throw new import_https11.HttpsError("invalid-argument", "outPlayerId and inPlayerId must differ.");
  }
  const db = (0, import_firestore13.getFirestore)();
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https11.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain11.canManageSessionPlayers, t);
    const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
    const matchDoc = await t.get(matchRef);
    if (!matchDoc.exists) throw new import_https11.HttpsError("not-found", "Match not found.");
    const match = matchDoc.data();
    if (match.status !== "scheduled" || match.isLocked) {
      throw new import_https11.HttpsError("failed-precondition", "Can only swap players in future scheduled matches.");
    }
    const inPlayerRef = db.doc(`sessions/${sessionId}/players/${inPlayerId}`);
    const inPlayerDoc = await t.get(inPlayerRef);
    if (!inPlayerDoc.exists) throw new import_https11.HttpsError("not-found", "Replacement player not found.");
    const inPlayer = inPlayerDoc.data();
    if (!(0, import_domain11.isSchedulable)(inPlayer.status)) {
      throw new import_https11.HttpsError("failed-precondition", "Replacement player is not available to play.");
    }
    const currentIds = [
      ...match.teamAIds || match.teamA.map((p) => p.playerId),
      ...match.teamBIds || match.teamB.map((p) => p.playerId)
    ];
    if (!currentIds.includes(outPlayerId)) {
      throw new import_https11.HttpsError("failed-precondition", "Outgoing player is not in this match.");
    }
    if (currentIds.includes(inPlayerId)) {
      throw new import_https11.HttpsError("failed-precondition", "Replacement player is already in this match.");
    }
    const newTeamA = match.teamA.map(
      (p) => p.playerId === outPlayerId ? { playerId: inPlayerId, displayName: inPlayer.displayName } : p
    );
    const newTeamB = match.teamB.map(
      (p) => p.playerId === outPlayerId ? { playerId: inPlayerId, displayName: inPlayer.displayName } : p
    );
    const newTeamAIds = newTeamA.map((p) => p.playerId);
    const newTeamBIds = newTeamB.map((p) => p.playerId);
    t.update(matchRef, {
      teamA: newTeamA,
      teamB: newTeamB,
      teamAIds: newTeamAIds,
      teamBIds: newTeamBIds
    });
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: "match/updated",
      details: { matchId, roundNumber, outPlayerId, inPlayerId, action: "swap" }
    });
    return { success: true };
  });
});
var moveMatch = (0, import_https11.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https11.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data.sessionId, "sessionId");
  const matchId = assertString(request.data.matchId, "matchId");
  const roundNumber = assertInt(request.data.roundNumber, "roundNumber");
  const courtId = assertString(request.data.courtId, "courtId");
  const db = (0, import_firestore13.getFirestore)();
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https11.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain11.canManageSessionPlayers, t);
    const court = (session.courts || []).find(
      (c) => (c.courtId || c.id) === courtId && c.isActive
    );
    if (!court) {
      throw new import_https11.HttpsError("failed-precondition", "Target court not found or inactive.");
    }
    const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
    const matchDoc = await t.get(matchRef);
    if (!matchDoc.exists) throw new import_https11.HttpsError("not-found", "Match not found.");
    const match = matchDoc.data();
    if (match.status !== "scheduled" || match.isLocked) {
      throw new import_https11.HttpsError("failed-precondition", "Can only move future scheduled matches.");
    }
    t.update(matchRef, { courtId, courtName: court.name });
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: "match/updated",
      details: { matchId, roundNumber, courtId, action: "move" }
    });
    return { success: true };
  });
});
var disableCourt = (0, import_https11.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https11.HttpsError("unauthenticated", "Must be logged in.");
  const sessionId = assertString(request.data.sessionId, "sessionId");
  const courtId = assertString(request.data.courtId, "courtId");
  const db = (0, import_firestore13.getFirestore)();
  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new import_https11.HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data();
    await requireGroupRole(request.auth.uid, session.groupId, import_domain11.canManageSessionPlayers, t);
    const courts = session.courts || [];
    const courtIdx = courts.findIndex((c) => (c.courtId || c.id) === courtId);
    if (courtIdx === -1) {
      throw new import_https11.HttpsError("not-found", "Court not found in session.");
    }
    const updatedCourts = courts.map(
      (c, i) => i === courtIdx ? { ...c, isActive: false } : c
    );
    t.update(sessionRef, { courts: updatedCourts });
    writeAudit(t, sessionId, {
      actorUid: request.auth.uid,
      action: "court/disabled",
      details: { courtId }
    });
    return { success: true, rebalanceRecommended: true };
  });
});

// src/groups.ts
var import_auth9 = require("firebase-admin/auth");
var import_firestore14 = require("firebase-admin/firestore");
var import_https12 = require("firebase-functions/v2/https");
var import_domain12 = __toESM(require_dist());
function assertAssignableRole(value) {
  if (value === "member" || value === "organiser") return value;
  throw new import_https12.HttpsError("invalid-argument", "role must be member or organiser");
}
async function findUserIdByEmail(emailLower) {
  const db = (0, import_firestore14.getFirestore)();
  const byEmailLower = await db.collection("users").where("emailLower", "==", emailLower).limit(1).get();
  if (!byEmailLower.empty) return byEmailLower.docs[0].id;
  const byEmail = await db.collection("users").where("email", "==", emailLower).limit(1).get();
  if (!byEmail.empty) return byEmail.docs[0].id;
  try {
    const user = await (0, import_auth9.getAuth)().getUserByEmail(emailLower);
    return user.uid;
  } catch {
    return null;
  }
}
var addGroupMemberByEmail = (0, import_https12.onCall)({ cors: true }, async (req) => {
  if (!req.auth) throw new import_https12.HttpsError("unauthenticated", "Must be signed in");
  const groupId = assertString(req.data?.groupId, "groupId");
  const email = assertString(req.data?.email, "email").trim().toLowerCase();
  const role = assertAssignableRole(req.data?.role);
  if (!email.includes("@")) {
    throw new import_https12.HttpsError("invalid-argument", "Enter a valid email address");
  }
  await requireGroupRole(req.auth.uid, groupId, import_domain12.canManageGroup);
  const userId = await findUserIdByEmail(email);
  if (!userId) {
    throw new import_https12.HttpsError("not-found", "User must sign up before you can add them to this team.");
  }
  const db = (0, import_firestore14.getFirestore)();
  const memberRef = db.doc(`groups/${groupId}/members/${userId}`);
  const groupRef = db.doc(`groups/${groupId}`);
  await db.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberRef);
    const existingRole = memberSnap.exists ? memberSnap.data().role : null;
    if (existingRole === "owner") {
      throw new import_https12.HttpsError("failed-precondition", "Team owner role can only be managed by a super admin.");
    }
    tx.set(memberRef, {
      userId,
      email,
      role,
      createdAt: memberSnap.exists ? memberSnap.data()?.createdAt ?? import_firestore14.FieldValue.serverTimestamp() : import_firestore14.FieldValue.serverTimestamp(),
      updatedAt: import_firestore14.FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(groupRef, {
      memberIds: import_firestore14.FieldValue.arrayUnion(userId),
      updatedAt: import_firestore14.FieldValue.serverTimestamp()
    });
  });
  return { userId, role };
});

// src/scoreLink.ts
var import_https13 = require("firebase-functions/v2/https");
var import_firestore15 = require("firebase-admin/firestore");
var import_domain13 = __toESM(require_dist());
var getScoreLinkData = (0, import_https13.onCall)({ cors: true, invoker: "public" }, async (request) => {
  const rawCode = assertString(request.data?.scoreCode, "scoreCode");
  const scoreCode = (0, import_domain13.normalizeJoinCode)(rawCode);
  const db = (0, import_firestore15.getFirestore)();
  const q = await db.collection("sessions").where("scoreCode", "==", scoreCode).where("scoreLinkEnabled", "==", true).limit(1).get();
  if (q.empty) throw new import_https13.HttpsError("not-found", "Invalid or disabled score link.");
  const sessionDoc = q.docs[0];
  const session = sessionDoc.data();
  const sessionId = sessionDoc.id;
  if (session.status !== "active") {
    return {
      sessionId,
      sessionName: session.name,
      sport: session.sport,
      scoringMode: session.scoringMode,
      currentRoundNumber: session.currentRoundNumber || 0,
      sessionStatus: session.status,
      courts: []
    };
  }
  const activeCourts = session.courts.filter((c) => c.isActive !== false);
  const matchSnaps = await Promise.all(
    activeCourts.map(
      (court) => db.collection(`sessions/${sessionId}/rounds/round_${session.currentRoundNumber}/matches`).where("courtId", "==", court.courtId).limit(1).get()
    )
  );
  const courts = activeCourts.map((court, i) => {
    const matchDoc = matchSnaps[i].docs[0];
    if (!matchDoc || matchDoc.data().status === "cancelled") {
      return { courtId: court.courtId, courtName: court.name, match: null };
    }
    const m = matchDoc.data();
    return {
      courtId: court.courtId,
      courtName: court.name,
      match: {
        matchId: matchDoc.id,
        teamA: m.teamA.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName
        })),
        teamB: m.teamB.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName
        })),
        status: m.status
      }
    };
  });
  return {
    sessionId,
    sessionName: session.name,
    sport: session.sport,
    scoringMode: session.scoringMode,
    currentRoundNumber: session.currentRoundNumber,
    sessionStatus: session.status,
    courts
  };
});
var submitScoreByLink = (0, import_https13.onCall)({ cors: true, invoker: "public" }, async (request) => {
  const rawCode = assertString(request.data?.scoreCode, "scoreCode");
  const courtId = assertString(request.data?.courtId, "courtId");
  const rawPayload = request.data?.payload;
  const ip = request.rawRequest?.ip || "unknown";
  const scoreCode = (0, import_domain13.normalizeJoinCode)(rawCode);
  await checkRateLimit(scoreCode, ip);
  const db = (0, import_firestore15.getFirestore)();
  const q = await db.collection("sessions").where("scoreCode", "==", scoreCode).where("scoreLinkEnabled", "==", true).limit(1).get();
  if (q.empty) throw new import_https13.HttpsError("not-found", "Invalid or disabled score link.");
  const sessionDoc = q.docs[0];
  const sessionId = sessionDoc.id;
  const session = sessionDoc.data();
  if (session.status !== "active") {
    throw new import_https13.HttpsError("failed-precondition", "Session is not active.");
  }
  const roundNumber = session.currentRoundNumber || 0;
  if (roundNumber === 0) throw new import_https13.HttpsError("failed-precondition", "No active round.");
  return db.runTransaction(async (transaction) => {
    const matchQuery = await transaction.get(db.collection(`sessions/${sessionId}/rounds/round_${roundNumber}/matches`).where("courtId", "==", courtId).limit(1));
    if (matchQuery.empty) {
      throw new import_https13.HttpsError("not-found", "No match found on that court.");
    }
    const matchDoc = matchQuery.docs[0];
    const match = matchDoc.data();
    const matchRef = matchDoc.ref;
    if (match.status === "completed") {
      throw new import_https13.HttpsError("failed-precondition", "Match already scored.");
    }
    if (match.status === "cancelled") {
      throw new import_https13.HttpsError("failed-precondition", "Match is cancelled.");
    }
    const payload = assertScorePayload(rawPayload, session.scoringMode);
    const winnerTeam = (0, import_domain13.deriveWinner)(payload, session.scoringMode);
    const teamAIds = match.teamAIds || match.teamA.map((p) => p.playerId);
    const teamBIds = match.teamBIds || match.teamB.map((p) => p.playerId);
    const allPlayerIds = [...teamAIds, ...teamBIds];
    const playerStatsRefs = allPlayerIds.map(
      (id) => db.doc(`sessions/${sessionId}/players/${id}`)
    );
    const leaderboardRefs = allPlayerIds.map(
      (id) => db.doc(`sessions/${sessionId}/leaderboard/${id}`)
    );
    const [playerStatsDocs, leaderboardDocs] = await Promise.all([
      Promise.all(playerStatsRefs.map((ref) => transaction.get(ref))),
      Promise.all(leaderboardRefs.map((ref) => transaction.get(ref)))
    ]);
    const updateStats = (docData, playerId) => {
      const stats = docData || {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0
      };
      const isTeamA = teamAIds.includes(playerId);
      const isWinner = winnerTeam === (isTeamA ? "A" : "B");
      const rawFor = isTeamA ? payload.teamAScore : payload.teamBScore;
      const rawAgainst = isTeamA ? payload.teamBScore : payload.teamAScore;
      const pFor = typeof rawFor === "number" ? rawFor : void 0;
      const pAgainst = typeof rawAgainst === "number" ? rawAgainst : void 0;
      const hasPoints = pFor !== void 0 && pAgainst !== void 0;
      return {
        ...stats,
        gamesPlayed: (stats.gamesPlayed || 0) + 1,
        wins: (stats.wins || 0) + (isWinner ? 1 : 0),
        losses: (stats.losses || 0) + (!isWinner ? 1 : 0),
        pointsFor: (stats.pointsFor || 0) + (pFor !== void 0 ? pFor : 0),
        pointsAgainst: (stats.pointsAgainst || 0) + (pAgainst !== void 0 ? pAgainst : 0),
        pointDifference: (stats.pointDifference || 0) + (hasPoints ? pFor - pAgainst : 0)
      };
    };
    transaction.update(matchRef, {
      scorePayload: payload,
      winnerTeam,
      status: "completed",
      isLocked: true,
      completedAt: import_firestore15.FieldValue.serverTimestamp()
    });
    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i];
      transaction.set(playerStatsRefs[i], updateStats(playerStatsDocs[i]?.data(), pid), { merge: true });
      transaction.set(leaderboardRefs[i], updateStats(leaderboardDocs[i]?.data(), pid), { merge: true });
    }
    writeAudit(transaction, sessionId, {
      actorUid: "court_link",
      action: "score",
      details: { matchId: matchDoc.id, roundNumber, courtId, payload, winnerTeam, source: "court_link", ip }
    });
    const courtName = session.courts.find((c) => c.courtId === courtId)?.name ?? courtId;
    return { success: true, courtName, winnerTeam };
  });
});

// src/groupInvite.ts
var import_https14 = require("firebase-functions/v2/https");
var import_firestore16 = require("firebase-admin/firestore");
var import_domain14 = __toESM(require_dist());
var joinGroupByInvite = (0, import_https14.onCall)({ cors: true }, async (request) => {
  if (!request.auth) throw new import_https14.HttpsError("unauthenticated", "Must be signed in to join a group.");
  const rawCode = assertString(request.data?.inviteCode, "inviteCode");
  const inviteCode = (0, import_domain14.normalizeJoinCode)(rawCode);
  const uid = request.auth.uid;
  const db = (0, import_firestore16.getFirestore)();
  const q = await db.collection("groups").where("groupInviteCode", "==", inviteCode).limit(1).get();
  if (q.empty) throw new import_https14.HttpsError("not-found", "Invite link is no longer valid.");
  const groupDoc = q.docs[0];
  const groupId = groupDoc.id;
  const memberRef = db.doc(`groups/${groupId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  if (memberSnap.exists) {
    return { groupId, role: memberSnap.data().role };
  }
  await db.runTransaction(async (t) => {
    const groupRef = db.doc(`groups/${groupId}`);
    t.set(memberRef, {
      userId: uid,
      role: "member",
      createdAt: import_firestore16.FieldValue.serverTimestamp(),
      updatedAt: import_firestore16.FieldValue.serverTimestamp()
    });
    t.update(groupRef, {
      memberIds: import_firestore16.FieldValue.arrayUnion(uid),
      updatedAt: import_firestore16.FieldValue.serverTimestamp()
    });
  });
  return { groupId, role: "member" };
});

// src/index.ts
(0, import_app.initializeApp)();
(0, import_v2.setGlobalOptions)({ region: "europe-west2", maxInstances: 10 });
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addGroupMemberByEmail,
  addLatePlayer,
  advanceRound,
  approveJoinRequest,
  completeSession,
  disableCourt,
  generateSchedule,
  getScoreLinkData,
  joinGroupByInvite,
  moveMatch,
  pauseSession,
  rebalanceSession,
  rejectJoinRequest,
  requestJoin,
  resumeSession,
  startSession,
  submitScore,
  submitScoreByLink,
  swapPlayers,
  updatePlayerStatus
});
