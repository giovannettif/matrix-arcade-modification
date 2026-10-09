import { writable, derived, get } from "svelte/store";
import { createMorph } from "./morphFactory.js";

/**
 * P5.1: state for the 3D determinant story + (in P5.2) its try-it.
 * Entries are the flat ROW-major 3×3 [a,b,c,d,e,f,g,h,i]; the matrix acts on
 * column vectors, so the columns — where the basis vectors land — are
 * (a,d,g), (b,e,h), (c,f,i). Same playhead morph mechanics as the 2D story
 * (via the shared factory), same store shapes where the dock/scene mirror
 * their 2D counterparts.
 */

export const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const det3Speed = writable(1);
const morph = createMorph(IDENTITY3, det3Speed);

export const det3From = morph.from;
export const det3Target = morph.target;
export const det3Playhead = morph.playhead;
export const det3Playing = morph.playing;
export const det3ResetTick = morph.resetTick;
export const det3Entries = morph.entries;
export const set3Target = morph.setTarget;
export const skip3Det = morph.skip;
export const play3Det = morph.play;
export const pause3Det = morph.pause;
export const det3TweenActive = morph.tweenActive;
/** fire 81 (I5b): drive the 3D morph from the station pin spans' scroll
 *  scrub (the det.js detScrubTo semantics via the shared factory). */
export const det3ScrubTo = morph.scrub;
/** Instant snap (chapter entry / deterministic QA) — bumps det3ResetTick. */
export function reset3ToIdentity() {
	morph.reset(IDENTITY3);
}
export function set3Speed(v) {
	morph.setSpeed(v);
}

/** Signed volume of the image parallelepiped = the 3×3 determinant. */
export const det3Value = derived(det3Entries, ([a, b, c, d, e, f, g, h, i]) =>
	a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
);
export const det3Volume = derived(det3Value, (v) => Math.abs(v));
export const det3Collapsed = derived(det3Value, (v) => Math.abs(v) < 0.05);
export const det3Flipped = derived(det3Value, (v) => v < -0.05);

/** The 3D story's step (0 = not engaged, 1..5 = the cube story beats). The
 *  3D try-it extends the machine in P5.2; F12's engine drives steps 0..5. */
export const det3dStep = writable(0);

/** Entrance scalars for the cube story (mirrors detFx for the 2D scene). */
export const det3Fx = writable({
	storyReveal: 0, // cube hidden → fully revealed (entry cinematic)
	edgeDrawT: 1, // 12-edge draw-on progress
	faceT: 1, // face fade-in (0 = wireframe only)
	stepInT: 1, // labels/spheres entrance
	imgT: 0 // sample-point images + ambiguity callout fade
});
export function set3DetFx(patch) {
	det3Fx.update((o) => ({ ...o, ...patch }));
}

/** Game state skeleton — P5.2 fills the rounds (unit cube / shifted shape /
 *  collapse + the floor-click guessing UI). Shape mirrors detGame so the dock
 *  and scene can share gating patterns from day one. */
export const game3Idle = {
	mode: null, // null | "corners" | "inverse" (inverse = P5.3 polish)
	flavor: null, // corners: "unit" | "shifted" | "collapse"
	status: "idle", // idle | asking | revealing (the animated truth, I4) | revealed
	round: null,
	guess: null, // the floor-click preview {x, y} — z comes from the slider
	result: null,
	streak: 0
};
export const det3Game = writable({ ...game3Idle });

/** Height of the floor-click guess (the dock's slider drives it). */
export const det3GuessZ = writable(1);

const GAME3_TOL = 0.01;

/** The guessable corners of the unit cube — fire-78 I1 P-numbering: P1 is
 *  the origin (maps to itself — excluded), P2..P8 the seven guessable
 *  corners (P2/P3/P4 the floor ring, P5 the top origin-side corner, P6/P7
 *  the top ring, P8 the top far corner). */
