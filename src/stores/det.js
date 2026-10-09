import { writable, derived, get } from "svelte/store";
import { gsap } from "$utils/gsap.js";

/**
 * Determinant section state.
 * entries = [a, b, c, d] for the matrix [[a, b], [c, d]];
 * the columns are (a, c) and (b, d) — where the basis vectors land.
 */

const IDENTITY = [1, 0, 0, 1];

export const detStep = writable(0); // 0 = outside the det story, 1..5 story steps, 6 = try-it sandbox
export const detFrom = writable([...IDENTITY]);
export const detTarget = writable([...IDENTITY]);
export const detPlayhead = writable(1); // 1 = resting at target
export const detPlaying = writable(false);
export const detSpeed = writable(1);
export const detGuideStep = writable(0); // guided walkthrough beat (0..3)
export const detGuideCollapsed = writable(false);
export const detResetTick = writable(0); // bumped whenever entries snap (reset)

/**
 * Presentation scalars shared between the step engine (DetEngine, DOM-level)
 * and the in-canvas visuals (DetScene). The engine tweens these; DetScene
 * reads them reactively — the split keeps the whole story engine alive even
 * on loads where the WebGL canvas never initializes (RUN 48, G-A).
 */
export const detFx = writable({
	storyReveal: 0, // 0 = shapes hidden, 1 = fully revealed (entry/exit cinematic)
	stepInT: 1, // arrows/labels/spheres entrance (group scale + label fade)
	edgeDrawT: 1, // edge draw-on progress (0 = no edges, 1 = full loop)
	fillT: 0, // 0 = cyan, 1 = pink
	collapsedT: 0, // 0 = fill visible, 1 = collapsed (fill faded out)
	imgT: 0, // image spheres + ambiguity callout fade
	hoverPt: null, // hover ghost position on the story plane while asking
	approachT: 0 // fire 76 (H4): the det-intro hand-off scalar (e1/e2 arrows +
	// the square outline draw on with it as the section approaches at step 0)
});

export function setDetFx(patch) {
	detFx.update((o) => ({ ...o, ...patch }));
}

/** P3.1: the try-it's layout toggle — true = full-canvas sandbox (default),
 *  false = split view with the det-st-6 text in the reading column. The
 *  engine applies it; the floating toggle button flips it. */
export const detTryExpanded = writable(true);

/** fire 81 (I5a): true while the det-approach hand-off is engaged (the det
 *  section is approaching at detStep 0) — Arcade's narrative-vector gates
 *  read it so the intro clears to just the grid + the e1/e2 construction. */
export const detApproached = writable(false);

export const detEntries = derived(
	[detFrom, detTarget, detPlayhead],
	([f, t, p]) => f.map((v, i) => v + (t[i] - v) * p)
);

export const detValue = derived(detEntries, ([a, b, c, d]) => a * d - b * c);
export const detArea = derived(detValue, (v) => Math.abs(v));
export const detCollapsed = derived(detValue, (v) => Math.abs(v) < 0.05);
export const detFlipped = derived(detValue, (v) => v < -0.05);

let tween = null;
let speedAtStart = 1;

// fire 105 (the "matrix stuck at 1 0 0 1" report): every morph rides gsap's
// rAF ticker — on a starved renderer (throttled/occluded tab, slow machine)
// the playhead freezes at 0 while detPlaying stays true, and a prediction
// round's reveal never appears: the world sits at the identity the whole
// round. The engine's poll watchdog only covers the try-it (detStep 6), so
// morphs get their own wall-clock stall watch here (timers are the one clock
// that always runs — the house pattern): if the playhead stops advancing for
// ~1.2s while a tween is nominally live, complete it synthetically.
let stallWatch = null;
let stallPh = -1;
function disarmStallWatch() {
	if (stallWatch) {
		clearInterval(stallWatch);
		stallWatch = null;
	}
}
function armStallWatch() {
	disarmStallWatch();
	stallPh = get(detPlayhead);
	stallWatch = setInterval(() => {
		if (!tween || !tween.isActive() || tween.paused() || !get(detPlaying)) {
			disarmStallWatch();
			return;
		}
		const ph = get(detPlayhead);
		if (Math.abs(ph - stallPh) > 1e-5) {
			stallPh = ph;
			return;
		}
		disarmStallWatch();
		skipDet();
	}, 400);
}

