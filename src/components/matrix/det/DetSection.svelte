<script>
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import {
		detChapter,
		detEntries,
		detValue,
		setDetTarget,
		resetToIdentity
	} from "$stores/det.js";
	import DetCanvas from "./DetCanvas.svelte";
	import DetControls from "./DetControls.svelte";
	import DetChip from "./DetChip.svelte";

	const ACCENTS = { 1: "#8be9fd", 2: "#bd93f9", 3: "#50fa7b", 4: "#ff79c6" };
	// share of the scroll runway per chapter (chapter 3 gets the most, for free play)
	const B = [0, 0.24, 0.44, 0.8, 1.0001];

	const chapters = [
		{ n: 1, title: "Stretching changes area" },
		{ n: 2, title: "Determinant zero collapses the plane" },
		{ n: 3, title: "Try it yourself" },
		{ n: 4, title: "Key takeaway" }
	];

	let wrapper;
	let timers = [];
	let active = false;

	$: m = $detEntries;

	function clearTimers() {
		timers.forEach(clearTimeout);
		timers = [];
	}

	function enterChapter(ch) {
		clearTimers();
		if (ch === 1) {
			resetToIdentity();
			// demo: stretch (det = 2), then flip orientation (det = -2)
			timers.push(
				setTimeout(() => {
					if (get(detChapter) === 1) setDetTarget([2, 1, 0, 1]);
				}, 900),
				setTimeout(() => {
					if (get(detChapter) === 1) setDetTarget([-2, 1, 0, 1]);
				}, 4400)
			);
		} else if (ch === 2) {
			// demo: collapse the plane (det = 0)
			setDetTarget([1, 2, 2, 4], { duration: 2.6 });
		} else if (ch === 3) {
			// free play — keep the current shape, controls unlock
		} else if (ch === 4) {
			// recap — freeze the scene
		}
	}

	function onScroll() {
		if (!wrapper) return;
		const r = wrapper.getBoundingClientRect();
		const vh = window.innerHeight;
		const total = r.height - vh;
		if (total <= 0) return;
		const p = Math.min(1, Math.max(0, -r.top / total));
		const ch = p < B[1] ? 1 : p < B[2] ? 2 : p < B[3] ? 3 : 4;
		if (ch !== get(detChapter)) detChapter.set(ch);
	}

	onMount(() => {
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		onScroll();
		active = true;
		enterChapter(1);

		// Re-run the chapter-1 demo whenever the section re-enters the viewport,
		// so late arrivals still see the animation from the start.
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					if (!active) {
						active = true;
						enterChapter(get(detChapter));
					}
				} else {
					active = false;
				}
			},
			{ threshold: 0.01 }
		);
		io.observe(wrapper);

		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			io.disconnect();
			clearTimers();
		};
	});

	// run chapter scripts on every scroll-driven chapter change
	$: if (wrapper && $detChapter) enterChapter($detChapter);
</script>

