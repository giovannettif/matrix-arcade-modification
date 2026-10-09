<script>
	import { Canvas } from '@threlte/core';
	import Scene from './Scene.svelte';
	import DetScene from './det/DetScene.svelte';
	import Det3DScene from './det/Det3DScene.svelte';
  import * as THREE from 'three';

  // Make the z-axis the "up/down" axis
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1)
</script>

<Canvas colorManagementEnabled={true} rendererParameters={{ webgl1: true, logarithmicDepthBuffer: false }}>
	<Scene />
	<!-- CS375: determinant shapes on the same grid -->
	<DetScene />
	<!-- CS375: the 3D determinant story (P5.1) shares the canvas + Z-up world -->
	<Det3DScene />
</Canvas>