function startTween(duration) {
	if (tween) tween.kill();
	speedAtStart = get(detSpeed);
	detPlayhead.set(0);
	detPlaying.set(true);
	tween = gsap.to(
		{ t: 0 },
		{
			t: 1,
			duration: Math.max(0.01, duration / speedAtStart),
			ease: "power2.inOut",
			onUpdate() {
				detPlayhead.set(this.targets()[0].t);
			},
			onComplete() {
				detPlaying.set(false);
				disarmStallWatch();
			}
		}
	);
	armStallWatch();
}

/** Morph the current shape toward a new matrix. */
export function setDetTarget(entries, { duration = 1.6 } = {}) {
	logDetWrite("setDetTarget", entries);
	detFrom.set(get(detEntries));
	detTarget.set([...entries]);
	startTween(duration);
}

/** Replay the current target, starting from the identity. */
export function replayDet(duration = 1.6) {
	detFrom.set([...IDENTITY]);
	startTween(duration);
}

export function playDet() {
	if (tween && tween.progress() < 1 && tween.paused()) {
		tween.resume();
		detPlaying.set(true);
		armStallWatch();
	} else {
		replayDet();
	}
}

export function pauseDet() {
	if (tween) {
		tween.pause();
		detPlaying.set(false);
		disarmStallWatch();
	}
}

/** Fire 72: the entry-state write log (DEV diagnostics) — every morph
 *  writer records its target + the caller frames, so the try-it entry's
 *  preemption names its writer on the next failing roll. */
export const detWriteLog = [];
function logDetWrite(kind, entries) {
	try {
		detWriteLog.push({
			t: Math.round((Date.now() % 1000000) / 100) / 10,
			kind,
			target: entries ? [...entries].join(",") : null,
			at: (new Error().stack || "")
				.split("\n")
				.slice(2, 4)
				.map((s) => s.trim().slice(0, 70))
				.join(" <- ")
		});
		if (detWriteLog.length > 24) detWriteLog.shift();
	} catch (e) {}
}

export function skipDet() {
	logDetWrite("skipDet", get(detTarget));
	disarmStallWatch();
	if (tween) tween.progress(1);
	detPlayhead.set(1);
	detPlaying.set(false);
}

/** Fire 50 (user: the story square should slide with the scroll "just like
 *  the original"): drive the morph directly from a scroll scrub instead of a
 *  time tween. Kills any running tween — the scrub owns the playhead while
 *  engaged; entries read from→to lerped at p. */
export function detScrubTo(fromM, toM, p) {
	logDetWrite("detScrubTo", toM);
	disarmStallWatch();
	if (tween) {
		tween.kill();
		tween = null;
	}
	detFrom.set([...fromM]);
	detTarget.set([...toM]);
	detPlayhead.set(Math.max(0, Math.min(1, p)));
	detPlaying.set(false);
}

/** True while a morph tween is mid-flight — the engine's repair checks this
 *  before snapping entries to a step matrix, so healthy-browser morphs are
 *  never cut short by the self-heal. */
export function detTweenActive() {
	return !!(tween && tween.isActive());
}

export function setDetSpeed(v) {
	detSpeed.set(v);
	if (tween && tween.isActive()) tween.timeScale(v / speedAtStart);
}

/** Snap entries instantly (no animation) — used when entering a chapter. */
export function resetToIdentity() {
	logDetWrite("resetToIdentity", IDENTITY);
	if (tween) tween.kill();
	detFrom.set([...IDENTITY]);
	detTarget.set([...IDENTITY]);
	detPlayhead.set(1);
	detPlaying.set(false);
	detResetTick.update((n) => n + 1);
}

/** fire 66 (FIX-D): marker/ghost cleanup without the entry snap — the
 * try-it ENTRY now animates the reset instead (setDetTarget in the engine),
 * but the scene's overlay cleanup (round markers, ghosts) must still run. */
export function clearDetMarks() {
	detResetTick.update((n) => n + 1);
}

/* ------------------------------------------------------------------ */
/* Prediction games (P2.3): mixed-mode rounds                          */
/* ------------------------------------------------------------------ */

const GAME_TOL = 0.01; // P2.2: clicks snap to the 0.5 grid (engine-side) and
// integer round matrices keep every answer on that grid, so a hit is an
// exact coordinate match — the tolerance only absorbs float error

