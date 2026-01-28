"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Camera3DViewerProps {
  horizontalRotation: number;
  verticalAngle: number;
  distance: number;
  image?: string | null;
  onAngleChange?: (horizontal: number, vertical: number, distance: number) => void;
  readOnly?: boolean;
}

export function Camera3DViewer({
  horizontalRotation,
  verticalAngle,
  distance,
  image,
  onAngleChange,
  readOnly = false,
}: Camera3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用 ref 来存储内部实时值
  const liveValuesRef = useRef({ azimuth: horizontalRotation, elevation: verticalAngle, zoom: distance });
  const updateVisualsRef = useRef<(() => void) | null>(null);
  const updateImageRef = useRef<((url: string | null) => void) | null>(null);

  // 保存 Three.js 对象的引用，供外部事件处理器使用
  const threeObjectsRef = useRef<{
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    camera: THREE.Camera;
    renderer: THREE.WebGLRenderer;
    handles: Array<{ mesh: THREE.Mesh; glow: THREE.Mesh; name: 'azimuth' | 'elevation' | 'distance' }>;
    container: HTMLDivElement;
    CENTER: THREE.Vector3;
    AZIMUTH_RADIUS: number;
    ELEVATION_RADIUS: number;
    ELEV_ARC_X: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragTargetRef = useRef<"azimuth" | "elevation" | "distance" | null>(null);

  // React 事件处理器 - 在容器 div 上处理
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;

    console.log('[Camera3DViewer] React onPointerDown', { pointerId: e.pointerId });

    const three = threeObjectsRef.current;
    if (!three) return;

    // 阻止事件冒泡到 React Flow
    e.preventDefault();
    e.stopPropagation();

    // 计算鼠标位置
    const rect = three.renderer.domElement.getBoundingClientRect();
    three.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    three.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    three.raycaster.setFromCamera(three.mouse, three.camera);

    // 检查是否击中手柄
    for (const h of three.handles) {
      const intersects = three.raycaster.intersectObject(h.mesh);
      console.log('[Camera3DViewer] Checking handle', h.name, 'intersects:', intersects.length);
      if (intersects.length > 0) {
        console.log('[Camera3DViewer] Dragging handle:', h.name);
        setIsDragging(true);
        dragTargetRef.current = h.name;
        h.mesh.scale.setScalar(1.3);
        h.glow.scale.setScalar(1.3);
        return;
      }
    }
    console.log('[Camera3DViewer] No handle clicked');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;

    const three = threeObjectsRef.current;
    if (!three) return;

    e.preventDefault();
    e.stopPropagation();

    // 计算鼠标位置
    const rect = three.renderer.domElement.getBoundingClientRect();
    three.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    three.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    three.raycaster.setFromCamera(three.mouse, three.camera);

    if (!isDragging) {
      // 处理悬停状态
      let foundHover: typeof three.handles[0] | null = null;
      for (const h of three.handles) {
        if (three.raycaster.intersectObject(h.mesh).length > 0) {
          foundHover = h;
          break;
        }
      }

      if (foundHover) {
        three.container.style.cursor = 'grab';
      } else {
        three.container.style.cursor = 'default';
      }
      return;
    }

    // 处理拖动
    const plane = new THREE.Plane();
    const intersect = new THREE.Vector3();

    if (dragTargetRef.current === 'azimuth') {
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
      if (three.raycaster.ray.intersectPlane(plane, intersect)) {
        let angle = Math.atan2(intersect.x, intersect.z) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        liveValuesRef.current.azimuth = Math.round(angle);
        onAngleChange?.(liveValuesRef.current.azimuth, liveValuesRef.current.elevation, liveValuesRef.current.zoom);
        updateVisualsRef.current?.();
      }
    } else if (dragTargetRef.current === 'elevation') {
      const elevPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -three.ELEV_ARC_X);
      if (three.raycaster.ray.intersectPlane(elevPlane, intersect)) {
        const relY = intersect.y - three.CENTER.y;
        const relZ = intersect.z;
        let angle = Math.atan2(relY, relZ) * (180 / Math.PI);
        angle = Math.max(-30, Math.min(90, angle));
        liveValuesRef.current.elevation = Math.round(angle);
        onAngleChange?.(liveValuesRef.current.azimuth, liveValuesRef.current.elevation, liveValuesRef.current.zoom);
        updateVisualsRef.current?.();
      }
    } else if (dragTargetRef.current === 'distance') {
      const newDist = 5 - three.mouse.y * 5;
      const clampedDist = Math.max(0.1, Math.min(10.0, newDist));
      liveValuesRef.current.zoom = Math.round(clampedDist * 10) / 10;
      onAngleChange?.(liveValuesRef.current.azimuth, liveValuesRef.current.elevation, liveValuesRef.current.zoom);
      updateVisualsRef.current?.();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;

    const three = threeObjectsRef.current;
    if (!three) return;

    e.preventDefault();
    e.stopPropagation();

    if (isDragging) {
      three.handles.forEach(h => {
        h.mesh.scale.setScalar(1.0);
        h.glow.scale.setScalar(1.0);
      });
    }
    setIsDragging(false);
    dragTargetRef.current = null;
    three.container.style.cursor = 'default';
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 400;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18181f);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(4, 3.5, 4);
    camera.lookAt(0, 0.3, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.classList.add('nodrag');
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.pointerEvents = 'none'; // 让 canvas 不接收事件，由容器处理
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
    mainLight.position.set(5, 10, 5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xE93D82, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Grid
    const gridHelper = new THREE.GridHelper(5, 20, 0x333344, 0x22222a);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Constants
    const CENTER = new THREE.Vector3(0, 0.5, 0);
    const AZIMUTH_RADIUS = 1.8;
    const ELEVATION_RADIUS = 1.4;
    const ELEV_ARC_X = -0.8;

    // Subject (image plane)
    const planeGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x3a3a4a, side: THREE.DoubleSide });
    const imagePlane = new THREE.Mesh(planeGeo, planeMat);
    imagePlane.position.copy(CENTER);
    scene.add(imagePlane);

    const frameGeo = new THREE.EdgesGeometry(planeGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0xE93D82 });
    const imageFrame = new THREE.LineSegments(frameGeo, frameMat);
    imageFrame.position.copy(CENTER);
    scene.add(imageFrame);

    // Glow ring
    const glowRingGeo = new THREE.RingGeometry(0.55, 0.58, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xE93D82, transparent: true, opacity: 0.4, side: THREE.DoubleSide
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.position.set(0, 0.01, 0);
    glowRing.rotation.x = -Math.PI / 2;
    scene.add(glowRing);

    // Camera Indicator
    const camGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
    const camMat = new THREE.MeshStandardMaterial({
      color: 0xE93D82, emissive: 0xE93D82, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2
    });
    const cameraIndicator = new THREE.Mesh(camGeo, camMat);
    scene.add(cameraIndicator);

    const camGlowGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const camGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff6ba8, transparent: true, opacity: 0.8
    });
    const camGlow = new THREE.Mesh(camGlowGeo, camGlowMat);
    scene.add(camGlow);

    // Controls Group
    const controlsGroup = new THREE.Group();
    scene.add(controlsGroup);

    // Azimuth Controls
    const azRingGeo = new THREE.TorusGeometry(AZIMUTH_RADIUS, 0.04, 16, 100);
    const azRingMat = new THREE.MeshBasicMaterial({ color: 0xE93D82, transparent: true, opacity: 0.7 });
    const azimuthRing = new THREE.Mesh(azRingGeo, azRingMat);
    azimuthRing.rotation.x = Math.PI / 2;
    azimuthRing.position.y = 0.02;
    controlsGroup.add(azimuthRing);

    const azHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const azHandleMat = new THREE.MeshStandardMaterial({
      color: 0xE93D82, emissive: 0xE93D82, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4
    });
    const azimuthHandle = new THREE.Mesh(azHandleGeo, azHandleMat);
    controlsGroup.add(azimuthHandle);

    const azGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const azGlowMat = new THREE.MeshBasicMaterial({ color: 0xE93D82, transparent: true, opacity: 0.2 });
    const azGlow = new THREE.Mesh(azGlowGeo, azGlowMat);
    controlsGroup.add(azGlow);

    // Elevation Controls
    const arcPoints = [];
    for (let i = 0; i <= 32; i++) {
      const angle = (-30 + (120 * i / 32)) * Math.PI / 180;
      arcPoints.push(new THREE.Vector3(
        ELEV_ARC_X,
        ELEVATION_RADIUS * Math.sin(angle) + CENTER.y,
        ELEVATION_RADIUS * Math.cos(angle)
      ));
    }
    const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
    const elArcGeo = new THREE.TubeGeometry(arcCurve, 32, 0.04, 8, false);
    const elArcMat = new THREE.MeshBasicMaterial({ color: 0x00FFD0, transparent: true, opacity: 0.8 });
    const elevationArc = new THREE.Mesh(elArcGeo, elArcMat);
    controlsGroup.add(elevationArc);

    const elHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const elHandleMat = new THREE.MeshStandardMaterial({
      color: 0x00FFD0, emissive: 0x00FFD0, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4
    });
    const elevationHandle = new THREE.Mesh(elHandleGeo, elHandleMat);
    controlsGroup.add(elevationHandle);

    const elGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const elGlowMat = new THREE.MeshBasicMaterial({ color: 0x00FFD0, transparent: true, opacity: 0.2 });
    const elGlow = new THREE.Mesh(elGlowGeo, elGlowMat);
    controlsGroup.add(elGlow);

    // Distance Controls
    const distHandleGeo = new THREE.SphereGeometry(0.15, 32, 32);
    const distHandleMat = new THREE.MeshStandardMaterial({
      color: 0xFFB800, emissive: 0xFFB800, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3
    });
    const distanceHandle = new THREE.Mesh(distHandleGeo, distHandleMat);
    controlsGroup.add(distanceHandle);

    const distGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const distGlowMat = new THREE.MeshBasicMaterial({ color: 0xFFB800, transparent: true, opacity: 0.25 });
    const distGlow = new THREE.Mesh(distGlowGeo, distGlowMat);
    controlsGroup.add(distGlow);

    let distanceTube: THREE.Mesh | null = null;
    const updateDistanceLine = (start: THREE.Vector3, end: THREE.Vector3) => {
      if (distanceTube) controlsGroup.remove(distanceTube);
      const path = new THREE.LineCurve3(start, end);
      const tubeGeo = new THREE.TubeGeometry(path, 1, 0.025, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xFFB800, transparent: true, opacity: 0.8 });
      distanceTube = new THREE.Mesh(tubeGeo, tubeMat);
      controlsGroup.add(distanceTube);
    };

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Handles array
    const handles = [
      { mesh: azimuthHandle, glow: azGlow, name: 'azimuth' as const },
      { mesh: elevationHandle, glow: elGlow, name: 'elevation' as const },
      { mesh: distanceHandle, glow: distGlow, name: 'distance' as const }
    ];

    // Load image function
    const updateImage = (url: string | null | undefined) => {
      if (url) {
        const img = new Image();
        if (!url.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
          const tex = new THREE.Texture(img);
          tex.needsUpdate = true;
          tex.colorSpace = THREE.SRGBColorSpace;
          planeMat.map = tex;
          planeMat.color.set(0xffffff);
          planeMat.needsUpdate = true;

          const ar = img.width / img.height;
          const maxSize = 1.5;
          let scaleX: number, scaleY: number;
          if (ar > 1) { scaleX = maxSize; scaleY = maxSize / ar; }
          else { scaleY = maxSize; scaleX = maxSize * ar; }
          imagePlane.scale.set(scaleX, scaleY, 1);
          imageFrame.scale.set(scaleX, scaleY, 1);
        };
        img.src = url;
      } else {
        planeMat.map = null;
        planeMat.color.set(0x3a3a4a);
        planeMat.needsUpdate = true;
        imagePlane.scale.set(1, 1, 1);
        imageFrame.scale.set(1, 1, 1);
      }
    };
    updateImage(image);

    // Update Visuals function
    const updateVisuals = () => {
      const live = liveValuesRef.current;
      const azRad = (live.azimuth * Math.PI) / 180;
      const elRad = (live.elevation * Math.PI) / 180;
      const visualDist = 1.2 + (live.zoom * 0.22);

      const camX = visualDist * Math.sin(azRad) * Math.cos(elRad);
      const camY = CENTER.y + visualDist * Math.sin(elRad);
      const camZ = visualDist * Math.cos(azRad) * Math.cos(elRad);
      const camPos = new THREE.Vector3(camX, camY, camZ);

      cameraIndicator.position.copy(camPos);
      cameraIndicator.lookAt(CENTER);
      cameraIndicator.rotateX(Math.PI / 2);
      camGlow.position.copy(cameraIndicator.position);

      // Azimuth Handle
      const azX = AZIMUTH_RADIUS * Math.sin(azRad);
      const azZ = AZIMUTH_RADIUS * Math.cos(azRad);
      azimuthHandle.position.set(azX, 0.16, azZ);
      azGlow.position.copy(azimuthHandle.position);

      // Elevation Handle
      const elY = CENTER.y + ELEVATION_RADIUS * Math.sin(elRad);
      const elZ = ELEVATION_RADIUS * Math.cos(elRad);
      elevationHandle.position.set(ELEV_ARC_X, elY, elZ);
      elGlow.position.copy(elevationHandle.position);

      // Distance Handle
      const distT = 0.2 + (live.zoom / 10.0) * 0.6;
      distanceHandle.position.lerpVectors(CENTER, cameraIndicator.position, distT);
      distGlow.position.copy(distanceHandle.position);

      updateDistanceLine(CENTER.clone(), cameraIndicator.position.clone());
      glowRing.rotation.z += 0.005;
    };

    // 保存引用
    threeObjectsRef.current = {
      raycaster,
      mouse,
      camera,
      renderer,
      handles,
      container,
      CENTER,
      AZIMUTH_RADIUS,
      ELEVATION_RADIUS,
      ELEV_ARC_X,
    };

    updateVisualsRef.current = updateVisuals;
    updateImageRef.current = updateImage;
    updateVisuals();

    // Animation loop
    let time = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      time += 0.01;
      const pulse = 1 + Math.sin(time * 2) * 0.03;
      camGlow.scale.setScalar(pulse);
      glowRing.rotation.z += 0.003;
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      threeObjectsRef.current = null;
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []); // 空依赖，只在挂载时运行

  // 当 props 变化时，更新实时值并刷新视觉效果
  useEffect(() => {
    liveValuesRef.current = {
      azimuth: horizontalRotation,
      elevation: verticalAngle,
      zoom: distance
    };
    if (updateVisualsRef.current) {
      updateVisualsRef.current();
    }
  }, [horizontalRotation, verticalAngle, distance]);

  // Update image when changed
  useEffect(() => {
    if (updateImageRef.current) {
      updateImageRef.current(image ?? null);
    }
  }, [image]);

  return (
    <div
      ref={containerRef}
      className="nodrag nopan w-full bg-[#18181f] rounded-lg overflow-hidden"
      style={{ height: 400, touchAction: 'none', pointerEvents: 'auto' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
