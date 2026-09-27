<script>
	export let value = 0;
	export let size = "md"; // "sm" | "md"

	$: collapsed = Math.abs(value) < 0.05;
	$: flipped = value < -0.05;
	$: tone = collapsed ? "purple" : flipped ? "pink" : "blue";
	$: styles = {
		blue: { c: "#8be9fd", glow: "rgba(139,233,253,0.4)" },
		purple: { c: "#bd93f9", glow: "rgba(189,147,249,0.45)" },
		pink: { c: "#ff79c6", glow: "rgba(255,121,198,0.45)" },
		green: { c: "#50fa7b", glow: "rgba(80,250,123,0.45)" },
		red: { c: "#ff5555", glow: "rgba(255,85,85,0.45)" }
	}[tone];
	$: display = collapsed ? "0.0" : value.toFixed(1);
	$: area = Math.abs(value);
	$: sub = collapsed
		? "the plane is squashed onto one line"
		: Math.abs(area - 2) < 0.06
			? "area doubled"
			: Math.abs(area - 0.5) < 0.04
				? "area halved"
				: Math.abs(area - 1) < 0.05
					? "area unchanged"
					: `area × ${area.toFixed(1)}`;
</script>

<div
	class="chip {size}"
	style:border-color={styles.c}
	style:box-shadow={`0 0 16px ${styles.glow}, inset 0 0 10px ${styles.glow}`}
>
	<div class="value" style:color={styles.c}>det(A) = {display}</div>
	<div class="sub">
		{sub}{flipped ? " · orientation reversed" : ""}
	</div>
</div>

<style lang="postcss">
	.chip {
		@apply rounded-lg border-2 bg-[#0d0d16]/90 px-4 py-2 text-left;
		transition: border-color 0.3s, box-shadow 0.3s;
	}
	.value {
		@apply font-serif text-2xl font-bold leading-tight;
	}
	.sub {
		@apply font-sans text-xs text-neutral-content;
	}
	.chip.sm .value {
		@apply text-lg;
	}
	.chip.sm .sub {
		@apply text-[10px];
	}
</style>