// the guessable corners of the input square, named in the fire-78 I1 uniform
// P-numbering: P1 is the origin (fixed under any linear map — nothing to
// predict there), the square's corners are P2/P3/P4. Answers are exactly on
// the integer grid because the round matrices are integer
export const CORNERS = [
	{ name: "P2", point: [1, 0] }, // lands on the column-1 tip
	{ name: "P3", point: [1, 1] }, // lands on the far corner
	{ name: "P4", point: [0, 1] } // lands on the column-2 tip
];

const gameIdle = {
	mode: null, // null | "corners" | "inverse"
	flavor: null, // corners: "unit" | "shifted" | "collapse" — inverse: "standard" | "degenerate"
	status: "idle", // idle | asking | revealing (the animated truth, I4) | revealed
	round: null, // corners: { matrix, corners: [{name, point, answer}], index, results }
	// inverse: { matrix, point, target, degenerate, preimages }
	guess: null, // latest clicked point
	pending: null, // fire 78 (H5): the plotted-but-not-accepted point — a click
	// PLOTS (moves) this, the Accept button commits it as the guess
	result: null, // latest check — drives the canvas markers
	streak: 0
};

export const detGame = writable({ ...gameIdle });

/** fire 78 (H5): plot (or move) the pending point for the asking round. */
export function setDetPending(pt) {
	detGame.update((g) => {
		if (g.status !== "asking" || !g.round) return g;
		return { ...g, pending: pt };
	});
}

/** fire 78 (H5): commit the pending plot as the round's guess (the Accept
 *  button) — the same submission path a direct click used to take. */
export function acceptPending() {
	const g = get(detGame);
	const pt = g.pending;
	if (g.status !== "asking" || !pt) return;
	detGame.set({ ...g, pending: null });
	if (g.mode === "inverse") submitGuess(pt);
	else submitCornerGuess(pt);
}

function randEntry() {
	return Math.round((Math.random() * 5 - 2.5)) ; // integer in [-2.5, 2.5] → -2..2
}

function det2([a, b, c, d]) {
	return a * d - b * c;
}

/** Random 2×2 with a non-degenerate determinant. */
function randomMatrix() {
	for (let i = 0; i < 50; i++) {
		const m = [randEntry(), randEntry(), randEntry(), randEntry()];
		const dt = det2(m);
		if (Math.abs(dt) >= 0.5) return { matrix: m, det: dt };
	}
	return { matrix: [2, 1, 0, 1], det: 2 };
}

/** Integer parallelogram for the "shifted" flavor: the input shape is this
 *  matrix's image of the unit square (never the identity — that IS "unit"). */
function randomShapeMatrix() {
	for (let i = 0; i < 50; i++) {
		const m = [randEntry(), randEntry(), randEntry(), randEntry()];
		if (Math.abs(det2(m)) < 1) continue;
		if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) continue;
		return m;
	}
	return [2, 0, 1, 1];
}

/** Rank-1 matrix: the whole plane collapses onto one line (det = 0). */
function collapsedMatrix() {
	// fire 104 (F8, the user: "each round its just showing same transformation
	// collapsing to the same line"): the old ranges (k in {1,2}, entries in
	// {-1,0,1}) produced a handful of near-identical lines. Widen both.
	const k = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
	const r = () => [-3, -2, -1, 0, 1, 2, 3][Math.floor(Math.random() * 7)];
	const col = [r(), r()];
	if (col[0] === 0 && col[1] === 0) col[0] = 1;
	// columns (a,c) and (b,d): make (b,d) = k·(a,c)
	return [col[0], k * col[0], col[1], k * col[1]];
}

