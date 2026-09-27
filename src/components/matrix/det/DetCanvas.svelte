<script>
	import {
		detEntries,
		detValue,
		detArea,
		detChapter,
		detPlayhead,
		detCollapsed,
		detFlipped
	} from "$stores/det.js";

	// Palette (dracula-compatible, matched to the reference mockup)
	const COL_A = "#ffb86c"; // first column / T(e1) — orange
	const COL_B = "#50fa7b"; // second column / T(e2) — green
	const CYAN = "#04d4f0"; // transformed shape
	const PURPLE = "#bd93f9"; // collapse line
	const PINK = "#ff79c6"; // flipped fill

	const W = 720;
	const H = 640;
	const S = 88; // px per unit
	const OX = 320;
	const OY = 330;

	const px = (x) => OX + x * S;
	const py = (y) => OY - y * S;
	const pcx = (x) => (px(x) / W) * 100;
	const pcy = (y) => (py(y) / H) * 100;

	const gridLines = [-3, -2, -1, 1, 2, 3];
	const ticks = [-2, -1, 1, 2];

	// two sample points from the original square, for the collapse story:
	// under [[1,2],[2,4]] both land on the SAME point (they differ by a
	// null-space vector (2,-1)·0.12), which is exactly why no inverse exists
	const samples = [
		{ p: [0.5, 0.4], c: "#f1fa8c" },
		{ p: [0.74, 0.28], c: "#ff79c6" }
	];

	$: m = $detEntries;
	$: col1 = [m[0], m[2]];
	$: col2 = [m[1], m[3]];
	$: verts = [
		[0, 0],
		col1,
		[col1[0] + col2[0], col1[1] + col2[1]],
		col2
	];
	$: polyPoints = verts.map(([x, y]) => `${px(x)},${py(y)}`).join(" ");
	$: diagEnd = [col1[0] + col2[0], col1[1] + col2[1]];
	$: images = samples.map(({ p }) => [
		m[0] * p[0] + m[1] * p[1],
		m[2] * p[0] + m[3] * p[1]
	]);
	$: imageGap = Math.hypot(
		images[0][0] - images[1][0],
		images[0][1] - images[1][1]
	);
	$: showCallout = $detChapter === 2 && $detPlayhead > 0.7 && $detCollapsed;
	$: shapeFill = $detCollapsed
		? "transparent"
		: $detFlipped
			? "rgba(255,121,198,0.22)"
			: "rgba(4,212,240,0.22)";
	$: shapeStroke = $detFlipped ? PINK : CYAN;
	$: areaLabelPos = {
		x: pcx((col1[0] + col2[0]) / 2),
		y: pcy((col1[1] + col2[1]) / 2)
	};
	$: calloutPos = { x: pcx(images[0][0]), y: pcy(images[0][1]) };
</script>

