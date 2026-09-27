<script>
	import NumberSpinner from "svelte-number-spinner";
	import { Play, Pause, SkipForward } from "lucide-svelte";
	import {
		detTarget,
		detChapter,
		detPlaying,
		detValue,
		detSpeed,
		setDetTarget,
		playDet,
		pauseDet,
		skipDet,
		setDetSpeed
	} from "$stores/det.js";
	import DetChip from "./DetChip.svelte";

	const COL_A = "#ffb86c";
	const COL_B = "#50fa7b";

	let vals = [...$detTarget];
	let lastSent = JSON.stringify(vals);

	$: interactive = $detChapter === 3;

	// Keep the spinners in sync when chapter scripts change the target.
	$: if (!$detChapter || !interactive) {
		vals = [...$detTarget];
		lastSent = JSON.stringify(vals);
	}

	// User edits morph the shape live.
	$: if (interactive && JSON.stringify(vals) !== lastSent) {
		lastSent = JSON.stringify(vals);
		setDetTarget([...vals], { duration: 0.7 });
	}
</script>

<div class="dock {interactive ? '' : 'locked'}">
	<div class="title">Transform the unit square</div>
	<div class="hint">
		See how a 2 × 2 matrix moves the basis vectors and changes area.
	</div>

	<div class="flex flex-wrap items-center gap-4">
		<!-- Matrix entry grid -->
		<div class="matrix-grid">
			<div>
				<NumberSpinner bind:value={vals[0]} step={0.1} decimals={1} speed={0.1} class="spinner" mainStyle={`color: ${COL_A};`} />
			</div>
			<div>
				<NumberSpinner bind:value={vals[1]} step={0.1} decimals={1} speed={0.1} class="spinner" mainStyle={`color: ${COL_B};`} />
			</div>
			<div>
				<NumberSpinner bind:value={vals[2]} step={0.1} decimals={1} speed={0.1} class="spinner" mainStyle={`color: ${COL_A};`} />
			</div>
			<div>
				<NumberSpinner bind:value={vals[3]} step={0.1} decimals={1} speed={0.1} class="spinner" mainStyle={`color: ${COL_B};`} />
			</div>
		</div>

		<DetChip value={$detValue} size="sm" />

		<!-- Playback -->
		<div class="flex items-center gap-2">
			<button class="ctl" on:click={() => ($detPlaying ? pauseDet() : playDet())} aria-label={$detPlaying ? "Pause animation" : "Play animation"}>
				{#if $detPlaying}
					<Pause size={20} />
				{:else}
					<Play size={20} />
				{/if}
			</button>
			<button class="ctl" on:click={skipDet} aria-label="Skip to the end of the animation">
				<SkipForward size={20} />
			</button>
		</div>

		<!-- Speed -->
		<label class="speed">
			<span>Animation speed</span>
			<input
				type="range"
				min="0.25"
				max="2"
				step="0.25"
				value={$detSpeed}
				on:input={(e) => setDetSpeed(+e.currentTarget.value)}
			/>
		</label>
	</div>
</div>

<style lang="postcss">
	.dock {
		@apply rounded-xl border border-[#44475a66] bg-[#0d0d18]/95 p-4;
		transition: opacity 0.4s;
	}
	.dock.locked {
		@apply pointer-events-none opacity-35;
	}
	.title {
		@apply font-serif text-xl font-bold text-base-content;
	}
	.hint {
		@apply mb-3 font-sans text-xs text-[#8b90a7];
	}
	.matrix-grid {
		@apply grid grid-cols-2 grid-rows-2 px-3 py-1;
		box-shadow: inset 0 0 0 3px rgba(248, 248, 242, 0.85);
	}
	:global(.spinner) {
		@apply w-16 bg-transparent px-2 py-1.5 text-right font-serif text-2xl transition-all;
	}
	:global(.spinner:hover) {
		@apply bg-[#1b1c2a];
	}
	.ctl {
		@apply grid h-11 w-11 place-items-center rounded-full border-2 border-[#f8f8f2] text-[#f8f8f2];
		box-shadow: 0 0 10px rgba(248, 248, 242, 0.25);
		transition: box-shadow 0.2s, background 0.2s;
	}
	.ctl:hover {
		@apply bg-[#1b1c2a];
		box-shadow: 0 0 16px rgba(248, 248, 242, 0.45);
	}
	.speed {
		@apply flex flex-col gap-1 font-sans text-xs text-[#8b90a7];
	}
	.speed input {
		@apply h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-[#44475a];
	}
	.speed input::-webkit-slider-thumb {
		@apply h-4 w-4 appearance-none rounded-full;
		background: #f8f8f2;
		box-shadow: 0 0 8px rgba(248, 248, 242, 0.6);
	}
</style>