<div id="det-section" bind:this={wrapper} class="relative h-[520vh]">
	<!-- The stage is fixed to the viewport: the surrounding article column is
	     intentionally full-bleed in this design, so centering must not depend on it. -->
	<div class="stage-hold" class:on={active}>
		<div class="stage">
			<div class="stage-head">
				<h2>Determinant, Area, and Invertibility</h2>
				<p>
					A 2 × 2 matrix transforms the plane. Its determinant tells us how
					area changes — and whether the transformation is reversible.
				</p>
			</div>

			<div class="stage-grid">
				<div class="stage-canvas">
					<div class="canvas-holder">
						<DetCanvas />
					</div>
					<DetControls />
					<div class="dots">
						{#each chapters as c (c.n)}
							<span
								class="dot"
								class:on={$detChapter === c.n}
								style:background={$detChapter === c.n ? ACCENTS[c.n] : "#44475a"}
								style:box-shadow={$detChapter === c.n
									? `0 0 8px ${ACCENTS[c.n]}`
									: "none"}
							/>
						{/each}
						<span class="count">{$detChapter} / 4</span>
					</div>
				</div>

				<div class="stage-rail">
					<ol>
						{#each chapters as c (c.n)}
							<li
								class:active={$detChapter === c.n}
								style:--accent={ACCENTS[c.n]}
							>
								<div class="num">{c.n}</div>
								<div class="body">
									<div class="step-title">{c.title}</div>
									{#if $detChapter === c.n}
										<div class="card">
											{#if c.n === 1}
												<p>
													A linear transformation takes the
													<b>unit square</b> — an area of 1 — to a
													parallelogram. The <b>determinant</b> is the
													signed scale factor of the area.
												</p>
												<div class="legend">
													<span class="key" style:--c="#ffb86c"
														>First column T(e₁) = ({m[0].toFixed(1)},
														{m[2].toFixed(1)})</span
													>
													<span class="key" style:--c="#50fa7b"
														>Second column T(e₂) = ({m[1].toFixed(1)},
														{m[3].toFixed(1)})</span
													>
												</div>
												<DetChip value={$detValue} size="sm" />
											{:else if c.n === 2}
												<p>
													When <b>det(A) = 0</b>, the entire plane is
													squashed onto a single line. Two different
													input points land on the <b>same</b> point, so
													the original shape can no longer be
													reconstructed — <b>no inverse exists</b>.
												</p>
												<div class="legend">
													<span class="key" style:--c="#ffb86c"
														>First column T(e₁) = ({m[0].toFixed(1)},
														{m[2].toFixed(1)})</span
													>
													<span class="key" style:--c="#50fa7b"
														>Second column T(e₂) = ({m[1].toFixed(1)},
														{m[3].toFixed(1)})</span
													>
												</div>
												<DetChip value={$detValue} size="sm" />
											{:else if c.n === 3}
												<p>
													The controls are yours now. Edit the matrix
													entries, replay the animation, and watch the
													determinant update live. Try to find a matrix
													that collapses the plane!
												</p>
												<p class="hint">
													Drag the numbers to change them · double-click
													to type your own · play, pause or skip the
													animation
												</p>
											{:else}
												<ul>
													<li>
														<b>det(A)</b> is the signed area scale
														factor of the transformation.
													</li>
													<li>
														<b>det(A) ≠ 0</b> — no information is lost:
														distinct points stay distinct, and the
														transformation can be undone. The matrix
														has an <b>inverse</b>.
													</li>
													<li>
														<b>det(A) = 0</b> — the plane collapses,
														information is lost, and no inverse exists.
													</li>
												</ul>
											{/if}
										</div>
									{/if}
								</div>
							</li>
						{/each}
					</ol>
				</div>
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	.stage-hold {
		@apply pointer-events-none fixed left-1/2 top-1/2 z-30;
		transform: translate(-50%, -50%);
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.45s, visibility 0.45s;
	}
	.stage-hold.on {
		@apply pointer-events-auto;
		opacity: 1;
		visibility: visible;
	}
	.stage {
		@apply max-h-[94vh] overflow-hidden rounded-2xl border border-[#44475a66] bg-[#0b0b14] p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)];
		width: min(1200px, 94vw);
	}
	.stage-head {
		@apply mb-4;
	}
	.stage-head h2 {
		@apply font-serif text-3xl font-bold text-base-content;
	}
	.stage-head p {
		@apply font-sans text-sm text-[#8b90a7];
	}
	.stage-grid {
		@apply grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px];
	}
	.canvas-holder {
		height: min(50vh, 520px);
	}
	.canvas-holder :global(.canvas-box) {
		height: 100%;
		width: auto;
		max-width: 100%;
	}

	.dots {
		@apply mt-3 flex items-center justify-center gap-2;
	}
	.dot {
		@apply h-1.5 w-10 rounded-full transition-all duration-300;
	}
	.dot.on {
	}
	.count {
		@apply ml-2 font-sans text-xs text-[#8b90a7];
	}

	.stage-rail ol {
		@apply m-0 flex list-none flex-col gap-3 p-0;
	}
	.stage-rail li {
		@apply flex items-start gap-3 rounded-xl border border-transparent p-3 opacity-[0.35] transition-all duration-300;
	}
	.stage-rail li.active {
		@apply opacity-100;
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
		background: color-mix(in srgb, var(--accent) 7%, transparent);
		box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 18%, transparent);
	}
	.num {
		@apply grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[#44475a] font-sans font-bold text-[#8b90a7];
	}
	li.active .num {
		border-color: var(--accent);
		color: var(--accent);
		box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.step-title {
		@apply font-sans text-sm font-bold text-base-content;
	}
	li.active .step-title {
		color: var(--accent);
	}
	.card {
		@apply mt-2 flex flex-col gap-3 font-sans text-xs leading-relaxed text-[#c8cbdd];
	}
	.card p {
		@apply m-0;
	}
	.card b {
		@apply text-base-content;
	}
	.card .hint {
		@apply text-[#8b90a7];
	}
	.card ul {
		@apply m-0 flex list-none flex-col gap-2 p-0;
	}
	.legend {
		@apply flex flex-col gap-1.5;
	}
	.key {
		@apply flex items-center gap-2 font-sans text-xs font-bold;
		color: var(--c);
	}
	.key::before {
		content: "";
		@apply inline-block h-3 w-3 rounded-sm;
		background: var(--c);
		box-shadow: 0 0 8px var(--c);
	}
</style>
