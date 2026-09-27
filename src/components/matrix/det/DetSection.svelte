<script>
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import { gsap } from "$utils/gsap.js";
	import {
		detChapter,
		detEntries,
		detValue,
		detTourStep,
		setDetTarget,
		resetToIdentity,
		endRound
	} from "$stores/det.js";
	import DetCanvas from "./DetCanvas.svelte";
	import DetControls from "./DetControls.svelte";
	import DetChip from "./DetChip.svelte";
	import DetGame from "./DetGame.svelte";
	import DetTour from "./DetTour.svelte";

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
	let calls = [];
	let active = false;
	let lastEnter = 0;
	let tourDone = false;

	$: m = $detEntries;

	function clearTimers() {
		calls.forEach((c) => c.kill());
		calls = [];
	}

	function enterChapter(ch) {
		clearTimers();
		if (ch === 1) {
			resetToIdentity();
			// demo: stretch (det = 2), then flip orientation (det = -2)
			// gsap.delayedCall keeps the whole demo on the gsap clock
			calls.push(
				gsap.delayedCall(0.9, () => {
					if (get(detChapter) === 1) setDetTarget([2, 1, 0, 1]);
				}),
				gsap.delayedCall(4.4, () => {
					if (get(detChapter) === 1) setDetTarget([-2, 1, 0, 1]);
				})
			);
		} else if (ch === 2) {
			// demo: collapse the plane (det = 0)
			setDetTarget([1, 2, 2, 4], { duration: 2.6 });
		} else if (ch === 3) {
			// free play — controls unlock; first visit starts the guided tour
			if (!tourDone) {
				tourDone = true;
				detTourStep.set(0);
			}
		} else if (ch === 4) {
			// recap — freeze the scene, close any open round
			endRound();
		}
	}

	function onScroll() {
		if (!wrapper) return;
		const r = wrapper.getBoundingClientRect();
		const vh = window.innerHeight;
		const total = r.height - vh;
		const inView = r.top < vh && r.bottom > 0;
		document.body.classList.toggle("det-active", inView);
		if (!inView) return;
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
		// Scroll events alone are not enough: scroll anchoring (e.g. when the
		// article's pin spacer recalibrates) shifts scrollY WITHOUT firing a
		// scroll event. A light poll keeps the chapter in sync.
		const poll = setInterval(onScroll, 300);

		// Re-run the chapter-1 demo whenever the section re-enters the viewport,
		// so late arrivals still see the animation from the start (with a cooldown
		// so IO bounce at the boundary doesn't restart the demo mid-play).
		// While the stage is on screen, the site's own fixed playground toggle
		// would overlap the canvas — body.det-active hides it via CSS (continuous,
		// immune to the site's own scroll triggers re-enabling it).
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					const first = !active;
					active = true;
					document.body.classList.add("det-active");
					// replay the chapter demo only when genuinely re-entering
					if (first && Date.now() - lastEnter > 800) {
						lastEnter = Date.now();
						enterChapter(get(detChapter));
					}
				} else if (active) {
					active = false;
					lastEnter = Date.now();
					document.body.classList.remove("det-active");
					endRound();
					detTourStep.set(-1);
				}
			},
			{ threshold: 0.01 }
		);
		io.observe(wrapper);

		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			clearInterval(poll);
			io.disconnect();
			clearTimers();
			document.body.classList.remove("det-active");
			endRound();
			detTourStep.set(-1);
		};
	});

	// run chapter scripts on every scroll-driven chapter change
	$: if (wrapper && $detChapter) enterChapter($detChapter);
</script>

<div id="det-section" bind:this={wrapper} class="relative h-[520vh]">
	<!-- Sibling of the pinned article (mounted from Index.svelte): no transformed
	     ancestors here, so the stage can stick to the viewport and center normally. -->
	<div class="sticky top-0 flex h-screen w-full items-center justify-center">
		<div class="stage-hold" class:on={active}>
			<DetTour />
			<div class="stage" class:compact={$detChapter === 3}>
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
					<DetGame />
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
														<b>det(A)</b>&nbsp;is the signed area
														scale factor of the transformation.
													</li>
													<li>
														<b>det(A) ≠ 0</b>&nbsp;— no information is
														lost: distinct points stay distinct, and
														the transformation can be undone. The
														matrix has an <b>inverse</b>.
													</li>
													<li>
														<b>det(A) = 0</b>&nbsp;— the plane
														collapses, information is lost, and no
														inverse exists.
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
</div>

<style lang="postcss">
	/* The site's only fixed-position button (playground toggle) overlaps the
	   stage while the determinant section is on screen. Fully global selector. */
	:global(body.det-active button.fixed) {
		display: none !important;
	}
	.stage-hold {
		@apply pointer-events-none relative;
		opacity: 0;
		visibility: hidden;
	}
	.stage-hold.on {
		@apply pointer-events-auto;
		opacity: 1;
		visibility: visible;
	}
	.stage {
		@apply max-h-[94vh] overflow-y-auto rounded-2xl border border-[#44475a66] bg-[#0b0b14] p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)];
		width: min(1200px, 94vw);
		scrollbar-width: thin;
	}
	.stage.compact .canvas-holder {
		height: min(42vh, 400px);
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
		height: min(56vh, 600px);
	}
	.canvas-holder :global(.canvas-box) {
		height: 100%;
		width: auto;
		max-width: 100%;
	}
	@media (max-width: 1023px) {
		/* stacked mobile layout: canvas flows with width, no fixed height */
		.canvas-holder {
			height: auto;
		}
		.canvas-holder :global(.canvas-box) {
			height: auto;
			width: 100%;
		}
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
	.card ul li {
		@apply m-0 block leading-snug;
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