<div class="canvas-box relative">
	<svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet">
		{#each gridLines as g (g)}
			<line class="grid" x1={px(g)} y1={py(-3)} x2={px(g)} y2={py(3)} />
			<line class="grid" x1={px(-3)} y1={py(g)} x2={px(3)} y2={py(g)} />
		{/each}

		<line class="axis" x1={px(-3)} y1={py(0)} x2={px(3)} y2={py(0)} marker-end="url(#arrowAxis)" />
		<line class="axis" x1={px(0)} y1={py(-3)} x2={px(0)} y2={py(3)} marker-end="url(#arrowAxis)" />
		<text class="axis-label" x={px(3) - 2} y={py(0) + 26}>x</text>
		<text class="axis-label" x={px(0) + 12} y={py(3) + 6}>y</text>
		{#each ticks as t (t)}
			<text class="tick" x={px(t) - 8} y={py(0) + 24}>{t}</text>
			<text class="tick" x={px(0) + 10} y={py(t) + 5}>{t}</text>
		{/each}

		<!-- original unit square (ghost) -->
		<polygon
			class="ghost"
			points="{px(0)},{py(0)} {px(1)},{py(0)} {px(1)},{py(1)} {px(0)},{py(1)}"
		/>

		<!-- collapsed plane: glowing line through the origin -->
		{#if $detCollapsed}
			<line
				x1={px(0)}
				y1={py(0)}
				x2={px(diagEnd[0])}
				y2={py(diagEnd[1])}
				stroke={PURPLE}
				stroke-width="5"
				stroke-linecap="round"
				style="filter: drop-shadow(0 0 9px {PURPLE})"
			/>
		{/if}

		<!-- transformed unit square -->
		<polygon points={polyPoints} style:fill={shapeFill} style:stroke={shapeStroke} class="shape" />

		<!-- column vectors -->
		<line
			x1={px(0)} y1={py(0)}
			x2={px(col1[0])} y2={py(col1[1])}
			stroke={COL_A}
			stroke-width="4"
			marker-end="url(#arrowA)"
			style="filter: drop-shadow(0 0 6px {COL_A})"
		/>
		<line
			x1={px(0)} y1={py(0)}
			x2={px(col2[0])} y2={py(col2[1])}
			stroke={COL_B}
			stroke-width="4"
			marker-end="url(#arrowB)"
			style="filter: drop-shadow(0 0 6px {COL_B})"
		/>

		<!-- sample points: originals + their images -->
		{#each samples as s, i (i)}
			<circle cx={px(s.p[0])} cy={py(s.p[1])} r="5" fill={s.c} opacity="0.85" />
			<circle
				cx={px(images[i][0])}
				cy={py(images[i][1])}
				r="6"
				fill={s.c}
				stroke="#0b0b14"
				stroke-width="1.5"
				style="filter: drop-shadow(0 0 5px {s.c})"
			/>
		{/each}

		<defs>
			<marker id="arrowAxis" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#f8f8f2" />
			</marker>
			<marker id="arrowA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill={COL_A} />
			</marker>
			<marker id="arrowB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill={COL_B} />
			</marker>
		</defs>
	</svg>

	<!-- HTML overlays -->
	{#if !$detCollapsed}
		<div
			class="area-label"
			style:left="{areaLabelPos.x}%"
			style:top="{areaLabelPos.y}%"
		>
			area = {$detArea.toFixed(1)}
		</div>
	{/if}

	{#if $detFlipped}
		<div class="flip-badge">↺ orientation reversed</div>
	{/if}

	{#if showCallout && imageGap < 0.35}
		<div
			class="callout"
			style:left="{calloutPos.x}%"
			style:top="{calloutPos.y}%"
		>
			Which point did this come from?
			<b>Ambiguous — no inverse exists.</b>
		</div>
	{/if}
</div>

<style lang="postcss">
	.canvas-box {
		aspect-ratio: 720 / 640;
		width: 100%;
		margin-inline: auto;
	}
	svg {
		@apply block h-full w-full;
	}
	.grid {
		stroke: #44475a;
		stroke-width: 1;
		opacity: 0.45;
	}
	.axis {
		stroke: #f8f8f2;
		stroke-width: 2;
	}
	.axis-label,
	.tick {
		font-family: "Old Standard TT", serif;
		font-style: italic;
		fill: #a9abc0;
	}
	.axis-label {
		font-size: 26px;
	}
	.tick {
		font-size: 16px;
		fill: #6272a4;
	}
	.ghost {
		fill: transparent;
		stroke: #6272a4;
		stroke-width: 1.5;
		stroke-dasharray: 6 5;
		opacity: 0.8;
	}
	.shape {
		stroke-width: 2.5;
		stroke-linejoin: round;
		transition: fill 0.4s, stroke 0.4s;
		filter: drop-shadow(0 0 10px rgba(4, 212, 240, 0.35));
	}

	.area-label {
		@apply absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-0.5 font-serif text-lg;
		border-color: rgba(4, 212, 240, 0.6);
		color: #8be9fd;
		background: rgba(10, 10, 20, 0.75);
	}
	.flip-badge {
		@apply absolute left-4 top-4 rounded-md border-2 px-3 py-1.5 font-sans text-sm font-bold;
		border-color: #ff79c6;
		color: #ff79c6;
		background: rgba(10, 10, 20, 0.8);
		box-shadow: 0 0 14px rgba(255, 121, 198, 0.4);
	}
	.callout {
		@apply absolute w-52 -translate-x-1/2 -translate-y-[130%] rounded-lg px-3 py-2 text-left font-sans text-xs leading-snug text-[#101018];
		background: #f8f8f2;
		box-shadow: 0 0 18px rgba(248, 248, 242, 0.35);
	}
	.callout b {
		@apply block pt-1;
		color: #7c1fa2;
	}
</style>
