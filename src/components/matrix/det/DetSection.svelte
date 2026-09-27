<script>
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import Action from "../Action.svelte";
	import B from "../B.svelte";
	import Term from "../Term.svelte";
	import Tex from "../Tex.svelte";
	import {
		detStep,
		detGuideStep,
		detGuideCollapsed,
		setDetTarget,
		resetToIdentity,
		endRound
	} from "$stores/det.js";
	import DetCanvas from "./DetCanvas.svelte";
	import DetControls from "./DetControls.svelte";
	import DetGame from "./DetGame.svelte";
	import DetGuide from "./DetGuide.svelte";

	// the matrix each narrative step showcases
	const STEP_MATRIX = {
		1: [1, 0, 0, 1],
		2: [2, 1, 0, 1],
		3: [-2, 1, 0, 1],
		4: [1, 2, 2, 4],
		5: [1, 2, 2, 4],
		6: [1, 0, 0, 1]
	};

	let wrapper;
	let guideStarted = false;

	function setStep(n) {
		if (get(detStep) === n) return;
		detStep.set(n);
		if (n === 6) {
			// try-it: clean identity sandbox, guide appears once per session
			resetToIdentity();
			endRound();
			if (!guideStarted) {
				guideStarted = true;
				detGuideStep.set(0);
				detGuideCollapsed.set(false);
			}
			return;
		}
		const m = STEP_MATRIX[n];
		if (m) setDetTarget(m, { duration: 1.6 });
	}

	function update() {
		if (!wrapper) return;
		const r = wrapper.getBoundingClientRect();
		const inView = r.top < window.innerHeight && r.bottom > 0;
		document.body.classList.toggle("det-active", inView);
		if (!inView) return;
		// active step = the last step whose top has crossed the viewport center
		const center = window.innerHeight / 2;
		let current = 1;
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (!el) continue;
			const b = el.getBoundingClientRect();
			if (b.top <= center) current = n;
		}
		// highlight exactly the active step
		for (let n = 1; n <= 6; n++) {
			const el = document.getElementById(`det-st-${n}`);
			if (el) el.classList.toggle("active", n === current);
		}
		if (get(detStep) !== current) setStep(current);
	}

	onMount(() => {
		// scroll events + a light poll (scroll anchoring can shift the page
		// without firing scroll events — see 04-testing-log)
		window.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		const pollInterval = setInterval(update, 300);
		update();
		return () => {
			window.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
			clearInterval(pollInterval);
			document.body.classList.remove("det-active");
			endRound();
		};
	});
</script>

<div id="det-section" bind:this={wrapper} class="relative">
	<div class="flex flex-col lg:w-full lg:flex-row">
		<!-- sticky visual panel — the canvas stays while the text scrolls past -->
		<div class="det-canvas-panel relative flex h-[60vh] items-center justify-center bg-base-300 lg:sticky lg:top-0 lg:h-screen lg:flex-1">
			<div class="canvas-holder">
				<DetCanvas />
			</div>
		</div>

		<!-- scrolling text column — styled like the original article -->
		<div class="det-col relative max-w-prose bg-gradient-to-l from-base-100 via-base-300 via-90% py-12">
			<p id="det-st-1" class="det-step">
				Multiplying by a matrix doesn't just move one vector — it <B
					>rescales the whole plane</B
				>. Watch the unit square: an area of exactly <Tex expr="1" />.
			</p>

			<div class="h-40" />

			<p id="det-st-2" class="det-step">
				Every transformation scales areas by a constant: its <Term>determinant</Term>. The
				square becomes a parallelogram whose area is <B>det(A) times larger</B> — here,
				exactly doubled.
			</p>

			<div class="h-40" />

			<p id="det-st-3" class="det-step">
				The sign matters too. A <B>negative determinant</B> flips the plane over — the area
				is still scaled by <Tex expr={"\\left|\\det(A)\\right|"} />, but orientation reverses.
			</p>

			<div class="h-40" />

			<p id="det-st-4" class="det-step">
				And when <Tex expr={"\\det(A) = 0"} />? The entire plane is <B
					>squashed onto a single line</B
				>. Every square becomes a segment; every area becomes zero.
			</p>

			<div class="h-40" />

			<p id="det-st-5" class="det-step">
				That collapse is why some matrices have no inverse: two different points land on the
				same spot, so <B>the original information is gone</B> — there is nothing left to
				undo. <Term>No determinant, no inverse</Term>.
			</p>

			<div class="h-32" />

			<!-- try-it region -->
			<div id="det-st-6" class="det-step det-tryit">
				<p class="mb-6">
					Enough watching — <B>make the plane misbehave yourself</B>. The guide walks you
					through every control; hide it whenever you want.
				</p>

				<Action>
					<div class="flex flex-col gap-3">
						<DetGuide />
						<DetControls />
						<DetGame />
					</div>
				</Action>
			</div>

			<div class="h-[30vh]" />
		</div>
	</div>
</div>

<style lang="postcss">
	/* The site's own fixed UI (playground toggle + inputs panel) would overlap
	   the canvas while the determinant section is on screen. */
	:global(body.det-active button.fixed),
	:global(body.det-active #inputs) {
		display: none !important;
	}

	.canvas-holder {
		height: min(72vh, 660px);
	}
	.canvas-holder :global(.canvas-box) {
		height: 100%;
		width: auto;
		max-width: 100%;
	}

	/* text steps — dimmed until active, original-style highlight */
	.det-col :global(.det-step) {
		@apply transition-all duration-300 opacity-40;
	}
	.det-col :global(.det-step.active) {
		@apply opacity-100 bg-gradient-to-l from-neutral to-10%;
	}

	/* try-it block: keep the guide/controls readable on the gradient */
	.det-tryit :global(.guide),
	.det-tryit :global(.dock),
	.det-tryit :global(.game) {
		backdrop-filter: blur(2px);
	}

	@media (max-width: 1023px) {
		.canvas-holder {
			height: auto;
		}
		.canvas-holder :global(.canvas-box) {
			height: auto;
			width: 100%;
		}
	}
</style>
