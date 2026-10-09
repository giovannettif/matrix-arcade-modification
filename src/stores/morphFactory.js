import { writable, derived, get } from "svelte/store";
import { gsap } from "$utils/gsap.js";

/**
 * P5.1: the morph-store factory — det.js's playhead pattern (detFrom /
 * detTarget / detPlayhead / derived entries, tweened by gsap) generalized to
 * any vector length so the 3×3 family reuses the exact mechanics the 2×3
 * story already ships. det.js keeps its own working copy (its API is woven
 * through DetControls/DetEngine/DetScene and refactoring it mid-project
 * would risk the shipped 2D story for zero behavior change); new families
 * build on THIS factory.
 *
 * Creates: from / target / playhead / playing / resetTick stores, a derived
 * `entries` (mix of from→target at the playhead), and the controls
 * setTarget / skip / play / pause / tweenActive / reset (instant) /
 * setSpeed. `speedStore` optionally drives the tween duration live (the
 * panels' animation-speed sliders).
 */
export function createMorph(initial, speedStore = writable(1)) {
	const from = writable([...initial]);
	const target = writable([...initial]);
	const playhead = writable(1);
	const playing = writable(false);
	const resetTick = writable(0);

	const entries = derived([from, target, playhead], ([f, t, p]) =>
		f.map((v, i) => v + (t[i] - v) * p)
	);

	let tween = null;
	let speedAtStart = 1;

	function startTween(duration) {
		if (tween) tween.kill();
		speedAtStart = get(speedStore) || 1;
		playhead.set(0);
		playing.set(true);
		tween = gsap.to(
			{ t: 0 },
			{
				t: 1,
				duration: Math.max(0.01, duration / speedAtStart),
				ease: "power2.inOut",
				onUpdate() {
					playhead.set(this.targets()[0].t);
				},
				onComplete() {
					playing.set(false);
				}
			}
		);
	}

	return {
		from,
		target,
		playhead,
		playing,
		resetTick,
		entries,
		/** Morph toward a new vector (from wherever the entries are now). */
		setTarget(entries_, { duration = 1.6 } = {}) {
			from.set(get(entries));
			target.set([...entries_]);
			startTween(duration);
		},
		/** Jump the running/last tween to its end (det.js skip semantics). */
		skip() {
			if (tween) tween.progress(1);
			playhead.set(1);
			playing.set(false);
		},
		play() {
			if (tween && tween.progress() < 1 && tween.paused()) {
				tween.resume();
				playing.set(true);
			} else {
				// replay: re-run the morph from the family's initial vector
				// (identity for matrices) to wherever the entries are now —
				// det.js's replayDet semantics
				from.set([...initial]);
				target.set([...get(entries)]);
				startTween(1.6);
			}
		},
		pause() {
			if (tween) {
				tween.pause();
				playing.set(false);
			}
		},
		tweenActive() {
			return !!(tween && tween.isActive());
		},
		/** fire 81 (I5b): drive the morph directly from a scroll scrub (the
		 *  det.js detScrubTo semantics) — kills any running tween; the scrub
		 *  owns the playhead while the station pin span is engaged. */
		scrub(fromM, toM, p) {
			if (tween) {
				tween.kill();
				tween = null;
			}
			from.set([...fromM]);
			target.set([...toM]);
			playhead.set(Math.max(0, Math.min(1, p)));
			playing.set(false);
		},
		/** Snap instantly (chapter entry / resets) and bump resetTick so any
		 *  bound spinners re-sync. */
		reset(entries_) {
			if (tween) tween.kill();
			tween = null;
			from.set([...entries_]);
			target.set([...entries_]);
			playhead.set(1);
			playing.set(false);
			resetTick.update((n) => n + 1);
		},
		setSpeed(v) {
			speedStore.set(v);
			if (tween && tween.isActive()) tween.timeScale(v / speedAtStart);
		}
	};
}
