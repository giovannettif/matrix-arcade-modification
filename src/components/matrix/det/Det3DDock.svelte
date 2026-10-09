<script>
	// P5.2: the 3D try-it dock — 3×3 spinners (step 0.5), volume readout,
	// play controls, and the prediction rounds (question / floor+slider
	// guess confirmation / progress strip / summary). DOM-level, mounted in
	// Index like DetOverlay; visible only at det3dStep === 6 (the try-it
	// step), hidden below lg like the 2D dock.
	import NumberSpinner from "svelte-number-spinner";
	import { Play, Pause, SkipForward, X, MousePointerClick, Check } from "lucide-svelte";
	import { get } from "svelte/store";
	import {
		det3dStep,
		det3Target,
		det3Playing,
		det3Volume,
		det3Collapsed,
		det3Flipped,
		det3Game,
		det3ResetTick,
		det3GuessZ,
		set3Target,
		play3Det,
		pause3Det,
		skip3Det,
		start3Round,
		submit3CornerGuess,
		end3Round
	} from "$stores/det3.js";

	const COL_A = "#ff79c6";
	const COL_B = "#bd93f9";
	const COL_C = "#8be9fd";
	const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
	// fmt for 3-component points, shared by the question/summary templates
	function fmt3pt(p) {
		return `(${p.map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(", ")})`;
	}

	let vals = [...$det3Target];
	let lastSent = JSON.stringify(vals);
	let seenTick = 0;
	let savedVals = null;

	$: roundLive = $det3Game.status !== "idle";

	// spinners sync from the story/round target; user edits morph live only
	// while the try-it is on and no round is playing (N-2 pattern from the
	// 2D dock: capture the sandbox matrix at round start, hand it back after)
	$: if (!$det3dStep || $det3dStep !== 6 || roundLive) {
		vals = [...$det3Target];
		lastSent = JSON.stringify(vals);
	}
	$: if ($det3ResetTick !== seenTick) {
		seenTick = $det3ResetTick;
		vals = [...$det3Target];
		lastSent = JSON.stringify(vals);
	}
	$: if ($det3dStep === 6 && !roundLive && JSON.stringify(vals) !== lastSent) {
		lastSent = JSON.stringify(vals);
		set3Target([...vals], { duration: 0.7 });
	}
	$: if (roundLive && !savedVals && $det3Game.round) {
		savedVals = [...vals];
	}
	$: if (!roundLive && savedVals) {
		vals = [...savedVals];
		savedVals = null;
	}

	$: g = $det3Game;
	$: asked = g.status === "asking" && g.round ? g.round.corners[g.round.index] : null;
	$: revealing = g.status === "revealing" && g.result;
	// fire 80 (I4): the asked chip matches the scene's corner label colors
	const CORNER_COLORS3 = { P2: "#ff79c6", P4: "#bd93f9", P5: "#f1fa8c" };
	const askedColor3 = (name) => CORNER_COLORS3[name] || "#f8f8f2";
	$: correctCount = g.round ? g.round.results.filter((r) => r.type === "correct").length : 0;

	function predict() {
		start3Round();
	}
	function confirmGuess() {
		const guess = get(det3Game).guess;
		if (!guess) return;
		submit3CornerGuess([guess.x, guess.y, $det3GuessZ]);
	}
	function quit() {
		end3Round();
	}
</script>

<!-- fire 59: the dock's fixed wrapper + det3dStep gate moved to DetOverlay's
     persistent shell (the side UI never unmounts while scrolling the
     terminal region) — this component is now the dock's CONTENT only. -->
