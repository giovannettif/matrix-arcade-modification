import { writable, derived, get } from "svelte/store";
import { gsap } from "$utils/gsap.js";

/**
 * Determinant section state.
 * entries = [a, b, c, d] for the matrix [[a, b], [c, d]];
 * the columns are (a, c) and (b, d) — where the basis vectors land.
 */

const IDENTITY = [1, 0, 0, 1];

export const detStep = writable(1); // 1..4, driven by scroll
export const detFrom = writable([...IDENTITY]);
export const detTarget = writable([...IDENTITY]);
export const detPlayhead = writable(1); // 1 = resting at target
export const detPlaying = writable(false);
export const detSpeed = writable(1);
export const detGuideStep = writable(0); // guided walkthrough beat (0..3)
export const detGuideCollapsed = writable(false);
export const detResetTick = writable(0); // bumped whenever entries snap (reset)

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
			}
		}
	);
}

/** Morph the current shape toward a new matrix. */
export function setDetTarget(entries, { duration = 1.6 } = {}) {
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
	} else {
		replayDet();
	}
}

export function pauseDet() {
	if (tween) {
		tween.pause();
		detPlaying.set(false);
	}
}

export function skipDet() {
	if (tween) tween.progress(1);
	detPlayhead.set(1);
	detPlaying.set(false);
}

export function setDetSpeed(v) {
	detSpeed.set(v);
	if (tween && tween.isActive()) tween.timeScale(v / speedAtStart);
}

/** Snap entries instantly (no animation) — used when entering a chapter. */
export function resetToIdentity() {
	if (tween) tween.kill();
	detFrom.set([...IDENTITY]);
	detTarget.set([...IDENTITY]);
	detPlayhead.set(1);
	detPlaying.set(false);
	detResetTick.update((n) => n + 1);
}

/* ------------------------------------------------------------------ */
/* Prediction games (chapter 3)                                        */
/* ------------------------------------------------------------------ */

const GAME_TOL = 0.3; // click tolerance in grid units

const gameIdle = {
	mode: null, // null | "forward" | "inverse"
	status: "idle", // idle | asking | revealed
	round: null, // { matrix, point, target, preimages, degenerate }
	guess: null, // [x, y] clicked by the user
	result: null, // { type: "correct" | "wrong" | "ambiguous", answer, preimages }
	streak: 0
};

export const detGame = writable({ ...gameIdle });

function randUnit() {
	// point inside the unit square, away from the edges
	return Math.round((0.15 + Math.random() * 0.7) * 20) / 20;
}

function randEntry() {
	return Math.round((Math.random() * 5 - 2.5)) ; // integer in [-2.5, 2.5] → -2..2
}

function det2([a, b, c, d]) {
	return a * d - b * c;
}

/** Random 2×2 with a non-degenerate determinant, biased by category. */
function randomMatrix() {
	for (let i = 0; i < 50; i++) {
		const m = [randEntry(), randEntry(), randEntry(), randEntry()];
		const dt = det2(m);
		if (Math.abs(dt) >= 0.5) return { matrix: m, det: dt };
	}
	return { matrix: [2, 1, 0, 1], det: 2 };
}

/** Near-collapsed matrix: second column is a multiple of the first. */
function collapsedMatrix() {
	const k = Math.random() < 0.5 ? 1 : 2;
	const r = () => [-1, 0, 1][Math.floor(Math.random() * 3)];
	const col = [r(), r()];
	if (col[0] === 0 && col[1] === 0) col[0] = 1;
	// columns (a,c) and (b,d): make (b,d) = k·(a,c)
	return { matrix: [col[0], k * col[0], col[1], k * col[1]], det: 0 };
}

function mul(m, p) {
	return [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
}

/**
 * Start a prediction round.
 * forward: "where does the highlighted point land?"
 * inverse: "where did the marked point come from?" — with det ≈ 0 this is
 *          ill-posed: multiple origins map to the same image (the point of
 *          the professor's feedback on the P1 proposal).
 * Fixed matrix/point arguments are for deterministic QA only.
 */
export function startRound(mode, fixed = {}) {
	const degenerate = mode === "inverse" && (fixed.degenerate ?? Math.random() < 0.4);
	let matrix, det, point, target, preimages;
	if (mode === "forward") {
		({ matrix } = fixed.matrix ? { matrix: fixed.matrix } : randomMatrix());
		point = fixed.point ?? [randUnit(), randUnit()];
		target = mul(matrix, point);
	} else if (degenerate) {
		({ matrix } = fixed.matrix ? { matrix: fixed.matrix } : collapsedMatrix());
		// pick a point whose image stays on screen (|target| ≤ 2.3)
		for (let i = 0; i < 30; i++) {
			point = [randUnit(), randUnit()];
			target = mul(matrix, point);
			if (Math.hypot(target[0], target[1]) <= 2.3) break;
		}
		// preimages: point + t·u where u spans the null space; t is bounded so
		// every preimage stays inside the unit square (they must remain EXACT
		// preimages — clamping coordinates would break that)
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
		preimages = [
			point,
			[point[0] + (tLo + (tHi - tLo) * 0.25) * u[0], point[1] + (tLo + (tHi - tLo) * 0.25) * u[1]],
			[point[0] + (tLo + (tHi - tLo) * 0.75) * u[0], point[1] + (tLo + (tHi - tLo) * 0.75) * u[1]]
		];
	} else {
		({ matrix } = fixed.matrix ? { matrix: fixed.matrix } : randomMatrix());
		point = fixed.point ?? [randUnit(), randUnit()];
		target = mul(matrix, point);
	}
	setDetTarget(matrix, { duration: 0.9 });
	skipDet();
	detGame.set({
		...gameIdle,
		mode,
		status: "asking",
		round: { matrix, point, target, preimages, degenerate: mode === "inverse" && degenerate },
		streak: get(detGame).streak
	});
}

/** Submit a clicked guess (grid coordinates). */
export function submitGuess(g) {
	const game = get(detGame);
	if (game.status !== "asking" || !game.round) return;
	const { matrix, point, target, degenerate } = game.round;
	if (game.mode === "forward") {
		const answer = mul(matrix, point);
		const hit = Math.hypot(g[0] - answer[0], g[1] - answer[1]) <= GAME_TOL;
		detGame.set({
			...game,
			guess: g,
			status: "revealed",
			result: { type: hit ? "correct" : "wrong", answer },
			streak: hit ? game.streak + 1 : 0
		});
	} else {
		// inverse: the guess must map to the marked target
		const mapsToTarget = Math.hypot(...sub(mul(matrix, g), target)) <= GAME_TOL + 0.15;
		if (degenerate) {
			// ill-posed: show several origins that all map to the target
			detGame.set({
				...game,
				guess: g,
				status: "revealed",
				result: { type: "ambiguous", answer: target, preimages: game.round.preimages }
			});
		} else {
			detGame.set({
				...game,
				guess: g,
				status: "revealed",
				result: { type: mapsToTarget ? "correct" : "wrong", answer: point },
				streak: mapsToTarget ? game.streak + 1 : 0
			});
		}
	}
}

function sub(a, b) {
	return [a[0] - b[0], a[1] - b[1]];
}

export function endRound() {
	detGame.set({ ...get(detGame), mode: null, status: "idle", round: null, guess: null, result: null });
}

/** Convert click position (CSS pixels inside the canvas box) to grid coords. */
export const GAME_TOL_VALUE = GAME_TOL;
