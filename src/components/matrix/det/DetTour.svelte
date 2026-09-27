<script>
	import { detTourStep } from "$stores/det.js";
	import { MousePointerClick, Gauge, Play, Crosshair } from "lucide-svelte";

	const steps = [
		{
			x: 30,
			y: 58,
			icon: MousePointerClick,
			title: "Edit the matrix",
			body: "Drag a number left or right to change it — or click it once and type your own."
		},
		{
			x: 34,
			y: 74,
			icon: Gauge,
			title: "Watch the determinant",
			body: "det(A) and the area update live as the shape morphs. Get it to 0 and the plane collapses!"
		},
		{
			x: 46,
			y: 74,
			icon: Play,
			title: "Replay & scrub",
			body: "Play or pause the morph, skip to the end, and set the animation speed."
		},
		{
			x: 50,
			y: 30,
			icon: Crosshair,
			title: "Predict on the canvas",
			body: "Start a prediction round below, then click the canvas where you think the answer is."
		}
	];

	$: step = $detTourStep;
	$: current = step >= 0 && step < steps.length ? steps[step] : null;

	function next() {
		detTourStep.update((s) => (s >= steps.length - 1 ? -1 : s + 1));
	}
	function skip() {
		detTourStep.set(-1);
	}
</script>

{#if current}
	<div class="tour-wrap">
		<div class="bubble" style:left="{current.x}%" style:top="{current.y}%">
			<div class="head">
				<span class="ico"><current.icon size={16} /></span>
				<b>{current.title}</b>
			</div>
			<p>{current.body}</p>
			<div class="foot">
				<span class="count">{step + 1} / {steps.length}</span>
				<button class="skip" on:click={skip}>Skip tour</button>
				<button class="next" on:click={next}>
					{step === steps.length - 1 ? "Got it!" : "Next"}
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="postcss">
	.tour-wrap {
		@apply pointer-events-none absolute inset-0 z-20;
	}
	.bubble {
		@apply pointer-events-auto absolute w-64 -translate-x-1/2 rounded-xl border-2 border-[#50fa7b99] bg-[#0e0e19] p-3 shadow-[0_0_24px_rgba(80,250,123,0.3)];
		animation: dettour 0.3s ease-out;
	}
	@keyframes dettour {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}
	.head {
		@apply flex items-center gap-2;
	}
	.ico {
		@apply grid h-6 w-6 place-items-center rounded-full border border-[#50fa7b] text-[#50fa7b];
	}
	.head b {
		@apply font-sans text-sm text-base-content;
	}
	p {
		@apply mt-1.5 font-sans text-xs leading-relaxed text-[#c8cbdd];
	}
	.foot {
		@apply mt-2 flex items-center justify-between gap-2;
	}
	.count {
		@apply font-sans text-[10px] text-[#8b90a7];
	}
	.skip {
		@apply font-sans text-xs text-[#8b90a7] underline underline-offset-2;
	}
	.next {
		@apply rounded-lg border border-[#50fa7b99] px-3 py-1 font-sans text-xs font-bold text-[#50fa7b];
	}
	.next:hover {
		background: rgba(80, 250, 123, 0.12);
	}
</style>
