<script>
	import NumberSpinner from "svelte-number-spinner";
	import { Play, Pause, SkipForward } from "lucide-svelte";
	import {
		detTarget,
		detStep,
		detPlaying,
		detValue,
		detArea,
		detCollapsed,
		detFlipped,
		detSpeed,
		detGame,
		detGuideStep,
		detResetTick,
		setDetTarget,
		playDet,
		pauseDet,
		skipDet,
		setDetSpeed
	} from "$stores/det.js";

	const COL_A = "#ff79c6";
	const COL_B = "#bd93f9";

	let vals = [...$detTarget];
	let lastSent = JSON.stringify(vals);

	$: interactive = $detStep === 6;
	$: roundLive = $detGame.status === "asking";

	// Keep the spinners in sync when the story or a game round sets the matrix.
	$: if (!$detStep || !interactive || roundLive) {
		vals = [...$detTarget];
		lastSent = JSON.stringify(vals);
	}

	// Resets (identity snap on chapter entry) must always reach the spinners.
	$: if ($detResetTick !== seenTick) {
		seenTick = $detResetTick;
		vals = [...$detTarget];
		lastSent = JSON.stringify(vals);
	}
	let seenTick = 0;

	// User edits morph the shape live (only while no round is live).
	$: if (interactive && !roundLive && JSON.stringify(vals) !== lastSent) {
		lastSent = JSON.stringify(vals);
		setDetTarget([...vals], { duration: 0.7 });
	}
</script>

<div class="det-controls">
	<div class="title">Transform the unit square</div>

	<!-- live readouts (beat 1 of the guide points here) -->
	<div class="readouts" class:guide-hl={$detGuideStep === 1}>
		<span style:color={$detCollapsed ? "#bd93f9" : $detFlipped ? "#ff79c6" : "#8be9fd"}>
			det(A) = {$detCollapsed ? "0.0" : $detValue.toFixed(1)}
		</span>
		<span class="readout-sub">
			{$detCollapsed
				? "the plane is squashed onto one line"
				: `area × ${$detArea.toFixed(1)}${$detFlipped ? " · orientation reversed" : ""}`}
		</span>
	</div>

	<div class="flex flex-wrap items-center gap-4">
		<!-- Matrix entry grid (beat 0 of the guide points here) -->
		<div class="matrix-grid" class:frozen={roundLive} class:guide-hl={$detGuideStep === 0}>
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

	{#if roundLive}
		<div class="hint">Matrix locked while the round is live — it resets after the round.</div>
	{/if}
</div>

<style lang="postcss">
	.det-controls {
		@apply flex flex-col items-start gap-3;
	}
	.title {
		@apply font-serif text-xl font-bold text-base-content;
	}
	.readouts {
		@apply flex flex-col rounded-md border border-[#44475a66] bg-[#0d0d18]/80 px-3 py-1.5 font-serif text-lg;
		transition: border-color 0.3s;
	}
	.readout-sub {
		@apply font-sans text-[11px] text-[#8b90a7];
	}
	.matrix-grid {
		@apply grid grid-cols-2 grid-rows-2 px-3 py-1;
		box-shadow: inset 0 0 0 3px rgba(248, 248, 242, 0.85);
		transition: opacity 0.3s;
	}
	.matrix-grid.frozen {
		@apply pointer-events-none opacity-70;
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
	.hint {
		@apply font-sans text-[11px] text-[#8b90a7];
	}

	/* guide highlight rings (the tour points at each piece) */
	:global(.guide-hl) {
		outline: 2px solid #50fa7b !important;
		outline-offset: 4px;
		border-radius: 10px;
		animation: guidepulse 1.2s ease-in-out infinite;
	}
	@keyframes guidepulse {
		0%,
		100% {
			box-shadow: 0 0 0 rgba(80, 250, 123, 0);
		}
		50% {
			box-shadow: 0 0 18px rgba(80, 250, 123, 0.55);
		}
	}
</style>