export const CORNERS3 = [
	{ name: "P2", point: [1, 0, 0] },
	{ name: "P3", point: [1, 1, 0] },
	{ name: "P4", point: [0, 1, 0] },
	{ name: "P5", point: [0, 0, 1] },
	{ name: "P6", point: [1, 0, 1] },
	{ name: "P7", point: [1, 1, 1] },
	{ name: "P8", point: [0, 1, 1] }
];

/** 3×3 matrix product (row-major flats). */
export function matMul3(A, B) {
	const [a, b, c, d, e, f, g, h, i] = A;
	const [j, k, l, m, n, o, p, q, r] = B;
	return [
		a * j + b * m + c * p, a * k + b * n + c * q, a * l + b * o + c * r,
		d * j + e * m + f * p, d * k + e * n + f * q, d * l + e * o + f * r,
		g * j + h * m + i * p, g * k + h * n + i * q, g * l + h * o + i * r
	];
}

/** 3×3 matrix × column vector. */
export function apply3(A, v) {
	const [a, b, c, d, e, f, g, h, i] = A;
	const [x, y, z] = v;
	return [a * x + b * y + c * z, d * x + e * y + f * z, g * x + h * y + i * z];
}

function ri(lo, hi) {
	return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Random integer 3×3 with entries in [−2, 2]. */
function random3Matrix() {
	return [ri(-2, 2), ri(-2, 2), ri(-2, 2), ri(-2, 2), ri(-2, 2), ri(-2, 2), ri(-2, 2), ri(-2, 2), ri(-2, 2)];
}

/** Rank-≤2 integer 3×3 (rows 2 and 3 are integer combos of row 1 → det 0). */
function collapsed3Matrix() {
	// fire 104 (F8): wider ranges so consecutive collapse rounds produce
	// visibly different planes, and guard the degenerate all-zero case
	const r1 = [ri(-3, 3), ri(-3, 3), ri(-3, 3)];
	const r2 = [ri(-3, 3), ri(-3, 3), ri(-3, 3)];
	if (r1.every((v) => v === 0) && r2.every((v) => v === 0)) r1[0] = 1;
	const k1 = ri(-2, 2);
	const k2 = ri(-2, 2);
	const r3 = [k1 * r1[0] + k2 * r2[0], k1 * r1[1] + k2 * r2[1], k1 * r1[2] + k2 * r2[2]];
	return [...r1, ...r2, ...r3];
}

const UNIT3_CORNER_VECS = CORNERS3.map((c) => c.point);

/**
 * P5.2: start a corner round on the cube. The input shape is the unit cube
 * ("unit"), a shifted parallelepiped ("shifted": integer S, the displayed
 * matrix becomes M·S so its image stays integer), or a collapsed one
 * ("collapse": det = 0). Four of the seven corners are asked, rotating per
 * round so consecutive rounds cover different corners.
 */
export function start3Round(fixed = {}) {
	const flavor = fixed.flavor ?? ["unit", "shifted", "collapse"][Math.floor(Math.random() * 3)];
	const rot = fixed.rotate ?? Math.floor(Math.random() * CORNERS3.length);
	let matrix;
	let input;
	for (let tries = 0; tries < 60; tries++) {
		if (flavor === "shifted") {
			const S = [ri(-1, 1), ri(-1, 1), ri(-1, 1), ri(-1, 1), ri(-1, 1), ri(-1, 1), ri(-1, 1), ri(-1, 1), ri(-1, 1)];
			const M = random3Matrix();
			matrix = matMul3(M, S);
			input = UNIT3_CORNER_VECS.map((u) => apply3(S, u));
		} else if (flavor === "collapse") {
			matrix = collapsed3Matrix();
			input = UNIT3_CORNER_VECS.map((u) => [...u]);
		} else {
			matrix = random3Matrix();
			input = UNIT3_CORNER_VECS.map((u) => [...u]);
		}
		// every asked answer stays comfortably in range for the dock chips
		const answers = UNIT3_CORNER_VECS.map((u) => apply3(matrix, u));
		if (answers.every((p) => p.every((v) => Math.abs(v) <= 3))) break;
	}
	const ordered = CORNERS3.map((c, i) => ({
		name: c.name,
		point: input[i],
		answer: apply3(matrix, UNIT3_CORNER_VECS[i])
	}));
	const subset = [0, 1, 2, 3].map((k) => ordered[(rot + k) % ordered.length]);
	// fire 103 (the 2D twin): the answer must not be visible during the ask —
	// the scene shows the UNTRANSFORMED cube while guessing; the morph to the
	// round matrix plays only at the Accept (the reveal)
	set3Target([1, 0, 0, 0, 1, 0, 0, 0, 1], { duration: 0.6 });
	skip3Det();
	det3Game.set({
		...game3Idle,
		mode: "corners",
		flavor,
		status: "asking",
		round: { matrix, corners: subset, index: 0, results: [] },
		guess: null,
		streak: get(det3Game).streak
	});
}

/** Record a floor-click preview point {x, y} for the asking round's ghost. */
export function set3Guess(pt) {
	det3Game.update((g) => {
		if (g.status !== "asking" || !g.round) return g;
		return { ...g, guess: { x: pt.x, y: pt.y } };
	});
}

/** Commit the guess (floor point + slider height) for the asked corner.
 *  Fire 80 (I4): the same REVEALING phase as the 2D game — the scene animates
 *  the true landing from the guess point, and the next corner auto-advances. */
const REVEAL3_MS = 1800;

export function submit3CornerGuess(pt3) {
	det3Game.update((g) => {
		if (g.status !== "asking" || g.mode !== "corners" || !g.round) return g;
		const corner = g.round.corners[g.round.index];
		const ok =
			Math.abs(pt3[0] - corner.answer[0]) <= GAME3_TOL &&
			Math.abs(pt3[1] - corner.answer[1]) <= GAME3_TOL &&
			Math.abs(pt3[2] - corner.answer[2]) <= GAME3_TOL;
		const results = [
			...g.round.results,
			{ name: corner.name, guess: pt3, answer: corner.answer, type: ok ? "correct" : "wrong" }
		];
		const index = g.round.index + 1;
		const done = index >= g.round.corners.length;
		const allOk = results.every((r) => r.type === "correct");
		return {
			...g,
			guess: { x: pt3[0], y: pt3[1], z: pt3[2] },
			round: { ...g.round, results, index },
			status: done ? "revealed" : "revealing",
			result: { type: ok ? "correct" : "wrong", answer: corner.answer },
			streak: done ? (allOk ? g.streak + 1 : 0) : g.streak
		};
	});
	const cur = get(det3Game);
	// fire 103: THE REVEAL — the transformation animates in only now that
	// the guess is committed (the 2D twin); runs for the revealing beat and
	// the round's final reveal alike
	if (cur.round) {
		set3Target(cur.round.matrix, { duration: 0.9 });
	}
	if (cur.status === "revealing") {
		const expected = cur.round.results.length;
		setTimeout(() => {
			det3Game.update((g) => {
				if (g.status !== "revealing" || !g.round || g.round.results.length !== expected) {
					return g;
				}
				return { ...g, status: "asking" };
			});
			// fire 103: the next ask shows the untransformed cube again
			reset3ToIdentity();
		}, REVEAL3_MS);
	}
}

/** Quit the live round (full idle reset — no stale markers, F7 lesson). */
export function end3Round() {
	det3Game.set({ ...game3Idle, streak: get(det3Game).streak });
}

/** fire 67 (FIX-E): the 3D try-it's guided tour — the 2D detGuide pair
 * mirrored for Det3DGuide (same forced-spotlight behavior, dock targets). */
export const det3GuideStep = writable(0); // guided walkthrough beat (0..3)
export const det3GuideCollapsed = writable(false);