function mul(m, p) {
	return [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
}

function matMul(A, B) {
	// 2×2 product A·B in [a, b, c, d] (columns (a,c) and (b,d)) notation
	return [
		A[0] * B[0] + A[1] * B[2],
		A[0] * B[1] + A[1] * B[3],
		A[2] * B[0] + A[3] * B[2],
		A[2] * B[1] + A[3] * B[3]
	];
}

/**
 * Start a corner round (P2.3): the input shape's corners A, B, C are asked
 * in turn — the user clicks where each one lands. The flavor picks the input
 * shape: "unit" (the plain square), "shifted" (a parallelogram S·square —
 * the displayed matrix becomes M·S so its image stays integer), or
 * "collapse" (det = 0, every answer lands on one line). Answers are always
 * the displayed matrix's image of the unit corners, so they stay exactly on
 * the grid. Fixed args are for deterministic QA.
 */
export function startCornerRound(fixed = {}) {
	// let, not const: the unit branch normalizes flavor in-place — a const
	// here threw "Assignment to constant variable" on every unit round
	// (1/3 of rounds silently failed to start; fire 43 QA caught it)
	let flavor = fixed.flavor ?? ["unit", "shifted", "collapse"][Math.floor(Math.random() * 3)];
	let matrix;
	let input;
	for (let tries = 0; tries < 60; tries++) {
		if (flavor === "shifted") {
			const S = randomShapeMatrix();
			const M = randomMatrix().matrix;
			matrix = matMul(M, S);
			input = [mul(S, [1, 0]), mul(S, [1, 1]), mul(S, [0, 1])];
		} else if (flavor === "collapse") {
			matrix = collapsedMatrix();
			input = [[1, 0], [1, 1], [0, 1]];
		} else {
			flavor = "unit";
			matrix = randomMatrix().matrix;
			input = [[1, 0], [1, 1], [0, 1]];
		}
		// keep every answer comfortably on-screen (the story span is ±4.2 and
		// the result chips need headroom for their labels)
		const answers = [[1, 0], [1, 1], [0, 1]].map((u) => mul(matrix, u));
		if (answers.every(([x, y]) => Math.hypot(x, y) <= 3)) break;
	}
	const corners = CORNERS.map((c, i) => ({
		name: c.name,
		point: input[i],
		answer: mul(matrix, [[1, 0], [1, 1], [0, 1]][i])
	}));
	// fire 103 (the user's design): the answer must not be visible during the
	// ask — the scene shows the UNTRANSFORMED world (identity) while guessing;
	// the morph to the round matrix plays only at the Accept (the reveal)
	setDetTarget([1, 0, 0, 1], { duration: 0.6 });
	skipDet();
	detGame.set({
		...gameIdle,
		mode: "corners",
		flavor,
		status: "asking",
		round: { matrix, corners, index: 0, results: [] },
		streak: get(detGame).streak
	});
}

/** Submit a clicked guess for the currently-asked corner (grid coords).
 *  Fire 80 (I4): the submission enters a REVEALING phase — the scene animates
 *  the true landing from the asked point (DetScene's reveal dot), the panel
 *  shows the per-point verdict, and the next point auto-advances after a
 *  beat (no click needed); the summary banner only after the last point. */
const REVEAL_MS = 1800;

export function submitCornerGuess(g) {
	const game = get(detGame);
	if (game.status !== "asking" || !game.round || game.mode !== "corners") return;
	const corner = game.round.corners[game.round.index];
	const hit = Math.hypot(g[0] - corner.answer[0], g[1] - corner.answer[1]) <= GAME_TOL;
	const results = [
		...game.round.results,
		{ name: corner.name, type: hit ? "correct" : "wrong", guess: g, answer: corner.answer }
	];
	const done = results.length === game.round.corners.length;
	// fire 103: THE REVEAL — the transformation animates in only now that
	// the guess is committed; the player watches where things actually land
	setDetTarget(game.round.matrix, { duration: 0.9 });
	detGame.set({
		...game,
		pending: null,
		guess: g,
		result: { name: corner.name, type: hit ? "correct" : "wrong", answer: corner.answer },
		round: { ...game.round, index: results.length, results },
		// "revealing": the truth is on the table but the round has not moved on
		status: done ? "revealed" : "revealing",
		streak: done
			? results.every((r) => r.type === "correct")
				? game.streak + 1
				: 0
			: game.streak
	});
	if (!done) {
		// auto-advance: the timer is the one clock that always runs (the house
		// pattern). Guarded — a quit/reset mid-reveal leaves status != revealing
		const expected = results.length;
		setTimeout(() => {
			detGame.update((cur) => {
				if (
					cur.status !== "revealing" ||
					!cur.round ||
					cur.round.results.length !== expected
				) {
					return cur;
				}
				return { ...cur, status: "asking" };
			});
			// fire 103: the next ask shows the untransformed world again —
			// the answers must not stay readable between points
			setDetTarget([1, 0, 0, 1], { duration: 0.5 });
		}, REVEAL_MS);
	}
}

/**
 * Start an inverse round (P2.3, ~30% of the mix): a marked point lands
 * somewhere and the user clicks where it CAME FROM. With det = 0 the round
 * is degenerate — several origins share the image, so any click reveals the
 * ambiguity instead of a verdict (the professor's P1-feedback point). The
 * origin point sits on the 0.5 grid so a snapped click can hit exactly.
 */
function startInverseRound(fixed = {}) {
	const degenerate = fixed.degenerate ?? Math.random() < 0.4;
	let matrix, point, target;
	for (let tries = 0; tries < 40; tries++) {
		matrix = degenerate ? collapsedMatrix() : randomMatrix().matrix;
		point = [0.5 * (1 + Math.floor(Math.random() * 3)), 0.5 * (1 + Math.floor(Math.random() * 3))];
		target = mul(matrix, point);
		if (Math.hypot(target[0], target[1]) <= 2.5) break;
	}
	const preimages = degenerate ? preimagesOf(matrix, point) : null;
	// fire 103: identity while asking (the reveal morphs at Accept)
	setDetTarget([1, 0, 0, 1], { duration: 0.6 });
	skipDet();
	detGame.set({
		...gameIdle,
		mode: "inverse",
		flavor: degenerate ? "degenerate" : "standard",
		status: "asking",
		round: { matrix, point, target, degenerate, preimages },
		streak: get(detGame).streak
	});
}

/** Exact preimages of `point` along the null space, bounded to the square —
 *  they must remain EXACT preimages (clamping coordinates would break that). */
function preimagesOf(matrix, point) {
	const n = [-matrix[1], matrix[0]];
	const len = Math.hypot(n[0], n[1]) || 1;
	const u = [n[0] / len, n[1] / len];
	let tLo = -10;
	let tHi = 10;
	for (let i = 0; i < 2; i++) {
		if (u[i] > 1e-6) {
			tLo = Math.max(tLo, (0.05 - point[i]) / u[i]);
			tHi = Math.min(tHi, (0.95 - point[i]) / u[i]);
		} else if (u[i] < -1e-6) {
			tLo = Math.max(tLo, (0.95 - point[i]) / u[i]);
			tHi = Math.min(tHi, (0.05 - point[i]) / u[i]);
		}
	}
	if (tLo > tHi) {
		tLo = 0;
		tHi = 0;
	}
	return [
		point,
		[point[0] + (tLo + (tHi - tLo) * 0.25) * u[0], point[1] + (tLo + (tHi - tLo) * 0.25) * u[1]],
		[point[0] + (tLo + (tHi - tLo) * 0.75) * u[0], point[1] + (tLo + (tHi - tLo) * 0.75) * u[1]]
	];
}

/** Submit a clicked guess for an inverse round (grid coords). */
export function submitGuess(g) {
	const game = get(detGame);
	if (game.status !== "asking" || !game.round || game.mode !== "inverse") return;
	const { matrix, point, target, degenerate } = game.round;
	// fire 104 (F7, the user: "for ambiguous case it did not [animate]"): the
	// inverse mode never got fire 103's reveal morph — the transformation now
	// animates in at submission for BOTH inverse branches (the degenerate
	// case visibly collapses onto the shared line, teaching the ambiguity)
	setDetTarget(matrix, { duration: 0.9 });
	if (degenerate) {
		// ill-posed: several origins share the image — the reveal teaches the
		// ambiguity instead of scoring a hit, and the streak is untouched
		detGame.set({
			...game,
			guess: g,
			status: "revealed",
			result: { type: "ambiguous", answer: target, preimages: game.round.preimages }
		});
		return;
	}
	const img = mul(matrix, g);
	const hit = Math.hypot(img[0] - target[0], img[1] - target[1]) <= GAME_TOL;
	detGame.set({
		...game,
		guess: g,
		status: "revealed",
		result: { type: hit ? "correct" : "wrong", answer: point },
		streak: hit ? game.streak + 1 : 0
	});
}

/**
 * Start a round (P2.3 mixed mode): inverse flavor ~30% of the time, else a
 * forward corner round over the unit square, a shifted parallelogram, or a
 * collapse. fixed.mode pins the flavor for deterministic QA.
 */
export function startRound(fixed = {}) {
	if (fixed.mode === "inverse" || (!fixed.mode && Math.random() < 0.3)) {
		startInverseRound(fixed);
		return;
	}
	startCornerRound(fixed);
}

export function endRound() {
	// full idle reset (mode/flavor included): every mode-gated canvas marker
	// keys off g.round/g.mode, so dropping them here guarantees the board is
	// clean after a quit — no stale rings/chips from the ended round
	detGame.set({ ...gameIdle, streak: get(detGame).streak });
}

/** Convert click position (CSS pixels inside the canvas box) to grid coords. */
export const GAME_TOL_VALUE = GAME_TOL;