<div class="det3-dock">
	<div class="title">Transform the unit cube</div>

			<div class="readouts" data-tour="3readout">
				<div class="readout">
					<span class="katex">V = |det(A)| = {fmt($det3Volume)}</span>
					<span class="readout-sub">
						{#if $det3Collapsed}
							the box is squashed flat — volume 0
						{:else if $det3Flipped}
							volume × {fmt($det3Volume)} · orientation reversed
						{:else}
							volume × {fmt($det3Volume)}
						{/if}
					</span>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-4" data-tour="3matrix">
				<div class="matrix3-grid" class:frozen={roundLive}>
					{#each [0, 3, 6] as r (r)}
						{#each [r, r + 1, r + 2] as ci, pos (ci)}
							<NumberSpinner
								bind:value={vals[ci]}
								step={0.5}
								decimals={1}
								speed={0.1}
								mainStyle={`color: ${pos === 0 ? COL_A : pos === 1 ? COL_B : COL_C};`}
							/>
						{/each}
					{/each}
				</div>
				<div class="flex items-center gap-2">
					<button class="ctl" on:click={() => ($det3Playing ? pause3Det() : play3Det())} aria-label={$det3Playing ? "Pause animation" : "Play animation"}>
						{#if $det3Playing}<Pause size={18} />{:else}<Play size={18} />{/if}
					</button>
					<button class="ctl" on:click={skip3Det} aria-label="Skip to the end of the animation">
						<SkipForward size={18} />
					</button>
				</div>
			</div>
			{#if roundLive}
				<div class="hint">Matrix locked while the round is live — it resets after the round.</div>
			{/if}

			<div class="flex items-center gap-3 mt-1" data-tour="3predict">
				<span class="dock-heading">Your turn</span>
				{#if g.status === "idle"}
					<button class="mode" on:click={predict}>
						<MousePointerClick size={15} /> Predict
					</button>
				{:else}
					<button class="quit" on:click={quit} aria-label="End the prediction round">
						<X size={15} /> quit
					</button>
				{/if}
			</div>

			{#if (g.status === "asking" || g.status === "revealing") && g.mode === "corners" && g.round}
				<!-- fire 80 (I4): the step header + dots — the round's structure
				     visible at a glance, matching the 2D game card -->
				<div class="steps">
					<span class="step-label">
						Point {Math.min(g.round.index + 1, g.round.corners.length)} of {g.round.corners.length}
						{#if asked}
							· <b class="asked-chip" style:color={askedColor3(asked.name)}>{asked.name}</b>
						{:else if revealing}
							· <b class="asked-chip" style:color={askedColor3(g.result.name)}>{g.result.name}</b>
						{/if}
					</span>
					<div class="dots">
						{#each g.round.corners as c, i (c.name)}
							<span
								class="dot"
								class:done={i < g.round.index}
								class:active={i === g.round.index}
								class:todo={i > g.round.index}
							/>
						{/each}
					</div>
				</div>
			{/if}

			{#if g.status === "asking" && g.mode === "corners" && asked}
				<p class="question">
					Where does <b class="cn" style:color={askedColor3(asked.name)}>{asked.name} {fmt3pt(asked.point)}</b>
					land? <b>Click the floor</b> under it, set the height, and lock it in.
				</p>
				{#if g.round.results.length === 0}
					<p class="coach">
						Click where <b>{asked.name}</b> will land — the white ghost previews the full point.
					</p>
				{/if}
				<div class="height-row">
					<label class="height-label" for="det3-height">height z</label>
					<input
						id="det3-height"
						class="height-slider"
						type="range"
						min="0"
						max="3"
						step="0.5"
						bind:value={$det3GuessZ}
					/>
					<span class="height-val">z = {fmt($det3GuessZ)}</span>
					<button class="mode confirm" on:click={confirmGuess} disabled={!g.guess}>
						<Check size={15} /> Lock it in
					</button>
				</div>
			{:else if revealing}
				<p class="verdict-line" class:vok={g.result.type === "correct"} class:vno={g.result.type === "wrong"}>
					<b>{g.result.name}</b>
					{g.result.type === "correct" ? "— hit ✓" : "— missed ✗"} — watch where it really lands…
				</p>
			{:else if g.status === "revealed" && g.mode === "corners" && g.round}
				{@const correct = g.round.results.filter((r) => r.type === "correct").length}
				{#if correct === g.round.corners.length}
					<div class="banner ok">
						All four corners — nailed it! The box you built IS the image of the cube.
					</div>
				{:else}
					<div class="banner no">
						{correct}/{g.round.corners.length} corners. The truth chips on the board show
						where each one really landed.
					</div>
				{/if}
				<div class="strip">
					{#each g.round.results as r (r.name + r.guess)}
						<span class="chip" class:okc={r.type === "correct"} class:noc={r.type === "wrong"}>
							{r.name} → {fmt3pt(r.answer)} {r.type === "correct" ? "✓" : "✗"}
						</span>
					{/each}
				</div>
				<div class="next-row">
					<button class="mode" on:click={predict}>
						<MousePointerClick size={15} /> Next round
					</button>
					<span class="streak">streak: {g.streak}</span>
				</div>
			{/if}

			<div class="legend">
				✓ hit · ✗ miss · answers snap to the half-grid · the white ghost previews your
				guess before you lock it in
			</div>
		</div>
	
<style lang="postcss">
	.det3-dock {
		@apply flex flex-col items-start gap-3 rounded-lg border border-[#44475a66] bg-[#0d0d18]/80 backdrop-blur-sm p-5;
		max-width: 560px;
	}
	.title {
		@apply font-serif text-xl font-bold text-base-content;
	}
	.readouts {
		@apply rounded-md border border-[#44475a66] px-4 py-2 bg-[#0d0d18]/80 font-serif text-lg;
	}
	.readout {
		@apply flex flex-col;
	}
	.readout-sub {
		@apply mt-1 font-sans text-xs text-[#c8cbdd];
	}
	.matrix3-grid {
		@apply grid grid-cols-3 gap-1 p-2 rounded-md;
	}
	.matrix3-grid :global(.number-spinner) {
		width: 4.2rem;
	}
	.matrix3-grid.frozen {
		@apply opacity-80;
	}
	.matrix3-grid.frozen :global(input) {
		pointer-events: none;
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
	.dock-heading {
		@apply font-sansAlt text-base font-bold;
	}
	.mode {
		@apply btn btn-sm bg-white/10 hover:bg-white/20 border-0 font-sansAlt text-sm;
	}
	.mode.confirm {
		@apply btn-success text-success-content;
	}
	.mode:disabled {
		@apply opacity-40 pointer-events-none;
	}
	.quit {
		@apply btn btn-ghost btn-sm font-sansAlt text-sm text-[#c8cbdd];
	}
	.question {
		@apply font-sans text-sm;
		max-width: 480px;
	}
	.cn {
		@apply font-serif text-base;
		color: #f1fa8c;
	}
	.progress {
		@apply mt-1 flex gap-2 font-sans text-xs;
	}
	.pc {
		@apply rounded-md border border-[#767b99] px-2 py-0.5 text-[#e2e4f0];
	}
	.okc {
		border-color: rgba(80, 250, 123, 0.6);
		color: #50fa7b;
	}
	.noc {
		border-color: rgba(255, 85, 85, 0.6);
		color: #ff5555;
	}
	.todo {
		border-style: dashed;
	}
	.height-row {
		@apply mt-2 flex items-center gap-3;
	}
	.height-label {
		@apply font-sans text-xs text-[#c8cbdd];
	}
	.height-slider {
		@apply w-44 accent-success;
	}
	.height-val {
		@apply font-sans text-xs;
	}
	.banner {
		@apply mt-1 rounded-lg px-3 py-2 font-sans text-xs font-bold;
		max-width: 480px;
	}
	.ok {
		background: rgba(80, 250, 123, 0.12);
		color: #50fa7b;
		border: 1px solid rgba(80, 250, 123, 0.45);
	}
	.no {
		background: rgba(255, 85, 85, 0.12);
		color: #ff5555;
		border: 1px solid rgba(255, 85, 85, 0.45);
	}
	.strip {
		@apply mt-2 flex flex-wrap items-center gap-2 font-sans text-xs;
	}
	.chip {
		@apply rounded-md border border-[#44475a] px-2 py-0.5;
	}
	.chip.okc {
		border-color: rgba(80, 250, 123, 0.6);
		color: #50fa7b;
	}
	.chip.noc {
		border-color: rgba(255, 85, 85, 0.6);
		color: #ff5555;
	}
	.next-row {
		@apply mt-2 flex items-center gap-4;
	}
	.streak {
		@apply font-sans text-xs text-[#c8cbdd];
	}
	.legend {
		@apply mt-1 font-sans text-xs text-[#8b90a7];
		max-width: 480px;
	}
	.hint {
		@apply font-sans text-xs text-[#8b90a7];
	}

	/* fire 80 (I4): the round structure — step header + dots + coach + the
	   per-point verdict, matching the 2D game card */
	.steps {
		@apply flex items-center justify-between gap-2 border-b border-[#44475a66] pb-2;
	}
	.step-label {
		@apply font-sans text-xs font-bold uppercase tracking-wide text-[#8b90a7];
	}
	.asked-chip {
		@apply font-serif text-sm;
	}
	.dots {
		@apply flex items-center gap-1.5;
	}
	.dot {
		@apply h-2.5 w-2.5 rounded-full border;
	}
	.dot.done {
		background: rgba(80, 250, 123, 0.85);
		border-color: rgba(80, 250, 123, 0.85);
	}
	.dot.active {
		border-color: #f1fa8c;
		animation: dockpulse 1.1s ease-in-out infinite;
	}
	.dot.todo {
		border-style: dashed;
		border-color: #767b99;
	}
	@keyframes dockpulse {
		0%,
		100% {
			box-shadow: 0 0 0 rgba(241, 250, 140, 0);
			transform: scale(0.9);
		}
		50% {
			box-shadow: 0 0 10px rgba(241, 250, 140, 0.6);
			transform: scale(1.15);
		}
	}
	.coach {
		@apply mt-2 rounded-lg border border-[#f1fa8c55] px-3 py-1.5 font-sans text-xs text-[#c8cbdd];
		background: rgba(241, 250, 140, 0.07);
	}
	.verdict-line {
		@apply mt-2 rounded-lg px-3 py-2 font-sans text-xs font-bold;
	}
	.verdict-line.vok {
		background: rgba(80, 250, 123, 0.12);
		color: #50fa7b;
		border: 1px solid rgba(80, 250, 123, 0.45);
	}
	.verdict-line.vno {
		background: rgba(255, 85, 85, 0.1);
		color: #ff5555;
		border: 1px solid rgba(255, 85, 85, 0.4);
	}
</style>
