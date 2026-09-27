import { writable, derived, get } from "svelte/store";
import { gsap } from "$utils/gsap.js";

/**
 * Determinant section state.
 * entries = [a, b, c, d] for the matrix [[a, b], [c, d]];
 * the columns are (a, c) and (b, d) — where the basis vectors land.
 */

const IDENTITY = [1, 0, 0, 1];

export const detChapter = writable(1); // 1..4, driven by scroll
export const detFrom = writable([...IDENTITY]);
export const detTarget = writable([...IDENTITY]);
export const detPlayhead = writable(1); // 1 = resting at target
export const detPlaying = writable(false);
export const detSpeed = writable(1);
export const detTourStep = writable(-1); // guided tour (V2): -1 = inactive

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
}
